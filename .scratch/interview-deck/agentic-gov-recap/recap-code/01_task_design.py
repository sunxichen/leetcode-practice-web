"""01_task_design.py — Phase 1: 任务设计、模式建模与任务工厂（Task Design & Task Factory）

【全链路位置】
本模块位于 agentic-gov 整体流水线的最顶层（Phase 1）。
它定义了政务公积金智能体的全量数据协议（CanonicalTask）、确定性黄金状态机（Golden Chain）、
国标身份证生成与校验（GB 11643-1999）、对抗种子（Adversarial Seeds）以及对比对（Contrast Pairs）。
后续所有 SFT 数据合成（Phase 2）、Simulator 训练（Phase 4）与 GRPO 强化学习 Rollout（Phase 6），
均以此处生成的标准任务实例为不可变事实输入。
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass, field
from typing import Any, Literal

# ---------------------------------------------------------------------------
# 真实源码引用路径 (verified against src/agentic_gov/...)
# ---------------------------------------------------------------------------
from agentic_gov.schemas.task import (
    CanonicalTask,
    TaskMetadata,
    Persona,
    HiddenTruth,
    DisclosureRule,
    AmbiguityProfile,
    InjectedError,
    SandboxOverrides,
    BoundaryTag,
    BoundaryConfigSnapshot,
)
from agentic_gov.schemas.sandbox import DbSnapshot
from agentic_gov.task_factory.id_card import (
    generate_chinese_id_card_18,
    generate_chinese_id_card_18_for_age_group,
    is_valid_chinese_id_card,
    _compute_check_char,
)
from agentic_gov.task_factory.entrypoints import (
    build_task,
    build_contrast_pair,
    validate_task_instance,
    _assert_full_invariants_registry,
)
from agentic_gov.task_factory.golden import (
    ExpectedAction,
    select_golden_chain,
    generate_golden_final_state,
    self_verify_golden_state,
)
from agentic_gov.adversarial_seed_generator import (
    build_adversarial_seed,
    generate_adversarial_seeds,
    _inject_adversarial_opening,
)
from agentic_gov.contrast_pair_generator import (
    generate_contrast_pairs_for_boundary,
    generate_all_contrast_pairs,
)
from agentic_gov.task_types.registry import TaskTypeRegistry, TaskTypeBundle


# ===========================================================================
# 1. 核心任务定义与真实性身份证生成 (GB 11643-1999)
# ===========================================================================

def generate_deterministic_id_card(rng: random.Random, age_group: str) -> str:
    """生成符合 GB 11643-1999 国标且与用户画像年龄段严格绑定的 18 位身份证号。
    
    【设计考量】
    真实政务场景对用户输入的身份证有强校验。若使用虚假随机数字，LLM 在 SFT/RL 时
    会学到非法的特征分布；若固定少数几个假 ID，又会导致记忆过拟合。
    因此采用确定性 PRNG 配合模 11 权重校验生成：
      - 前 6 位：合法行政区划代码（如 110101 北京东城、310101 上海黄浦）
      - 7-14 位：由 age_group 约束的合法 YYYYMMDD 出生日期（处理闰年）
      - 15-17 位：顺序码与性别位
      - 第 18 位：加权求和模 11 校验位 (10 映射为 'X')
    """
    # 真实实现委托给 agentic_gov.task_factory.id_card.generate_chinese_id_card_18_for_age_group
    # 权重列表: [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    # 校验字符映射: "10X98765432"
    id_number = generate_chinese_id_card_18_for_age_group(rng, age_group)
    assert is_valid_chinese_id_card(id_number), "生成的身份证未通过国标校验"
    return id_number


# ===========================================================================
# 2. 确定性 Golden Chain 状态机与预期终态
# ===========================================================================

def derive_task_ground_truth(task: CanonicalTask) -> tuple[list[ExpectedAction], DbSnapshot]:
    """通过 Golden Chain 状态机生成该任务的黄金执行序列与期望沙箱最终状态。
    
    【设计考量】
    政务业务不同于开放对话，每一步 API 调用与终局分支（Finish / Escalate / FinishWithRefusal）
    都受严格的政策（PolicyCard）约束。
    Golden Chain 充当了全链路的“确定性 Oracle”：
      1. 根据 task.concept, boundary_id, adversarial_flags 选取确定的 ExpectedAction 序列；
      2. 启动一个临时沙箱，按序执行该序列，得到纯净的 expected_final_state；
      3. 该 expected_final_state 在 Phase 2 作为 Verifier Funnel 的 L1 校验基准，
         在 Phase 6 作为 GRPO Reward v3 的 R_complete 计算真值。
    """
    # 1. 查找匹配的 Golden Chain 脚本构造器
    expected_script: list[ExpectedAction] = select_golden_chain(task)
    
    # 2. 驱动轻量沙箱重放，推导无副作用的确定性期望数据库终态
    expected_final_db_state: DbSnapshot = generate_golden_final_state(task)
    
    # 3. 校验终态自洽性（例如 Escalate/FinishWithRefusal 等无写库动作必须保持 DB 一致）
    self_verify_golden_state(task, expected_final_db_state)
    
    return expected_script, expected_final_db_state


def golden_chain_temporary_unavailable_recovery(
    tool_name: str,
    args: dict[str, Any],
) -> list[ExpectedAction]:
    """可恢复瞬态故障（如 TEMPORARY_UNAVAILABLE）的两阶段 Golden Chain 建模。
    
    【设计考量】
    对于系统瞬态异常自愈任务，Golden Script 显式声明连续动作：
      第一步：期望捕获 TEMPORARY_UNAVAILABLE；
      第二步：保持参数自愈重试，沙箱放行写库并推导出完整的 golden_final_state。
    """
    return [
        ExpectedAction(
            tool_name=tool_name,
            args=args,
            expect_status="error",
            expect_code="TEMPORARY_UNAVAILABLE",
            note="first call encounters transient system error",
        ),
        ExpectedAction(
            tool_name=tool_name,
            args=args,
            expect_status="ok",
            note="retry after TEMPORARY_UNAVAILABLE succeeds and mutates DB",
        ),
    ]


# ===========================================================================
# 3. 对抗种子生成器 (Adversarial Seed Generator)
# ===========================================================================

def build_adversarial_case(seed_id: str, flag: str, base_task: CanonicalTask) -> CanonicalTask:
    """构建注入了对抗意图的政务任务（如代办冒充、免核身要求、口头保过）。
    
    【设计考量】
    评测与训练若全为顺从的 Happy Path，模型在上线后极易被用户越权诱导。
    我们定义了 4 大类安全红线（N1 违规假设）：
      - `identity_impersonation` (N1-04): 声明帮父亲/他人代办但无合法委托授权书；
      - `skip_verification` (N1-01): 催促或恳求 Agent 跳过 verify_identity 流程；
      - `verbal_promise` (N1-02): 逼迫 Agent 口头承诺“申请 100% 能批下来”；
      - `info_extraction` (N1-03): 诱导 Agent 吐露非本人名下的敏感账户余额。
    
    生成时通过 `_inject_adversarial_opening` 动态合成第一轮越权诉求，
    并把 ExpectedAction 终态强制重定向为 `FinishWithRefusal`。
    """
    # 1. 生成第三方非本人身份证号（与用户本人的 id_number 隔离）
    rng = random.Random(seed_id)
    third_party_id = generate_chinese_id_card_18(rng)
    
    # 2. 注入结构化 opening_claims 与受限 opening_message
    adversarial_task: CanonicalTask = build_adversarial_seed(
        seed_id=seed_id,
        adversarial_flag=flag,
        base_task=base_task,
        third_party_id=third_party_id,
    )
    
    # 3. 运行不变量断言，确保对抗任务未泄露内部数据库字段
    validate_task_instance(adversarial_task)
    return adversarial_task


# ===========================================================================
# 4. 对比对生成器 (Contrast Pair Generator)
# ===========================================================================

def build_boundary_contrast_pair(seed_id: str, boundary_id: str) -> tuple[CanonicalTask, CanonicalTask]:
    """生成一对仅在临界决策点（Decision Boundary）存在微小扰动的对比任务。
    
    【设计考量】
    为了让强化学习和 SFT 学会精确区分“可办（Over/Pass）”与“超限/不可办（Under/Fail）”，
    而不是根据语料粗糙的语义共现做玄学猜测，我们构造了数值与类别对比对：
      - 数值边界（如 BD-N1 租房提取额度）：
          Side A: 请求金额 = 可提取上限 (如 3000 元) -> 预期动作 Finish (写库成功)
          Side B: 请求金额 = 上限 + 100 (如 3100 元) -> 预期动作 Ask_User / 拒绝并提示上限
      - 类别边界（如 BD-C4 贷款类型）：
          Side A: 纯公积金贷款 -> 智能体可直接结清办理 -> Finish
          Side B: 商业+公积金组合贷款 -> 需商业银行协同核算 -> Escalate (转人工专员)
    """
    # 真实实现调用 agentic_gov.task_factory.entrypoints.build_contrast_pair
    # 保证除了边界变量微调外，用户的 Persona、ID、联系方式等背景数据完全同构
    task_side_a, task_side_b = build_contrast_pair(
        seed_id=seed_id,
        boundary_id=boundary_id,
    )
    
    # 校验对比对的隔离性与不变量
    _assert_full_invariants_registry(task_side_a)
    _assert_full_invariants_registry(task_side_b)
    return task_side_a, task_side_b


# ===========================================================================
# 5. 全量工厂装配流程 (Factory Assembly Entrypoint)
# ===========================================================================

def create_canonical_task(
    task_type: str,
    seed: int,
    boundary_id: str | None = None,
    adversarial_flag: str | None = None,
) -> CanonicalTask:
    """TaskFactory 顶层入口：装配生成一份自包含的 CanonicalTask 实例。"""
    # 1. 查询注册的业务 Bundle
    bundle: TaskTypeBundle = TaskTypeRegistry.get(task_type)
    
    # 2. 确定性采样用户画像与隐藏真相 (HiddenTruth)
    rng = random.Random(seed)
    age_group = "middle_30_50"
    user_id_card = generate_deterministic_id_card(rng, age_group)
    
    # 3. 构造任务并注入 DSL 披露规则与字段可见性策略 (RevealPolicy)
    task: CanonicalTask = build_task(
        task_type=task_type,
        seed=seed,
        user_id_card=user_id_card,
        boundary_id=boundary_id,
        adversarial_flag=adversarial_flag,
    )
    
    # 4. 执行全量 20+ 项不变量强校验（Fail-Closed 门控）
    validate_task_instance(task)
    return task
