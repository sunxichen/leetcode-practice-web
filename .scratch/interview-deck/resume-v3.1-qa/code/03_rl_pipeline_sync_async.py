"""
03_rl_pipeline_sync_async.py — RL 同步/异步训练流程与训推对齐校验白板手写代码

覆盖题目编号：
- C06: 完整同步 RL 训练流程闭环 (SyncRLPipelineTrainer)
- C07: Async RL 有界陈旧 + 版本租约 (AsyncRLCoordinator, AdapterVersionLease)
- C08: 训推一致性 Token-diff 校验器 (token_diff_validator, batch_token_diff_gate)
"""

from __future__ import annotations

import math
from typing import Any, Callable


# ==============================================================================
# C06: 完整同步 RL 训练流程闭环 (Strict Serial Scheduling)
# ==============================================================================

class MockModelServer:
    """模拟 Rollout 推理服务端，支持并发交互与 Merged 权重热加载。"""

    def __init__(self, version: int = 0) -> None:
        self.version = version

    def rollout_concurrent(self, scenarios: list[dict[str, Any]], group_size_k: int) -> list[dict[str, Any]]:
        # 并发对每个场景生成 K 条交互轨迹
        trajectories = []
        for s in scenarios:
            base_reward = s.get("base_reward", 0.5)
            for k in range(group_size_k):
                # 模拟 K 条不同探索轨迹得分
                noise = (k - (group_size_k - 1) / 2.0) * 0.2
                r = max(0.0, min(1.0, base_reward + noise))
                trajectories.append({
                    "task_id": s["task_id"],
                    "group_id": s["group_id"],
                    "reward": r,
                    "tokens": [100, 200, 300],
                    "mask": [1, 1, 1],
                    "new_logp": [-0.5, -0.4, -0.3],
                    "old_logp": [-0.6, -0.4, -0.2],
                })
        return trajectories

    def hot_reload_weights(self, new_version: int) -> None:
        # 同步重载最新权重
        self.version = new_version


class SyncRLPipelineTrainer:
    # 考察点: 完整同步 RL 训练流程闭环、组采样-并发Rollout-打分-方差过滤-梯度更新-权重同步
    # 手写量级: 50 行 / 10 分钟
    # 常见追问: 串行同步训练各阶段的耗时瓶颈在哪？Rollout 与 Trainer 怎么分卡？期中评测与门禁设计？

    def __init__(
        self,
        model_server: MockModelServer,
        task_pool: list[dict[str, Any]],
        group_size_k: int = 8,
        n_norm: float = 2560.0,
        eval_interval: int = 5,
    ) -> None:
        self.model_server = model_server
        self.task_pool = task_pool
        self.group_size_k = group_size_k
        self.n_norm = n_norm
        self.eval_interval = eval_interval
        self.current_step = 0
        self.weights_version = 0

    def step(self, scenarios: list[dict[str, Any]]) -> dict[str, Any]:
        # 1. 并发 Rollout 收集 K 条轨迹: gather_trajectory_groups(K)
        trajectories = self.model_server.rollout_concurrent(scenarios, self.group_size_k)

        # 2. 组织分组与计算奖励方差
        groups: dict[int, list[dict[str, Any]]] = {}
        for traj in trajectories:
            groups.setdefault(traj["group_id"], []).append(traj)

        # 3. 动态过滤零方差组 (全对/全错组无梯度学习信号)
        valid_trajectories: list[dict[str, Any]] = []
        dropped_groups_count = 0
        for g_id, g_trajs in groups.items():
            r_list = [t["reward"] for t in g_trajs]
            mean = sum(r_list) / len(r_list)
            var = sum((r - mean) ** 2 for r in r_list) / len(r_list)
            if var > 1e-7:  # 保留非零方差组
                # 4. 计算组相对优势 A_i = (R_i - mean) / (std + eps)
                std = math.sqrt(var)
                for t in g_trajs:
                    t["advantage"] = (t["reward"] - mean) / (std + 1e-8)  # A = (R - mean) / (std + eps)
                    valid_trajectories.append(t)
            else:
                dropped_groups_count += 1

        # 5. Token 级 CISPO 损失计算与梯度更新
        loss = 0.0
        mask_sum = 0
        for t in valid_trajectories:
            adv = t["advantage"]
            for lp_new, lp_old, m in zip(t["new_logp"], t["old_logp"], t["mask"]):
                if m:
                    ratio = math.exp(lp_new - lp_old)  # ratio = exp(new - old)
                    clipped_w = min(max(ratio, 0.0), 5.0)  # clip(ratio, 0, 5).detach()
                    loss += -(clipped_w * adv * lp_new)  # loss = - weight.detach() * A * logp
                    mask_sum += 1

        floored_denom = max(mask_sum, self.n_norm)  # max(mask_sum, N_norm)
        final_loss = loss / floored_denom if floored_denom > 0 else 0.0

        # 6. 模拟反向传播与优化器更新
        self.weights_version += 1
        # 7. 权重同步到推理服务端 (Merged 模式单份权重原子热推)
        self.model_server.hot_reload_weights(self.weights_version)

        # 8. 期中评测与门禁检查
        self.current_step += 1
        eval_triggered = (self.current_step % self.eval_interval == 0)

        return {
            "step": self.current_step,
            "loss": final_loss,
            "valid_trajectories": len(valid_trajectories),
            "dropped_groups": dropped_groups_count,
            "weights_version": self.weights_version,
            "eval_triggered": eval_triggered,
        }


# ==============================================================================
# C07: Async RL 有界陈旧 + 版本租约 (Bounded Staleness & Lease)
# ==============================================================================

class AdapterVersionLease:
    """管理在途多轮交互对特定策略版本的租约引用计数。"""

    def __init__(self, version_id: int) -> None:
        self.version_id = version_id
        self.active_turns = 0  # 当前在途正在使用该版本的 turn 请求数
        self.status = "active"  # "active" | "draining" | "released"


class AsyncRLCoordinator:
    # 考察点: 异步 RL 有界陈旧调度 (max_steps_off_policy=1)、Adapter 版本租约与引用计数、排空屏障 (Drain Barrier)
    # 手写量级: 45 行 / 8 分钟
    # 常见追问: 为什么 Merged 权重模式下异步必然 404？k=1 有界陈旧的废弃率代价？如何通过排空屏障避免请求截断？

    # 架构关键口径：Merged 单份权重下多轮在途请求旧版本 adapter 404 是机制冲突非陈旧度问题

    def __init__(self, max_steps_off_policy: int = 1) -> None:
        self.current_policy_version = 0
        self.max_steps_off_policy = max_steps_off_policy  # 有界陈旧上限 k=1
        self.leases: dict[int, AdapterVersionLease] = {
            0: AdapterVersionLease(0)
        }

    def acquire_turn_lease(self, version_id: int) -> bool:
        """在途多轮交互的某一轮发起推理前，申请持有对应版本的租约。"""
        lease = self.leases.get(version_id)
        if lease is None or lease.status == "released":
            return False  # 该版本已被销毁，无法使用
        lease.active_turns += 1
        return True

    def release_turn_lease(self, version_id: int) -> None:
        """某一轮交互完成，归还租约引用计数。"""
        lease = self.leases.get(version_id)
        if lease:
            lease.active_turns = max(0, lease.active_turns - 1)

    def validate_sample_staleness(self, sample_policy_version: int) -> tuple[bool, str]:
        """训练侧消费轨迹前，检查策略陈旧度（Staleness = V_train - V_sample）。"""
        staleness = self.current_policy_version - sample_policy_version
        if staleness > self.max_steps_off_policy:
            # 超过有界陈旧门槛，判定为过期无效数据直接丢弃
            return False, f"STALE_DISCARD: staleness {staleness} > limit {self.max_steps_off_policy}"
        return True, f"VALID_SAMPLE: staleness {staleness} <= limit {self.max_steps_off_policy}"

    def advance_trainer_version(self) -> int:
        """训练器完成一步梯度更新，策略版本推进，旧版本进入 draining 状态。"""
        old_v = self.current_policy_version
        self.current_policy_version += 1
        new_v = self.current_policy_version

        # 注册新版本租约
        self.leases[new_v] = AdapterVersionLease(new_v)
        # 将超期旧版本标记为排空中
        stale_threshold = new_v - self.max_steps_off_policy
        for v, lease in self.leases.items():
            if v < stale_threshold and lease.status == "active":
                lease.status = "draining"
        return new_v

    def drain_barrier(self, version_id: int) -> bool:
        """排空屏障：等待在途请求全部退出后，安全释放显存并卸载权重。"""
        lease = self.leases.get(version_id)
        if lease and lease.active_turns == 0:
            lease.status = "released"
            return True  # 排空完毕，可安全卸载
        return False  # 仍有在途请求未退出，屏障拦截，严禁卸载

    def simulate_merged_serving_conflict(self) -> str:
        """演示 Merged 模式单份权重与异步多轮交互的机制冲突（404 根因）。"""
        # Merged 模式服务端物理上只保留单一全量模型名字
        served_models = {"agent-grpo@0": "weights_v0"}

        # Turn 1 启动，在途请求绑定 agent-grpo@0
        in_flight_model_name = "agent-grpo@0"

        # 此时后台 Trainer 异步前进一步，执行权重合并热推，将服务名原地覆写为 v1
        served_models.clear()
        served_models["agent-grpo@1"] = "weights_v1"

        # Turn 2 发起后续交互，试图沿用启动时的模型版本 in_flight_model_name
        if in_flight_model_name not in served_models:
            # 机制冲突爆发：服务端单一名字已被替换，旧版本消失抛出 404！
            return f"HTTP 404 Not Found: Model '{in_flight_model_name}' does not exist!"
        return "SUCCESS"


# ==============================================================================
# C08: 训推一致性 Token-diff 校验器
# ==============================================================================

def token_diff_validator(
    train_tokens: list[int],
    infer_tokens: list[int],
    context_window: int = 3,
) -> dict[str, Any]:
    # 考察点: 训推一致性 (Training-Inference Alignment) Token-diff 门禁、首个分叉索引定位与 Jinja 模板治理
    # 手写量级: 15 行 / 3 分钟
    # 常见追问: 训推 token 分叉的典型诱因？enable_thinking=False 为什么导致违规率飙升？如何编写等价 Jinja 覆盖？

    # 1. 逐位置比对，寻找首个分叉 Token
    min_len = min(len(train_tokens), len(infer_tokens))
    divergence_idx = None
    for idx in range(min_len):
        if train_tokens[idx] != infer_tokens[idx]:
            divergence_idx = idx
            break

    if divergence_idx is None and len(train_tokens) != len(infer_tokens):
        divergence_idx = min_len

    # 2. 完全一致
    if divergence_idx is None:
        return {
            "identical": True,
            "divergence_index": None,
            "message": f"100% IDENTICAL ({len(train_tokens)} tokens)",
        }

    # 3. 提取分叉前后的局部上下文用于根因排查
    start = max(0, divergence_idx - context_window)
    end = min(max(len(train_tokens), len(infer_tokens)), divergence_idx + context_window + 1)
    train_slice = train_tokens[start:end]
    infer_slice = infer_tokens[start:end]

    return {
        "identical": False,
        "divergence_index": divergence_idx,
        "train_slice": train_slice,
        "infer_slice": infer_slice,
        "message": f"DIVERGENT at index {divergence_idx}: train={train_tokens[divergence_idx] if divergence_idx < len(train_tokens) else 'EOF'} vs infer={infer_tokens[divergence_idx] if divergence_idx < len(infer_tokens) else 'EOF'}",
    }


def batch_token_diff_gate(
    samples: list[dict[str, Any]],
    train_encode_fn: Callable[[list[dict[str, str]]], list[int]],
    infer_render_fn: Callable[[list[dict[str, str]]], list[int]],
) -> bool:
    """批量比对发布门禁：全量样本必须 100% IDENTICAL，若存在分叉则阻断发布。"""
    all_passed = True
    for idx, sample in enumerate(samples):
        messages = sample["messages"]
        train_ids = train_encode_fn(messages)
        infer_ids = infer_render_fn(messages)
        diff_res = token_diff_validator(train_ids, infer_ids)
        if not diff_res["identical"]:
            all_passed = False
            print(f"Sample {idx}: FAIL -> {diff_res['message']}")
    return all_passed


# ==============================================================================
# 自测验证入口
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 03_rl_pipeline_sync_async.py 单元测试 ===")

    # 1. 验证 C06 完整同步 RL 训练主循环
    mock_server = MockModelServer(version=0)
    scenarios_pool = [
        {"task_id": "T1", "group_id": 1, "base_reward": 0.6},
        {"task_id": "T2", "group_id": 2, "base_reward": 0.4},
    ]
    pipeline = SyncRLPipelineTrainer(mock_server, scenarios_pool, group_size_k=4, n_norm=10.0, eval_interval=2)

    step_res = pipeline.step(scenarios_pool)
    assert step_res["step"] == 1
    assert step_res["weights_version"] == 1
    assert mock_server.version == 1, "训练步后推理服务权重必须热同步更新"
    assert step_res["eval_triggered"] is False

    # 第二步触发期中评测
    step_res2 = pipeline.step(scenarios_pool)
    assert step_res2["step"] == 2
    assert step_res2["eval_triggered"] is True

    # 2. 验证 C07 异步有界陈旧与版本租约
    coordinator = AsyncRLCoordinator(max_steps_off_policy=1)

    # 初始状态：策略版本为 0
    ok, _ = coordinator.validate_sample_staleness(sample_policy_version=0)
    assert ok is True

    # 推进 1 步：策略版本更新到 1
    coordinator.advance_trainer_version()
    # 采样自版本 0 的数据陈旧度为 1-0 = 1 <= 1，依然允许消费
    ok_k1, _ = coordinator.validate_sample_staleness(sample_policy_version=0)
    assert ok_k1 is True

    # 再推进 1 步：策略版本更新到 2
    coordinator.advance_trainer_version()
    # 采样自版本 0 的数据陈旧度为 2-0 = 2 > 1，触发有界陈旧硬截断丢弃
    ok_stale, msg_stale = coordinator.validate_sample_staleness(sample_policy_version=0)
    assert ok_stale is False
    assert "STALE_DISCARD" in msg_stale

    # 租约引用计数与排空屏障 (Drain Barrier)
    assert coordinator.acquire_turn_lease(version_id=1) is True
    # 存在在途请求时，排空屏障拒绝卸载
    assert coordinator.drain_barrier(version_id=1) is False
    coordinator.release_turn_lease(version_id=1)
    # 引用计数清零后，排空屏障允许卸载释放
    assert coordinator.drain_barrier(version_id=1) is True

    # Merged 模式 404 机制冲突模拟
    conflict_err = coordinator.simulate_merged_serving_conflict()
    assert "404 Not Found" in conflict_err, "Merged 单份权重下多轮旧版本请求必然抛出 404"

    # 3. 验证 C08 Token-diff 校验器
    # 完全一致用例
    toks_a = [151644, 872, 198, 108386, 151645]
    toks_b = [151644, 872, 198, 108386, 151645]
    res_ident = token_diff_validator(toks_a, toks_b)
    assert res_ident["identical"] is True

    # 分叉用例（例如由于 Jinja 误注入空思考标签产生分叉）
    toks_divergent = [151644, 872, 151667, 151668, 151645]  # 第 2 个 token 分叉
    res_div = token_diff_validator(toks_a, toks_divergent)
    assert res_div["identical"] is False
    assert res_div["divergence_index"] == 2

    # 批量门禁自测
    dummy_samples = [
        {"messages": [{"role": "user", "content": "hello"}]},
        {"messages": [{"role": "user", "content": "world"}]},
    ]
    # 一致通过
    pass_gate = batch_token_diff_gate(
        dummy_samples,
        train_encode_fn=lambda m: [1, 2, 3],
        infer_render_fn=lambda m: [1, 2, 3],
    )
    assert pass_gate is True

    # 分叉拦截
    fail_gate = batch_token_diff_gate(
        dummy_samples,
        train_encode_fn=lambda m: [1, 2, 3],
        infer_render_fn=lambda m: [1, 2, 4],
    )
    assert fail_gate is False

    print("=== 03_rl_pipeline_sync_async.py 全部断言自测通过！===")
