"""
01_reward_advantage_passk.py — RL 奖励门控、组优势、采样与评测白板手写代码

覆盖题目编号：
- C01: Reward 乘法门控 (compute_reward)
- C02: GRPO group advantage (group_relative_advantage)
- C03: pass@k 无偏估计 + 组内方差概率 (pass_at_k, prob_non_zero_variance)
- C09: 沙箱执行 + Golden State diff (MockSandbox, strict_success_diff)
- C10: NLI per-message 取 max (nli_max_score)
- C25: 方差感知采样 + 零方差过滤 (variance_aware_sample, filter_zero_variance_groups)
"""

from __future__ import annotations

import copy
import math
import random
from typing import Any, Callable


# ==============================================================================
# C01: Reward 乘法门控 (Terminal-Gated Outcome)
# ==============================================================================

def compute_reward(
    actual_state: dict[str, Any],
    golden_state: dict[str, Any],
    actual_terminal: str,
    expected_terminal: str,
    r_disclosure: float = 1.0,
    p_turns: float = 0.0,
    p_failed: float = 0.0,
    hard_violation: bool = False,
) -> dict[str, Any]:
    # 考察点: 终态乘法门控(Terminal-Gated Outcome)、三值比对(缺一即0)、Hard-Zero、转人工不进总目标
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 为什么不用加分项？No-Write 任务同分博弈如何解决？转人工为什么移出总目标？

    # 1. 安全红线与格式解析门禁 (硬零即时截断)
    if hard_violation:
        return {"r_total": 0.0, "r_complete": 0.0, "success_strict": False}

    # 2. 状态比对: 实际快照包含并匹配期望键值
    r_state = 1.0 if actual_state == golden_state else 0.0  # R_state in {0.0, 1.0}

    # 3. 终态动作三值精确比对 (Finish / Escalate / FinishWithRefusal)
    r_terminal = 1.0 if actual_terminal == expected_terminal else 0.0  # R_terminal in {0.0, 1.0}

    # 4. 乘法门控核心: 终态一致性与数据变更强绑定，缺一即 0
    r_complete = r_state * r_terminal  # R_complete = R_state * R_terminal

    # 5. 总分合成 (转人工由终态门控覆盖，不进总目标额外加分以防套利)
    # R_total = 0.65 * R_complete + 0.35 * R_disclosure - 0.10 * P_turns - 0.10 * P_failed
    r_total = 0.65 * r_complete + 0.35 * r_disclosure - 0.10 * p_turns - 0.10 * p_failed

    # 6. Strict Success 严格成功判定
    success_strict = (r_complete == 1.0 and r_disclosure == 1.0 and not hard_violation)
    return {"r_total": r_total, "r_complete": r_complete, "success_strict": success_strict}


# ==============================================================================
# C02: GRPO Group Advantage 组内相对优势
# ==============================================================================

def group_relative_advantage(
    rewards: list[float],
    group_ids: list[int],
    eps: float = 1e-8,
) -> list[float]:
    # 考察点: GRPO 组内无 Critic 优势估计、z-score 相对打分、零方差组显式置零
    # 手写量级: 15 行 / 3 分钟
    # 常见追问: std 为 0 怎么处理？要不要除以 std (Dr.GRPO 争议)？Group Size K 取多少？

    # 1. 按 group_id 分组收集奖励
    groups: dict[int, list[float]] = {}
    for r, g in zip(rewards, group_ids):
        groups.setdefault(g, []).append(r)

    # 2. 组内计算均值与标准差
    group_stats: dict[int, tuple[float, float]] = {}
    for g, r_list in groups.items():
        mean = sum(r_list) / len(r_list)  # mean = sum(R) / K
        var = sum((x - mean) ** 2 for x in r_list) / len(r_list)  # var = sum((R - mean)^2) / K
        std = math.sqrt(var)  # std = sqrt(var)
        group_stats[g] = (mean, std)

    # 3. 计算组相对优势 (零方差组全对或全错，显式置 0 消除无信号噪声)
    advantages: list[float] = []
    for r, g in zip(rewards, group_ids):
        mean, std = group_stats[g]
        if std < 1e-7:  # 零方差组: A = 0
            advantages.append(0.0)
        else:
            advantages.append((r - mean) / (std + eps))  # A = (R - mean) / (std + eps)
    return advantages


# ==============================================================================
# C03: pass@k 无偏估计 + 组内方差概率
# ==============================================================================

def pass_at_k(n: int, c: int, k: int) -> float:
    # 考察点: pass@k 无偏估计量 (Codex 公式)、数值稳定递乘实现避免大组合数溢出
    # 手写量级: 12 行 / 3 分钟
    # 常见追问: 为什么不用 1-(1-pass@1)^k？n 和 c 的关系？k > n-c 时的边界处理？

    # pass@k = 1 - C(n-c, k) / C(n, k)
    if n - c < k:  # 失败样本不足 k 个，任意选 k 个必包含至少 1 个成功样本
        return 1.0  # 边界: pass@k = 1.0
    if c == 0:  # 无成功样本
        return 0.0  # 边界: pass@k = 0.0

    # 展开为连续乘积项，数值稳定递推: prod_{i=0}^{k-1} (n - c - i) / (n - i)
    prod = 1.0
    for i in range(k):
        prod *= (n - c - i) / (n - i)  # 无偏估计递减乘积
    return 1.0 - prod  # pass@k = 1.0 - prod


def prob_non_zero_variance(p: float, K: int) -> float:
    # 考察点: GRPO 组内非零方差概率推导、可学性任务池黄金区 p≈0.5
    # 手写量级: 8 行 / 2 分钟
    # 常见追问: 为什么全对(p=1)或全错(p=0)产生零方差？K=8 时 p=0.5 的非零方差概率是多少？

    # 组内全错概率 (1-p)^K，组内全对概率 p^K
    p_all_wrong = (1.0 - p) ** K  # (1 - p)^K
    p_all_correct = p ** K        # p^K
    return 1.0 - p_all_wrong - p_all_correct  # P(var > 0) = 1 - (1-p)^K - p^K


# ==============================================================================
# C09: 沙箱执行 + Golden State diff (Strict Success)
# ==============================================================================

class MockSandbox:
    # 考察点: 内存状态机执行、变更审计日志 (change_log)、Golden State 状态子集比对与终态动作判定
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 无写库任务(No-Write)怎么验证？遇到未知工具怎么处理？状态比对为什么做子集比对？

    def __init__(self, initial_state: dict[str, dict[str, Any]]) -> None:
        # 深拷贝实现读写隔离，防止外部篡改内部环境
        self.tables: dict[str, dict[str, Any]] = copy.deepcopy(initial_state)
        self.change_log: list[dict[str, Any]] = []

    def execute(self, tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
        # 模拟沙箱工具执行与变更审计日志追加
        if tool_name == "update_db":
            table, key, val = args["table"], args["key"], args["val"]
            self.tables.setdefault(table, {})[key] = val
            self.change_log.append({"op": "update", "table": table, "key": key, "val": val})
            return {"status": "success", "rows_affected": 1}
        return {"status": "error", "message": f"Unknown tool: {tool_name}"}

    def check_strict_success(
        self,
        golden_state: dict[str, dict[str, Any]],
        expected_terminal: str,
        actual_terminal: str,
    ) -> bool:
        # 1. 状态子集比对: 实际 DB 必须完全包含并吻合期望变更
        state_matched = all(
            self.tables.get(t, {}).get(k) == v
            for t, rows in golden_state.items()
            for k, v in rows.items()
        )
        # 2. 终态动作精确比对
        terminal_matched = (actual_terminal == expected_terminal)
        return state_matched and terminal_matched  # Strict = state_matched & terminal_matched


# ==============================================================================
# C10: NLI Per-Message 取 Max
# ==============================================================================

def nli_max_score(
    assistant_turns: list[str],
    hypothesis: str,
    nli_evaluator_fn: Callable[[str, str], float] | None = None,
    threshold: float = 0.7,
) -> float:
    # 考察点: Per-Message NLI 逐句独立判定取 max、规避跨轮拼接的上下文污染与截断、固定阈值二值化
    # 手写量级: 10 行 / 2 分钟
    # 常见追问: 为什么不全对话拼在一起送 NLI？长文本 512 token 截断怎么破？阈值如何标定？

    if not assistant_turns:
        return 0.0
    # 默认简单包含匹配，实际调用 mDeBERTa 等 NLI 模型返回蕴含概率
    eval_fn = nli_evaluator_fn or (lambda text, hyp: 1.0 if hyp.lower() in text.lower() else 0.0)

    # 逐轮独立打分，杜绝长序列 512 截断与历史信息冲淡
    scores = [eval_fn(turn, hypothesis) for turn in assistant_turns]
    max_score = max(scores)  # score = max_{turn} NLI(turn, hypothesis)
    return 1.0 if max_score >= threshold else 0.0  # 二值化门禁输出


# ==============================================================================
# C25: 方差感知采样器 + 零方差过滤
# ==============================================================================

def variance_aware_sample(
    task_pool: list[dict[str, Any]],
    sample_size: int,
) -> list[dict[str, Any]]:
    # 考察点: 方差感知采样 (基于历史 p 估算方差权重 ∝ p(1-p))、饱和任务屏蔽、训练前零方差组过滤
    # 手写量级: 18 行 / 4 分钟
    # 常见追问: 历史 pass rate p 怎么冷启动？饱和桶(p=1或0)怎么处理？和 DAPO dynamic sampling 的异同？

    weights: list[float] = []
    for task in task_pool:
        p = task.get("historical_pass_rate", 0.5)  # 冷启动未测任务默认置于 p=0.5 黄金区
        # 饱和区 (p=0 全错死记硬背不可学，p=1 全对已掌握) 权重压制，保留微小探测底数
        w = max(p * (1.0 - p), 1e-4)  # weight = p * (1 - p)
        weights.append(w)

    total_w = sum(weights)
    norm_weights = [w / total_w for w in weights]
    # 按方差权重过采样黄金区任务
    return random.choices(task_pool, weights=norm_weights, k=sample_size)


def filter_zero_variance_groups(
    groups: list[dict[str, Any]],
    eps: float = 1e-12,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    # 考察点: 零方差组过滤、剔除全对/全错死区、保障梯度更新信号有效性
    # 手写量级: 12 行 / 3 分钟
    # 常见追问: 零方差组占比过高说明什么？过滤后批次不足如何补采？

    kept: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = []
    for g in groups:
        rewards = g.get("rewards", [])
        if len(rewards) < 2:
            dropped.append(g)
            continue
        mean = sum(rewards) / len(rewards)
        var = sum((r - mean) ** 2 for r in rewards) / len(rewards)  # Var(R)
        if var > eps:  # 仅保留方差显著大于 0 的组
            kept.append(g)
        else:
            dropped.append(g)
    return kept, dropped


# ==============================================================================
# 自测验证入口
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 01_reward_advantage_passk.py 单元测试 ===")

    # 1. 验证 C01 Reward 乘法门控与 No-Write 任务
    golden = {"records": {"status": "approved"}}
    # 正常办结匹配
    res_normal = compute_reward(golden, golden, "Finish", "Finish", r_disclosure=1.0)
    assert res_normal["r_complete"] == 1.0
    assert math.isclose(res_normal["r_total"], 1.0)
    assert res_normal["success_strict"] is True

    # No-Write 拒办任务：数据库终态虽均为空，但若动作误选 Finish，乘法门控直接将 r_complete 归 0
    empty_state: dict[str, Any] = {}
    res_tie = compute_reward(empty_state, empty_state, "Finish", "FinishWithRefusal", r_disclosure=1.0)
    assert res_tie["r_complete"] == 0.0, "动作不匹配时乘法门控必须为 0"
    assert res_tie["success_strict"] is False
    assert math.isclose(res_tie["r_total"], 0.35), "仅保留告知分"

    # 安全红线触发：硬零即时截断
    res_hard = compute_reward(golden, golden, "Finish", "Finish", hard_violation=True)
    assert res_hard["r_total"] == 0.0 and res_hard["success_strict"] is False

    # 2. 验证 C02 GRPO Group Advantage
    rewards = [1.0, 0.0, 1.0, 1.0]  # Group 0: [1, 0]; Group 1: [1, 1] 零方差组
    group_ids = [0, 0, 1, 1]
    advs = group_relative_advantage(rewards, group_ids)
    # Group 0 均值 0.5, std 0.5 -> 优势分别为 +1.0, -1.0，组均值为 0
    assert math.isclose(advs[0], 1.0, rel_tol=1e-4)
    assert math.isclose(advs[1], -1.0, rel_tol=1e-4)
    assert math.isclose(advs[0] + advs[1], 0.0, abs_tol=1e-7)
    # Group 1 零方差组 -> 优势显式置零
    assert advs[2] == 0.0 and advs[3] == 0.0

    # 3. 验证 C03 pass@k 与组内方差概率
    # n=10, c=5, k=1 -> pass@1 = 0.5
    assert math.isclose(pass_at_k(10, 5, 1), 0.5)
    # n=5, c=5, k=3 -> 全部正确必通过 -> 1.0
    assert math.isclose(pass_at_k(5, 5, 3), 1.0)
    # n=5, c=0, k=2 -> 全部失败 -> 0.0
    assert math.isclose(pass_at_k(5, 0, 2), 0.0)
    # 组内方差概率: p=0.5, K=8 -> 1 - 2*(0.5^8) = 1 - 2/256 = 0.9921875
    assert math.isclose(prob_non_zero_variance(0.5, 8), 1.0 - 2 * (0.5 ** 8))
    # p=0 或 p=1 时方差概率恒为 0
    assert prob_non_zero_variance(0.0, 8) == 0.0
    assert prob_non_zero_variance(1.0, 8) == 0.0

    # 4. 验证 C09 MockSandbox 状态执行与 diff
    init_db = {"users": {"101": "pending"}}
    sandbox = MockSandbox(init_db)
    sandbox.execute("update_db", {"table": "users", "key": "101", "val": "done"})
    golden_db = {"users": {"101": "done"}}
    assert sandbox.check_strict_success(golden_db, "Finish", "Finish") is True
    assert sandbox.check_strict_success(golden_db, "Finish", "Escalate") is False

    # 5. 验证 C10 NLI per-message 取 max
    turns = [
        "你好，请问需要办理什么业务？",
        "依据相关政策，提取公积金需满足连续缴存满6个月的要求。",
        "感谢您的咨询，再见。",
    ]
    hyp = "连续缴存满6个月"
    assert nli_max_score(turns, hyp) == 1.0
    assert nli_max_score(turns, "需要房产证明原件") == 0.0

    # 6. 验证 C25 方差感知采样与过滤
    pool = [
        {"id": "t1", "historical_pass_rate": 0.5},  # 黄金区: w = 0.25
        {"id": "t2", "historical_pass_rate": 1.0},  # 饱和全对: w = 1e-4
        {"id": "t3", "historical_pass_rate": 0.0},  # 饱和全错: w = 1e-4
    ]
    sampled = variance_aware_sample(pool, sample_size=100)
    t1_count = sum(1 for x in sampled if x["id"] == "t1")
    assert t1_count > 80, f"黄金区任务应当占据绝大部分采样，实际为 {t1_count}"

    groups_data = [
        {"group_id": 1, "rewards": [1.0, 0.0, 1.0, 0.0]},  # 有方差
        {"group_id": 2, "rewards": [1.0, 1.0, 1.0, 1.0]},  # 全对零方差
        {"group_id": 3, "rewards": [0.0, 0.0, 0.0, 0.0]},  # 全错零方差
    ]
    kept, dropped = filter_zero_variance_groups(groups_data)
    assert len(kept) == 1 and kept[0]["group_id"] == 1
    assert len(dropped) == 2

    print("=== 01_reward_advantage_passk.py 全部断言自测通过！===")
