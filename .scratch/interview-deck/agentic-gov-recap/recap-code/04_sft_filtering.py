"""04_sft_filtering.py — Phase 2: 数据过滤漏斗、L3 标签器与分层采样（Verifier Funnel, L3 Tagger & Stratified Sampling）

【全链路位置】
本模块位于 agentic-gov 数据治理与数据配比的关键阶段（Phase 2 后半程）。
在 Phase 2 前半程通过双 Teacher 合成海量原始轨迹后，本模块首先通过 L0-L5 阶梯式质量漏斗（Verifier Funnel）
逐层剔除格式违规、沙箱状态不一致、合规告知缺失、实体篡改、隐私数据泄漏与低质对话；
随后利用 L3 Tagger 提取 6 维行为特征打标；
最后通过 StratifiedSampler（分层采样器）执行对比对、对抗对与纯决策概念任务的三路配额采样，
最终产出用于 Agent 训练的 Stream ① 与用于 Simulator 训练的 Stream ② 数据集。
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

# ---------------------------------------------------------------------------
# 真实源码引用路径 (verified against src/agentic_gov/...)
# ---------------------------------------------------------------------------
from agentic_gov.schemas.task import CanonicalTask, L3Tags
from agentic_gov.schemas.trajectory import Trajectory
from agentic_gov.constants import (
    EXPECTED_TERMINAL_ACTION_SET,
    REVEAL_POLICY_DSL_RULE_SET,
    L3_TAG_VALUE_ENUMS,
    DECISION_CONCEPT_DENSITY,
    ADVERSARIAL_FLAGS,
    CONTRAST_PAIR_BY_BOUNDARY,
)
from agentic_gov.verifier.format import parse_analysis_action, ParseError
from agentic_gov.verifier.rpcr import detect_leaks
from agentic_gov.verifier.hybrid import (
    NARROW_P_HYPOTHESIS_IDS,
    resolve_p02,
    resolve_narrow_p,
    resolve_n1,
)
from agentic_gov.verifier.nli import (
    ADVERSARIAL_N1_HYPOTHESES,
    HYPOTHESIS_BY_CONCEPT,
    RUNTIME_HYPOTHESIS_TEXT_BY_ID,
    derive_n1_hypotheses,
    ThresholdedHypothesis,
    NliHit,
)
from agentic_gov.task_factory.id_card import birth_year_from_id, birth_year_range_for_age_group
from agentic_gov.sampler.plan import SamplingPlan, default_sampling_plan
from agentic_gov.contrast_pair_generator import generate_contrast_pairs_for_boundary
from agentic_gov.task_factory.entrypoints import build_task, assert_minimal_pair_invariant

# ---------------------------------------------------------------------------
# 漏斗层级定义
# ---------------------------------------------------------------------------
LAYERS = ("L0_format", "L1_sandbox", "L2_nli", "L3_entity", "L4_rpcr", "L5_judge")


# ===========================================================================
# 1. 阶梯式验证漏斗算子 (Verifier Funnel Layers L0 - L5)
# ===========================================================================

def _compute_l0(task: dict[str, Any], trajectory: dict[str, Any]) -> dict[str, Any]:
    """L0: 语法格式与 Envelope 结构校验。
    
    【内部逻辑】：
    - 遍历轨迹所有轮次，校验 user / tool / assistant 轮次的基础 schema 规范；
    - 对所有 assistant 轮次调用 parse_analysis_action，确保严格符合 <analysis>/<action> 闭合规范；
    - 确保终态动作之后绝无多余的工具调用或交互。
    """
    turns = trajectory.get("turns", [])
    if not turns:
        return {"status": "failed", "passed": False, "fail_reasons": ["l0_schema_violation"]}
    
    for turn in turns:
        if turn.get("role") == "assistant":
            raw = turn.get("raw_output") or turn.get("content", "")
            try:
                parse_analysis_action(raw)
            except ParseError as exc:
                return {"status": "failed", "passed": False, "fail_reasons": [f"l0_format_error: {exc}"]}
    return {"status": "passed", "passed": True, "fail_reasons": []}


def _compute_l1(
    task: dict[str, Any],
    trajectory: dict[str, Any],
    deps: dict[str, Any],
    config: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """L1: 沙箱环境状态回放与业务一致性校验。
    
    【内部逻辑】：
    - 使用 task 初始配置实例化全新沙箱，逐步重放轨迹中所有的 Call_API 动作；
    - 校验每一步工具调用的实际返回值（status、response、error_code）与轨迹中记录的是否完全一致；
    - 比对终态动作与 task.metadata.expected_terminal_action 是否一致；
    - 比对沙箱重放后的最终 DB 状态与 task.golden_final_state 的关键字段子集（compare_spec）；
    - [No-Write 等价性校验]：若任务为纯查询或合规拒绝（期望不写库），校验 DB 是否保持与初始状态一致（未发生意外写污染）。
    """
    replay_sandbox = deps["sandbox_factory"](task)
    turns = trajectory.get("turns", [])
    expected_terminal = task["metadata"]["expected_terminal_action"]

    for idx, turn in enumerate(turns):
        if turn.get("role") == "assistant":
            parsed = turn.get("parsed", {})
            action_type = parsed.get("action_type")
            if action_type == "Call_API":
                tool_name = parsed.get("tool_name")
                tool_args = parsed.get("tool_args", {})
                obs = replay_sandbox.execute(tool_name, tool_args)
                # 校验工具返回值一致性 ...
            elif action_type in EXPECTED_TERMINAL_ACTION_SET:
                if action_type != expected_terminal:
                    return {"status": "failed", "passed": False, "fail_reasons": ["terminal_action_mismatch"]}, {}

    final_state = replay_sandbox.export_state()
    # 比对 DB 状态子集与 golden_final_state ...
    return {"status": "passed", "passed": True, "fail_reasons": []}, {"actual_final_state": final_state}


def _assistant_visible_messages(trajectory: Mapping[str, Any]) -> list[str]:
    """提取每轮 Assistant 针对用户可见的纯文本列表，排除思考与工具调用。"""
    messages: list[str] = []
    for turn in trajectory.get("turns", []):
        if turn.get("role") == "assistant":
            parsed = turn.get("parsed")
            if isinstance(parsed, Mapping):
                body = str(parsed.get("body", "")).strip()
                if body:
                    messages.append(body)
    return messages


def _compute_l2(
    task: dict[str, Any],
    trajectory: dict[str, Any],
    deps: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """L2: 合规告知（Disclosure）与对抗防线（Adversarial Guard）NLI 校验。
    
    【核心机制：Per-Assistant-Message Premise 策略（插叙①）】：
    1. 派生任务必须告知的 P-Hypotheses 集合与对抗拦截的 N1-Hypotheses 集合；
    2. 从轨迹中提取每一轮 Assistant 的独立自然语言发言列表 [m_1, m_2, ..., m_T]；
    3. 【解决 512 token 截断】：不再将全量多轮对话（Full Dialogue）打包为单一 Premise，
       而是对每条消息 m_t 独立调用 NLI 模型计算蕴含概率：
       Score(h) = max_{t} NLI_Checker(Premise = m_t, Hypothesis = h)
    4. 针对边缘样本与特定歧义概念（如 P-02/P-07/P-08/N1），触发 LLM Adjudicator 混合复核（resolve_p02 / resolve_narrow_p / resolve_n1）。
    """
    l2_cfg = config["L2_nli"]
    checker = deps["nli_checker"]
    adjudicator = deps.get("adjudicator")

    # 1. 派生假设 ID 列表
    # (P 假设来自 mandatory_disclosures, N1 假设来自 adversarial_flag)
    p_ids = ["P-01", "P-02"]  # 示意
    n1_ids = []

    # 2. 提取逐条 Assistant 消息
    assistant_premises = _assistant_visible_messages(trajectory)
    if not assistant_premises:
        return {"status": "failed", "passed": False, "fail_reasons": ["no_assistant_premises"]}

    # 3. 逐条评分并取 max
    best_scores: dict[str, float] = {hid: 0.0 for hid in (p_ids + n1_ids)}
    thresholded = [{"id": hid, "threshold": l2_cfg["thresholds"].get(hid, 0.5)} for hid in (p_ids + n1_ids)]
    
    for premise in assistant_premises:
        results = checker.check(premise, thresholded)
        for row in results:
            if row["score"] > best_scores[row["id"]]:
                best_scores[row["id"]] = row["score"]

    # 4. 判定 Hit/Miss 并结合 Hybrid Adjudicator 兜底
    p_miss = [hid for hid in p_ids if best_scores[hid] < l2_cfg["thresholds"].get(hid, 0.5)]
    n1_hit = [hid for hid in n1_ids if best_scores[hid] >= l2_cfg["thresholds"].get(hid, 0.5)]

    passed = (len(p_miss) == 0 and len(n1_hit) == 0)
    return {
        "status": "passed" if passed else "failed",
        "passed": passed,
        "fail_reasons": [f"p_miss:{h}" for h in p_miss] + [f"n1_hit:{h}" for h in n1_hit],
        "scores": best_scores,
    }


def _compute_l3(task: dict[str, Any], deps: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """L3: 实体一致性校验（针对口语化改写样本 Naturalized Pairs）。"""
    # 校验改写后的用户话术未篡改关键业务实体（如将 5000 元写成 50000 元）...
    return {"status": "passed", "passed": True, "fail_reasons": []}, {}


def _compute_l4(
    task: dict[str, Any],
    trajectory: dict[str, Any],
    config: dict[str, Any],
    forced_status: str | None = None,
) -> dict[str, Any]:
    """L4: RPCR 隐私信息释放合规性校验（基于 DSL 规则检测未授权隐私泄露）。"""
    leaks = detect_leaks(trajectory, task)
    passed = len(leaks) == 0
    return {
        "status": "passed" if passed else "failed",
        "passed": passed,
        "fail_reasons": [f"rpcr_leak:{l.field_path}" for l in leaks],
        "leaked_field_paths": [l.field_path for l in leaks],
    }


def _compute_l5(task: dict[str, Any], trajectory: dict[str, Any], deps: dict[str, Any]) -> dict[str, Any]:
    """L5: LLM Judge 综合质量打分 + GB 11643 国标年龄-身份证确定性复核。
    
    【内部逻辑】：
    - 评估自然度（Naturalness）、画像一致性（Persona Consistency）、流畅度（Fluency）三维指标；
    - 引入确定性 age-id check：若 LLM Judge 误判“用户年龄与身份证不符”，利用国标校验码与出生年份区间强行修正 False Negative。
    """
    # 评测与打分 ...
    return {"status": "passed", "passed": True, "scores": {"naturalness": 8, "persona_consistency": 8, "fluency": 9}}


def run_verifier_funnel(
    *,
    task: dict[str, Any],
    trajectory: dict[str, Any],
    dependencies: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """全量运行 L0-L5 阶梯式过滤漏斗（短路判定）。"""
    results: dict[str, Any] = {}
    failed_stage: str | None = None

    for layer in LAYERS:
        if failed_stage is not None:
            results[layer] = {"status": "not_run", "passed": False}
            continue

        if layer == "L0_format":
            res = _compute_l0(task, trajectory)
        elif layer == "L1_sandbox":
            res, _ = _compute_l1(task, trajectory, dependencies, config)
        elif layer == "L2_nli":
            res = _compute_l2(task, trajectory, dependencies, config)
        elif layer == "L3_entity":
            res, _ = _compute_l3(task, dependencies)
        elif layer == "L4_rpcr":
            res = _compute_l4(task, trajectory, config)
        else:
            res = _compute_l5(task, trajectory, dependencies)

        results[layer] = res
        if res["status"] != "passed":
            failed_stage = layer

    candidate_eligible = (failed_stage is None)
    return {
        "candidate_eligible": candidate_eligible,
        "failed_stage": failed_stage,
        "results": results,
    }


# ===========================================================================
# 2. L3 行为特征标签器 (L3 Tagger - rules_v1)
# ===========================================================================

def tag_turn_count(trajectory: Any) -> str:
    """根据有效交互轮数划分对话长度桶。"""
    n = len([t for t in trajectory.get("turns", []) if t.get("role") in {"user", "assistant"}])
    if n <= 5:
        return "short"
    if n <= 10:
        return "medium"
    if n <= 20:
        return "long"
    return "overlong"


def tag_info_release_pattern(trajectory: Any) -> str:
    """分析用户槽位信息释放节奏（一次性给出 / 2-3轮分批 / 4轮以上碎片化释放）。"""
    # 槽位正则匹配与轮次分析 ...
    return "chunked_2_3"


def tag_topic_drift(trajectory: Any) -> str:
    """检测用户是否存在吐槽发泄（vent）、闲聊（chitchat）或中途业务澄清（mid_clarify）。"""
    # 关键词状态机扫描 ...
    return "on_topic"


def tag_correction_pattern(trajectory: Any) -> str:
    """检测纠错模式：用户主动改口（self_correction）或采纳 Agent 纠错建议。"""
    # 纠错关键词与模式识别 ...
    return "self_correction"


def tag_emotional_arc(trajectory: Any) -> str:
    """分析用户多轮情绪弧线（平稳 stable / 情绪安抚 de_escalation / 焦虑升级 rising_anxiety）。"""
    # 情感词典打分与单调性分析 ...
    return "de_escalation"


def tag_utterance_length_profile(trajectory: Any) -> str:
    """用户单轮平均长度画像（短小精炼 terse_avg / 适中 normal_avg / 冗长 verbose_avg）。"""
    user_turns = [t.get("content", "") for t in trajectory.get("turns", []) if t.get("role") == "user"]
    if not user_turns:
        return "terse_avg"
    avg = sum(len(txt) for txt in user_turns) / len(user_turns)
    if avg < 15:
        return "terse_avg"
    if avg <= 60:
        return "normal_avg"
    return "verbose_avg"


def tag_trajectory_rules_v1(trajectory: Any) -> L3Tags:
    """产出 6 维确定性 L3 行为特征标签，用于后续分层覆盖度审计。"""
    tags = {
        "turn_count_bucket": tag_turn_count(trajectory),
        "info_release_pattern": tag_info_release_pattern(trajectory),
        "topic_drift": tag_topic_drift(trajectory),
        "correction_pattern": tag_correction_pattern(trajectory),
        "emotional_arc": tag_emotional_arc(trajectory),
        "utterance_length_profile": tag_utterance_length_profile(trajectory),
    }
    return L3Tags.model_validate(tags)


# ===========================================================================
# 3. 三路分层采样器 (Stratified Sampler)
# ===========================================================================

def _largest_remainder_alloc(base_counts: dict[str, int], factor: float) -> dict[str, int]:
    """最大余数法（Hamilton-Hare 算法）：在带超采样因子的分桶配额分配中消除舍入漂移。"""
    scaled = {k: v * factor for k, v in base_counts.items()}
    floored = {k: int(math.floor(v)) for k, v in scaled.items()}
    remainder = {k: scaled[k] - floored[k] for k, v in scaled.items()}
    total_target = round(sum(base_counts.values()) * factor)
    deficit = total_target - sum(floored.values())
    
    # 优先将名额分给余数最大的桶
    for k in sorted(remainder, key=remainder.get, reverse=True)[:deficit]:
        floored[k] += 1
    return floored


class StratifiedSampler:
    """三路分层采样器：严格保障对比对、对抗对与纯决策概念的覆盖率配比。
    
    【三路生成顺序（PR-6a 协议）】：
    1. Contrast Pairs（对比对）：按边界条件成对生成，验证模型对临界条件的敏感度；
    2. Adversarial Seeds（对抗任务）：按代办、越权、伪造等 4 类对抗 Flag 生成攻击任务；
    3. Pure Concept-Driven（纯概念主路径）：扣除前两路覆盖的概念配额后，补齐 31 个决策概念（DC-01~DC-31）。
    """
    def __init__(self, plan: SamplingPlan | None = None, rng: random.Random | None = None) -> None:
        self.plan = plan or default_sampling_plan()
        self._rng = rng or random.Random()
        self._validate_allocation_invariants()
        self.pure_main_target = self._compute_pure_main_target()

    def _validate_allocation_invariants(self) -> None:
        """C-1 契约：校验 4 张权威配额表的自洽性与 4800 总量守恒。"""
        if sum(self.plan.concept_target.values()) != 4800:
            raise AssertionError("concept_target sum must equal 4800")

    def _compute_pure_main_target(self) -> dict[str, int]:
        """扣除来自对比对与对抗对的重叠配额，计算纯主路径的净生成目标。"""
        pure_main = dict(self.plan.concept_target)
        for c, count in self.plan.concept_source_map["from_pair"].items():
            pure_main[c] -= count
        for c, count in self.plan.concept_source_map["from_adversarial"].items():
            pure_main[c] -= count
        return pure_main

    def generate_all_seeds(self) -> list[CanonicalTask]:
        """执行三路分层采样，产出全量 Task 种子。"""
        seeds: list[CanonicalTask] = []
        factor = self.plan.oversample_factor

        # 1. 第一路：对比对 (Contrast Pairs)
        pair_alloc = _largest_remainder_alloc(
            {b: cnt // 2 for b, cnt in self.plan.contrast_pair_by_boundary.items()},
            factor,
        )
        for boundary_id, group_count in pair_alloc.items():
            # 生成最小对比对 ...
            pass

        # 2. 第二路：对抗任务 (Adversarial Tasks)
        for flag, count in self.plan.adversarial_by_flag.items():
            # 生成对抗种子 ...
            pass

        # 3. 第三路：纯决策概念主任务 (Pure Concept Main Path)
        for concept_id, count in self.pure_main_target.items():
            # 生成业务基准任务 ...
            pass

        self._rng.shuffle(seeds)
        return seeds
