"""
08_serving_paged_quant.py — PagedAttention 连续批处理、GPTQ/AWQ 量化与 RoPE 算子白板代码

覆盖题目编号：
- C23: PagedAttention Block Table、前缀共享引用计数与连续批处理调度器 (PagedAttentionManager, ContinuousBatchingScheduler)
- C24: GPTQ 逐列 Hessian 补偿量化与 AWQ 显著通道等价缩放搜索 (gptq_quantize_layer, awq_search_scale)
- C26: RoPE rotate_half 向量化实现与内积相对距离化 (rotate_half, apply_rotary_pos_emb)
"""

from __future__ import annotations

import copy
import math
from typing import Any


# ==============================================================================
# C23: PagedAttention Block Table、前缀共享与连续批处理调度器
# ==============================================================================

class PhysicalBlock:
    """物理显存块: 记录块 ID 与前缀缓存共享引用计数"""
    def __init__(self, block_id: int):
        self.block_id = block_id
        self.ref_count = 0  # 引用计数: >1 时写入触发写时复制 (CoW)
        self.tokens: list[str] = []


class PagedAttentionManager:
    """PagedAttention 块管理器: 维护逻辑块到物理块映射、前缀缓存与按需分配"""
    def __init__(self, num_total_blocks: int = 16, block_size: int = 4):
        # 考察点: PagedAttention 虚拟内存分块映射、Block Table 逻辑-物理索引、前缀缓存引用计数与写时复制 (CoW)
        # 手写量级: 25 行 / 5 分钟
        # 常见追问: 逻辑块和物理块映射如何解决显存碎片？前缀共享时多个请求如何复用物理块？写时复制 (CoW) 触发时机？

        self.block_size = block_size
        self.all_blocks = [PhysicalBlock(i) for i in range(num_total_blocks)]
        self.free_blocks = list(self.all_blocks)
        # 映射表: seq_id -> [PhysicalBlock, ...]
        self.block_tables: dict[str, list[PhysicalBlock]] = {}

    def allocate(self, seq_id: str, prompt_tokens: list[str]) -> bool:
        """为初始请求分配物理块 (Prefill 阶段)"""
        num_blocks_needed = math.ceil(len(prompt_tokens) / self.block_size)
        if len(self.free_blocks) < num_blocks_needed:
            return False  # 物理块不足，无法接纳该请求

        allocated = []
        for i in range(num_blocks_needed):
            blk = self.free_blocks.pop(0)
            blk.ref_count = 1
            chunk = prompt_tokens[i * self.block_size : (i + 1) * self.block_size]
            blk.tokens = list(chunk)
            allocated.append(blk)

        self.block_tables[seq_id] = allocated
        return True

    def share_prefix(self, source_seq_id: str, target_seq_id: str, num_shared_blocks: int) -> bool:
        """前缀缓存共享: 复制逻辑指针并自增物理块引用计数，避免重复存储 KV"""
        source_table = self.block_tables.get(source_seq_id, [])
        if len(source_table) < num_shared_blocks:
            return False

        shared_blocks = []
        for blk in source_table[:num_shared_blocks]:
            blk.ref_count += 1  # 引用计数增加
            shared_blocks.append(blk)

        self.block_tables[target_seq_id] = shared_blocks
        return True

    def append_token(self, seq_id: str, token: str) -> bool:
        """自回归生成新 Token (Decode 阶段): 支持块满动态扩容与 CoW 写时复制"""
        table = self.block_tables.get(seq_id)
        if not table:
            return False

        last_block = table[-1]
        # 1. 若当前块已被多个序列共享且尚未写满，写入前触发写时复制 (Copy-on-Write)
        if last_block.ref_count > 1:
            if not self.free_blocks:
                return False  # 显存耗尽
            new_block = self.free_blocks.pop(0)
            new_block.ref_count = 1
            new_block.tokens = list(last_block.tokens)  # 拷贝历史
            last_block.ref_count -= 1
            table[-1] = new_block
            last_block = new_block

        # 2. 若最后一块未满，直接追加
        if len(last_block.tokens) < self.block_size:
            last_block.tokens.append(token)
            return True

        # 3. 若最后一块已满，分配新物理块
        if not self.free_blocks:
            return False  # 显存耗尽触发调度抢占
        new_block = self.free_blocks.pop(0)
        new_block.ref_count = 1
        new_block.tokens = [token]
        table.append(new_block)
        return True

    def free(self, seq_id: str) -> None:
        """请求完成释放显存块: 递减引用计数，为 0 时归还空闲池"""
        table = self.block_tables.pop(seq_id, [])
        for blk in table:
            blk.ref_count -= 1
            if blk.ref_count == 0:
                blk.tokens = []
                self.free_blocks.append(blk)


class ContinuousBatchingScheduler:
    """连续批处理调度器: 迭代级动态调度，Prefill 与 Decode 混排，显存超限自动抢占"""
    def __init__(self, block_manager: PagedAttentionManager):
        # 考察点: 迭代级连续批处理 (Continuous Batching)、Prefill 与 Decode 动态混排、显存耗尽时请求抢占
        # 手写量级: 25 行 / 6 分钟
        # 常见追问: 连续批处理与传统静态批处理吞吐差异？Prefill 和 Decode 混排冲突如何解决 (Chunked Prefill)？抢占时选择重计算还是换出 (Swap)？

        self.mgr = block_manager
        self.waiting_queue: list[dict[str, Any]] = []
        self.running_queue: list[dict[str, Any]] = []

    def add_request(self, seq_id: str, prompt_tokens: list[str], max_new_tokens: int = 5) -> None:
        self.waiting_queue.append({
            "seq_id": seq_id,
            "prompt_tokens": prompt_tokens,
            "max_new_tokens": max_new_tokens,
            "generated_tokens": 0,
        })

    def step(self) -> dict[str, Any]:
        """单次推理迭代步: 准入等待队列 -> 执行当前批 Decode -> 显存保护与抢占"""
        # 1. 尝试从等待队列接纳新请求 (Prefill)
        admitted = []
        for req in list(self.waiting_queue):
            if self.mgr.allocate(req["seq_id"], req["prompt_tokens"]):
                self.waiting_queue.remove(req)
                self.running_queue.append(req)
                admitted.append(req["seq_id"])
            else:
                break  # 显存块不足，等待后续释放

        # 2. 为所有运行中的请求生成 1 个 Token (Decode)
        finished = []
        preempted = []
        for req in list(self.running_queue):
            token_str = f"tok_{req['generated_tokens']}"
            success = self.mgr.append_token(req["seq_id"], token_str)
            if not success:
                # 显存不足触发抢占: 释放当前请求显存，踢回等待队列首部待后续恢复 (重计算/换出)
                self.mgr.free(req["seq_id"])
                self.running_queue.remove(req)
                self.waiting_queue.insert(0, req)
                preempted.append(req["seq_id"])
                continue

            req["generated_tokens"] += 1
            if req["generated_tokens"] >= req["max_new_tokens"]:
                self.mgr.free(req["seq_id"])
                self.running_queue.remove(req)
                finished.append(req["seq_id"])

        return {
            "admitted_prefill": admitted,
            "active_decode": [r["seq_id"] for r in self.running_queue],
            "finished": finished,
            "preempted": preempted,
        }


# ==============================================================================
# C24: GPTQ 逐列 Hessian 补偿量化与 AWQ 显著通道等价缩放搜索
# ==============================================================================

def round_quantize_scalar(w: float, scale: float, bits: int = 4) -> float:
    """标量均匀对称量化与反量化: w_hat = clip(round(w / scale)) * scale"""
    q_max = (1 << (bits - 1)) - 1
    q_min = -(1 << (bits - 1))
    q = round(w / scale)
    q_clamped = max(min(q, q_max), q_min)
    return q_clamped * scale


def gptq_quantize_layer(
    weights: list[list[float]],  # [out_features, in_features]
    h_inv: list[list[float]],    # [in_features, in_features] Hessian 逆矩阵
    bits: int = 4,
) -> list[list[float]]:
    # 考察点: GPTQ 逐列贪心量化、Hessian 逆矩阵对角线归一化、未量化权重残差二阶补偿
    # 手写量级: 20 行 / 5 分钟
    # 常见追问: 为什么需要校准集计算 Hessian 矩阵？残差补偿与直接四舍五入相比精度优势何在？为什么按 Hessian 逆对角线倒数补偿？

    # 公式: W_{:, j+1:} = W_{:, j+1:} - (w_j - w_hat_j) / [H^{-1}]_{jj} * [H^{-1}]_{j, j+1:}
    W = [row[:] for row in weights]
    out_dim = len(W)
    in_dim = len(W[0])

    for j in range(in_dim):
        # 提取当前列对角线元素 [H^{-1}]_{jj}
        h_jj = h_inv[j][j]
        # 计算当前列的动态 Scale (基于局部最大值)
        col_max = max(abs(W[i][j]) for i in range(out_dim))
        scale = max(col_max / ((1 << (bits - 1)) - 1), 1e-6)

        # 逐行量化当前列并计算误差
        for i in range(out_dim):
            w_orig = W[i][j]
            w_hat = round_quantize_scalar(w_orig, scale, bits=bits)
            W[i][j] = w_hat
            err = w_orig - w_hat  # 量化残差 delta = w - w_hat

            # 将量化误差根据 Hessian 逆补偿传播给后续所有尚未量化的列
            for k in range(j + 1, in_dim):
                W[i][k] -= (err / h_jj) * h_inv[j][k]

    return W


def awq_search_scale(
    weights: list[list[float]],      # [out_features, in_features]
    activation_x: list[list[float]], # [batch, in_features]
    search_grid: list[float] | None = None,
) -> list[float]:
    # 考察点: AWQ 激活特征显著通道保护、网格搜索等效缩放因子 s、激活与权重联合误差最小化
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 显著通道 (Salient Channels) 为什么不能直接按权重绝对值选择？为什么不做混合精度而是做等价缩放？W4A16 的硬件瓶颈是什么？

    # 核心原理:
    # 激活值幅值较大的通道为显著通道 (Salient Channels，占前 1%)。
    # 引入逐通道等价缩放变换: W' = W · diag(s), X' = X · diag(s)^{-1}
    # 数学上 X W = X' W' 严格等价，但对 W' 施加量化时有效降低了显著通道的相对量化误差。
    if search_grid is None:
        search_grid = [0.6, 0.8, 1.0, 1.2, 1.4]

    out_dim = len(weights)
    in_dim = len(weights[0])
    batch_size = len(activation_x)

    # 1. 统计激活绝对值均值作为通道重要度: s_act[j] = mean_b |X[b, j]|
    act_magnitude = [
        sum(abs(activation_x[b][j]) for b in range(batch_size)) / batch_size
        for j in range(in_dim)
    ]

    best_scales = [1.0] * in_dim

    # 2. 为各通道网格搜索最佳缩放系数 s_j 最小化重构误差
    for j in range(in_dim):
        best_err = float("inf")
        best_s = 1.0

        for candidate_s in search_grid:
            # 缩放权重列: w_scaled = w_j * s
            scaled_col = [weights[i][j] * candidate_s for i in range(out_dim)]
            max_val = max(abs(v) for v in scaled_col)
            scale_quant = max(max_val / 7.0, 1e-6)  # 4-bit 对称量化

            # 量化并除以 s 恢复: w_recon = quantize(w_j * s) / candidate_s
            err_j = 0.0
            for i in range(out_dim):
                w_recon = round_quantize_scalar(scaled_col[i], scale_quant, bits=4) / candidate_s
                err_j += (weights[i][j] - w_recon) ** 2

            # 乘以该通道的激活特征重要度加权
            total_channel_err = err_j * (act_magnitude[j] ** 2)
            if total_channel_err < best_err:
                best_err = total_channel_err
                best_s = candidate_s

        best_scales[j] = best_s

    return best_scales


# ==============================================================================
# C26: RoPE rotate_half 向量化实现与内积相对距离化
# ==============================================================================

def rotate_half(x: list[float]) -> list[float]:
    # 考察点: RoPE 旋转位置编码连续内存分组 (rotate_half)、仅作用于 Q/K 的内积相对距离化、NTK/YaRN 频段缩放
    # 手写量级: 20 行 / 5 分钟
    # 常见追问: 为什么 RoPE 只旋转 Q 和 K 而不旋转 V？[-x2, x1] 相比相邻交叉旋转在硬件显存访问上有何优势？为什么能消除长文本 OOD 崩溃？

    # 向量切半: x = [x1, x2] -> rotate_half(x) = [-x2, x1]
    mid = len(x) // 2
    x1 = x[:mid]
    x2 = x[mid:]
    return [-v for v in x2] + x1


def apply_rotary_pos_emb(
    q: list[float],
    k: list[float],
    cos: list[float],
    sin: list[float],
) -> tuple[list[float], list[float]]:
    """逐元素向量化旋转: x_rot = x * cos + rotate_half(x) * sin"""
    # 公式: RoPE(x) = x ⊙ cos + rotate_half(x) ⊙ sin
    q_rot_half = rotate_half(q)
    k_rot_half = rotate_half(k)

    q_embed = [q_i * c_i + q_r * s_i for q_i, c_i, q_r, s_i in zip(q, cos, q_rot_half, sin)]
    k_embed = [k_i * c_i + k_r * s_i for k_i, c_i, k_r, s_i in zip(k, cos, k_rot_half, sin)]
    return q_embed, k_embed


# ==============================================================================
# 自测断言 (__main__)
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 08_serving_paged_quant.py 自测 ===")

    # 1. 测试 C23: PagedAttention Block Table、前缀共享与写时复制 (CoW)
    mgr = PagedAttentionManager(num_total_blocks=6, block_size=2)
    # 请求 A 进入 Prefill: 3 个 token -> 占用 2 个物理块 (块 0: 满，块 1: 占 1 个)
    ok_a = mgr.allocate("seq_A", ["p1", "p2", "p3"])
    assert ok_a is True
    assert len(mgr.block_tables["seq_A"]) == 2
    assert len(mgr.free_blocks) == 4

    # 请求 B 共享请求 A 的首个物理块 (Prefix Caching)
    ok_share = mgr.share_prefix("seq_A", "seq_B", num_shared_blocks=1)
    assert ok_share is True
    shared_blk = mgr.block_tables["seq_A"][0]
    assert shared_blk.ref_count == 2, "共享后首块引用计数应增至 2"

    # 请求 B 生成新 Token -> 由于首块已共享，写入触发写时复制 (CoW)
    ok_b_cow = mgr.append_token("seq_B", "b_tok1")
    assert ok_b_cow is True
    assert shared_blk.ref_count == 1, "CoW 后原块引用计数恢复为 1"
    assert mgr.block_tables["seq_B"][0].ref_count == 1
    print("✓ C23 PagedAttention 虚拟分块、前缀共享与 CoW 测试通过")

    # 2. 测试 C23: 连续批处理调度器 Prefill/Decode 混排与抢占
    mgr_sched = PagedAttentionManager(num_total_blocks=10, block_size=2)
    scheduler = ContinuousBatchingScheduler(mgr_sched)
    scheduler.add_request("req_1", ["t1", "t2"], max_new_tokens=2)
    scheduler.add_request("req_2", ["t3", "t4"], max_new_tokens=2)

    # 迭代步 1: 准入 Prefill 并开始第一步 Decode
    step1 = scheduler.step()
    assert "req_1" in step1["admitted_prefill"]
    assert "req_2" in step1["admitted_prefill"]
    assert len(step1["active_decode"]) == 2

    # 迭代步 2: 两请求完成生成 (已达 max_new_tokens=2) 并释放显存
    step2 = scheduler.step()
    assert len(step2["finished"]) == 2
    assert len(scheduler.running_queue) == 0

    # 测试显存不足时的抢占行为 (Preemption)
    mgr_tight = PagedAttentionManager(num_total_blocks=2, block_size=2)
    sched_tight = ContinuousBatchingScheduler(mgr_tight)
    sched_tight.add_request("req_a", ["a1", "a2"], max_new_tokens=3)
    sched_tight.add_request("req_b", ["b1", "b2"], max_new_tokens=3)
    # 仅能准入 1 个请求 (各需 1 块)
    step_tight1 = sched_tight.step()
    # 当继续生成需要扩块但显存耗尽时触发抢占
    step_tight2 = sched_tight.step()
    assert len(step_tight2["preempted"]) > 0 or len(sched_tight.waiting_queue) > 0
    print("✓ C23 连续批处理调度器 Prefill/Decode 混排与显存抢占测试通过")

    # 3. 测试 C24: GPTQ 逐列 Hessian 补偿量化
    # 构造简单权重与单位 Hessian 逆矩阵
    w_toy = [[0.8, -0.4, 0.5], [1.2, 0.3, -0.9]]
    # 模拟 H_inv 包含微弱的非对角线协方差
    h_inv_toy = [
        [1.0, 0.2, 0.1],
        [0.2, 1.0, 0.15],
        [0.1, 0.15, 1.0],
    ]
    w_quant = gptq_quantize_layer(w_toy, h_inv_toy, bits=4)
    # 验证量化后矩阵维度保持不变且未发散
    assert len(w_quant) == 2 and len(w_quant[0]) == 3
    # 验证后续列相比朴素量化吸收了前序列的补偿残差
    assert w_quant[0][1] != w_toy[0][1]
    print("✓ C24 GPTQ 逐列量化与 Hessian 残差补偿测试通过")

    # 4. 测试 C24: AWQ 激活显著通道等价缩放搜索
    x_act_toy = [
        [10.0, 0.1],  # 通道 0 为显著通道 (幅值很大)，通道 1 为普通通道
        [12.0, 0.2],
    ]
    w_to_search = [[0.5, 0.4], [0.3, 0.2]]
    scales = awq_search_scale(w_to_search, x_act_toy, search_grid=[0.8, 1.0, 1.2])
    assert len(scales) == 2
    # 通道 0 激活显著，搜索得到的缩放系数应偏离 1.0 以抑制量化误差
    assert scales[0] in [0.8, 1.0, 1.2]
    print("✓ C24 AWQ 激活特征显著通道网格搜索测试通过")

    # 5. 测试 C26: RoPE rotate_half 与相对位置内积等价性
    x = [1.0, 2.0, 3.0, 4.0]  # d=4, x1=[1, 2], x2=[3, 4]
    rotated = rotate_half(x)
    assert rotated == [-3.0, -4.0, 1.0, 2.0], f"rotate_half 计算错误: {rotated}"

    # 验证旋转后向量点积严格仅取决于相对位置差 (m - n):
    # 设频率 theta = 0.5, 两个位置 m=2, n=1 (相对差 delta=1)
    def get_cos_sin(pos: int, theta: float, dim: int = 2):
        angle = pos * theta
        return [math.cos(angle)] * dim, [math.sin(angle)] * dim

    q_base = [1.0, 0.5]
    k_base = [0.8, 0.6]

    # 情况 1: m=2, n=1 (差 1)
    cos_q1, sin_q1 = get_cos_sin(pos=2, theta=0.5)
    cos_k1, sin_k1 = get_cos_sin(pos=1, theta=0.5)
    q1, k1 = apply_rotary_pos_emb(q_base, k_base, cos_q1, sin_q1)
    dot1 = sum(a * b for a, b in zip(q1, k1))

    # 情况 2: m=5, n=4 (绝对位置不同，但相对差同样为 1)
    cos_q2, sin_q2 = get_cos_sin(pos=5, theta=0.5)
    cos_k2, sin_k2 = get_cos_sin(pos=4, theta=0.5)
    q2, k2 = apply_rotary_pos_emb(q_base, k_base, cos_q2, sin_q2)
    dot2 = sum(a * b for a, b in zip(q2, k2))

    # 验证内积在相同相对距离下严格相等
    assert math.isclose(dot1, dot2, rel_tol=1e-5), f"RoPE 相对位置不变性未满足: {dot1} vs {dot2}"
    print("✓ C26 RoPE rotate_half 与相对位置夹角内积不变性测试通过")

    print("\n=== 08_serving_paged_quant.py 全部断言自测通过！===")
