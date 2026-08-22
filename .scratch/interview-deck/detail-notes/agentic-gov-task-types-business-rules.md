# Agentic-Gov 核心业务规则与四大 Task Type 设计详解

> **文档定位**：面试复习专题笔记（针对项目原作者深度复盘）。
> **目标**：以业务逻辑闭环为核心，系统性重建对公积金（Housing Fund）领域四大 `task_type` 的业务背景、参数追问、工具链时序约束（Precondition DAG）、政策限额、错误分支与异常恢复、流程变体裁剪以及难度梯次设计的完整 Big Picture。
> **代码权威源**：`src/agentic_gov/task_types/housing_fund/`（`account_balance_query.py`、`withdrawal_for_rent.py`、`withdrawal_for_purchase.py`、`loan_repayment_query.py`、`common.py`）、`src/agentic_gov/schemas/`、`src/agentic_gov/sandbox/`、`src/agentic_gov/task_factory/golden.py`。

---

## 导读 / Executive Summary

在政务大模型 Agent 的研发中，最容易陷入的误区是将政务业务简化为"单轮意图识别 + Tool Calling API 查询"。真实的政务热线与线上政务大厅具有极强的**政策严肃性**、**法律合规性**与**时序依赖性**：
1. **身份认证前置**：未经实名认证（`verify_identity`）绝不能泄露任何账户资产信息，更不能触发任何资金扣减；
2. **资格与前置核验链**：提取住房公积金必须先做资格校验（`check_eligibility`），购房提取还必须交叉验证住建部门备案的购房合同（`verify_purchase_contract`）；
3. **资金与限额安全**：提取金额受到账户余额、政策上限、购房总价多重约束，且必须绑定一类银行卡；
4. **决策分流闭环**：办结（`Finish`）、转人工审批（`Escalate`）、依规拒绝（`FinishWithRefusal`）三类终态必须逻辑自洽且证据确凿。

本项目在 `agentic-gov` 中，精选并抽象了公积金领域的 4 个典型事项，构建了一个从 **⭐（只读单查）** 到 **⭐⭐⭐⭐（复杂计算状态机与动态变体）** 的难度递进体系。

*注：关于沙箱 8 步安全执行管线、主体感知账本、`TaskTypeBundle` 组织与 `Golden Chain` 确定性演算机制，详见专题文档 [《沙箱仿真与评测环境》](./agentic-gov-sandbox-architecture.md)。*

---

## 1. 四大 Task Type 全景对照表

| 事项名称 (`task_type`) | 策略标识 (`policy_id`) | 难度星级 | 真实政务映射 | 核心工具链 (Happy Path) | 核心红线 / 规则一句话 | 终态分布模式 |
|---|---|---|---|---|---|---|
| **`account_balance_query`** | `HF-BAL-QUERY` | ⭐ | 个人公积金账户与缴存明细查询 | `verify_identity` $\rightarrow$ `query_account_info` | 查前必验身；账户冻结/异常必须转人工；纯只读无状态变更 | `Finish` / `Escalate` / `FinishWithRefusal` |
| **`withdrawal_for_rent`** | `HF-WD-RENT` | ⭐⭐ | 无房职工租房提取住房公积金 | `verify_identity` $\rightarrow$ `check_eligibility` $\rightarrow$ `submit_rent_withdrawal` | 必须确认租房提取资格；动态限额取 `min(balance, annual_limit)`；必须已绑定银行卡 | `Finish` / `Escalate` / `FinishWithRefusal` |
| **`withdrawal_for_purchase`** | `HF-WD-PURCHASE` | ⭐⭐⭐ | 购买自住住房提取住房公积金 | `verify_identity` $\rightarrow$ `check_eligibility` $\rightarrow$ `verify_purchase_contract` $\rightarrow$ `submit_purchase_withdrawal` | 必须核验网签备案合同且买受人匹配；三道限额取小 `min(balance, policy_limit, price)` | `Finish` / `Escalate` / `FinishWithRefusal` |
| **`loan_repayment_query`** | `HF-LOAN-REPAY` | ⭐⭐⭐⭐ | 公积金贷款明细查询 / 提前还本还贷 | 纯查：`verify` $\rightarrow$ `query_loan`<br>提前还款：`verify` $\rightarrow$ `query_loan` $\rightarrow$ `calculate` $\rightarrow$ `submit` | 条件槽后置追问；提交前必须精确数学试算；组合贷/逾期禁办提前还款需转人工 | `Finish` / `Escalate` / `FinishWithRefusal` |

```mermaid
graph TD
    subgraph Difficulty Ladder [四大事项难度递进]
        T1["account_balance_query (⭐)<br>只读单查 · 2步链"] --> T2["withdrawal_for_rent (⭐⭐)<br>单写线性链 · 动态限额 · 3步链"]
        T2 --> T3["withdrawal_for_purchase (⭐⭐⭐)<br>复合主体 · 外部合同核验 · 4步链"]
        T3 --> T4["loan_repayment_query (⭐⭐⭐⭐)<br>分支变体 · 状态机试算 · 动态工具裁剪"]
    end
```

---

## 2. Task Type 1：account_balance_query（账户余额查询）

### 2.1 业务背景与真实政务场景映射
- **现实映射**：市民通过 12329 热线或政务小程序查询个人住房公积金账户状态、当前可用余额、月缴存额及最近缴存日期。
- **业务特性**：属于**纯只读（Read-Only）高频服务**。虽然流程短，但涉及个人敏感资产数据，政务合规的核心底线是**严防数据未授权泄露**。

### 2.2 `required_slots` 与追问策略
- **必填槽位**：`required_slots = ["id_number"]`（18位二代身份证号）。
- **追问策略**：市民进线若未主动提供身份证号，Agent 必须首先礼貌索要身份证件信息。在未获得并核验身份证前，禁止调用任何业务查询接口。

### 2.3 工具清单与调用时序约束

#### 工具清单
1. `verify_identity`（Read）：验证调用人身份证号格式与账户存在性。
2. `verify_delegate_authorization`（Read）：代办场景下核验代办人与被代办人之间的授权关系。
3. `query_account_info`（Read）：查询指定账户的余额、月缴存额、状态（active/frozen/sealed）与最后缴存日。

#### 时序与 Precondition 依赖 DAG
```mermaid
graph LR
    A["verify_identity(id_number)"] -->|"解锁 postcondition: identity_verified(id_number)"| B["query_account_info(id_number)"]
    A_del["verify_delegate_authorization(actor, principal, op)"] -->|"未授权报错 DELEGATION_NOT_FOUND"| Refusal["FinishWithRefusal"]
```

- **Subject Binding（主体绑定机制）**：
  在 `src/agentic_gov/task_types/housing_fund/account_balance_query.py` 中：
  ```python
  QUERY_ACCOUNT_INFO_SPEC = ApiSpec(
      tool_name="query_account_info",
      tool_type="read",
      preconditions=["identity_verified"],
      precondition_subject_refs={"identity_verified": ("args.id_number",)},
      ...
  )
  ```
  引擎在底层强制校验：`identity_verified` 标志必须挂载在当前 `args.id_number` 上。若 Agent 验证了用户 A 的身份证，却拿用户 B 的身份证去调 `query_account_info`，沙箱会在 Precondition 检查阶段直接拦截并返回 `PRECONDITION_NOT_MET`。

### 2.4 政策规则定义

```python
# 文件位置: src/agentic_gov/task_types/housing_fund/account_balance_query.py
POLICY_CARD = PolicyCard(
    policy_id="HF-BAL-QUERY",
    policy_version="v1.0",
    task_type="account_balance_query",
    required_slots=["id_number"],
    preconditions=["identity_verified"],
    hard_rules=[
        "no_read_without_identity_verification",
        "verified_delegate_without_authorization_must_finish_with_refusal",
    ],
    escalation_conditions=["account_status_abnormal", "user_requests_manual_support"],
    mandatory_disclosures={
        "Finish": ["result_data_freshness", "result_or_next_step"],
        "Escalate": ["result_or_next_step"],
        "FinishWithRefusal": ["result_or_next_step"],
    },
    allowed_tools=[
        "verify_identity",
        "verify_delegate_authorization",
        "query_account_info",
    ],
)
```

- **硬性红线（`hard_rules` / `forbidden_side_effects`）**：
  - `query_account_info_without_identity_verification`：未实名即查账户，直接判负（Hard Violation）。
  - `verified_delegate_without_authorization_must_finish_with_refusal`：代办未获得授权，必须依规拒绝。
- **转人工条件（`escalation_conditions`）**：
  - `account_status_abnormal`：账户状态非 `active`（如 `frozen` 司法冻结、`sealed` 封存）。
  - `user_requests_manual_support`：群众明确要求人工客服介入。
- **必告知项（`mandatory_disclosures`）**：
  - 成功办结（`Finish`）：必须告知数据时效性（`result_data_freshness`，如"数据截至今日"）以及办理结果/下一步指引（`result_or_next_step`）。

### 2.5 错误分支全表

| 触发工具 | 错误码 (`SandboxError`) | 是否可恢复 (`recoverable`) | 触发条件 | Agent 期望应对行为与终态 |
|---|---|---|---|---|
| `verify_identity` | `INVALID_FORMAT` | ✅ 是 | 身份证号不满足 18 位 GB11643 校验 | 提示用户身份证格式错误，请求重新输入 |
| `verify_identity` | `IDENTITY_MISMATCH` | ❌ 否 | 数据库中查无此人，或冒用他人身份 | 明确告知身份核验不通过，以 `FinishWithRefusal` 终态办结 |
| `verify_delegate_authorization`| `DELEGATION_NOT_FOUND`| ❌ 否 | 代办关系在委托表中不存在 | 告知未查到有效授权委托记录，以 `FinishWithRefusal` 拒绝办理 |
| `query_account_info` | `PRECONDITION_NOT_MET`| ✅ 是 | Agent 遗漏调用 `verify_identity` 直接查询 | 补充调用 `verify_identity`，补齐前置条件后重试 |
| `query_account_info` | `RECORD_NOT_FOUND` | ❌ 否 | 账户记录缺失（数据异常） | 告知系统异常，执行 `Escalate` 转人工核查 |
| `query_account_info` | `ACCOUNT_FROZEN` | ❌ 否 | 账户 `status != "active"`（冻结/封存） | 告知账户状态异常，执行 `Escalate` 转人工柜面处理 |

### 2.6 流程变体与沙箱对比规则（CompareSpec）
- 余额查询全流程不发生任何数据库写操作。
- `COMPARE_SPEC_BY_FLOW[None]` 的 `Finish`、`Escalate`、`FinishWithRefusal` 对应规则均为空字典 `{}`，评测时严格执行**无写等价性（No-Write Equality）校验**（即沙箱初始 DB 状态与终态必须完全一致）。

### 2.7 训练考察维度
- **SFT 基础信号**：考察 Agent 的基础身份前置意识与工具参数提取准确度。
- **反欺诈与防御对抗**：在冒名顶替、绕过认证等对抗场景下，考察 Agent 是否能坚守 `verify_identity` 红线，不被用户的诱导性提问绕开合规流程。

---

## 3. Task Type 2：withdrawal_for_rent（租房提取公积金）

### 3.1 业务背景与真实政务场景映射
- **现实映射**：缴存职工在缴存地无自有住房且租赁住房，申请提取本人公积金账户余额用于支付房租。
- **业务特性**：属于**单写入（Single-Write）线性业务**。资金从公积金资金池划拨至职工关联银行卡，涉及实际的账户扣款与业务台账生成。

### 3.2 `required_slots` 与追问策略
- **必填槽位**：`required_slots = ["id_number", "requested_amount"]`（身份证号、申请提取金额）。
- **追问策略**：若用户仅表达"我想提取公积金付房租"，Agent 必须追问提取金额；若用户给出的金额不合法（如负数、非数值），需重新确认。

### 3.3 工具清单与调用时序约束

#### 工具清单
1. `verify_identity`（Read）：验证市民身份。
2. `verify_delegate_authorization`（Read）：核验代办授权。
3. `check_eligibility`（Read）：校验提取资格（参数 `withdraw_reason="rent"`）。
4. `submit_rent_withdrawal`（Write）：提交租房提取申请，扣减余额并写入申请表。

#### 时序与 Precondition 依赖 DAG
```mermaid
graph TD
    V["verify_identity(id_number)"] -->|identity_verified| E["check_eligibility(id_number, rent)"]
    E -->|eligibility_confirmed| S["submit_rent_withdrawal(id_number, amount)"]
```

在 `src/agentic_gov/task_types/housing_fund/withdrawal_for_rent.py` 中：
```python
SUBMIT_RENT_WITHDRAWAL_SPEC = ApiSpec(
    tool_name="submit_rent_withdrawal",
    tool_type="write",
    required_args=[
        ArgSpec(name="id_number", type="str"),
        ArgSpec(name="amount", type="float", constraint="> 0"),
    ],
    preconditions=["identity_verified", "eligibility_confirmed"],
    precondition_subject_refs={
        "identity_verified": ("args.id_number",),
        "eligibility_confirmed": ("args.id_number",),
    },
    ...
)
```

### 3.4 政策规则定义

```python
# 文件位置: src/agentic_gov/task_types/housing_fund/withdrawal_for_rent.py
POLICY_CARD = PolicyCard(
    policy_id="HF-WD-RENT",
    policy_version="v1.0",
    task_type="withdrawal_for_rent",
    required_slots=["id_number", "requested_amount"],
    preconditions=["identity_verified", "eligibility_confirmed"],
    hard_rules=[
        "no_sensitive_write_before_identity_verification",
        "no_approval_if_ineligible",
        "verified_delegate_without_authorization_must_finish_with_refusal",
    ],
    escalation_conditions=[
        "eligibility_account_not_found",
        "eligibility_inactive_account",
        "bank_account_not_linked",
        "eligibility_boundary_unclear",
        "amount_exceeds_policy_limit",
        "user_requests_manual_support",
    ],
    policy_limit_declarations={
        "withdrawal_limit_rent": {"unit": "CNY", "default_range": [30000, 80000]}
    },
    mandatory_disclosures={
        "Finish": ["processing_time", "result_or_next_step"],
        "Escalate": ["result_or_next_step"],
        "FinishWithRefusal": ["result_or_next_step"],
    },
    allowed_tools=[
        "verify_identity",
        "verify_delegate_authorization",
        "check_eligibility",
        "submit_rent_withdrawal",
    ],
)
```

- **政策限额计算规则**：
  - `withdrawal_limit_rent` 离散取值池（`constants.py`）：`[30000, 45000, 50000, 60000, 80000]` 元。
  - **实际生效限额公式**：
    $$\text{effective\_limit} = \min(\text{account.balance}, \text{annual\_limit})$$
    其中 `annual_limit` 优先从 `runtime_policy` 获取，若未配置则读取账户自身的 `rent_annual_limit`。
- **必告知项（`mandatory_disclosures`）**：
  - 成功办结时，必须明确告知业务到账/审批时限（`processing_time`，例如"3-5个工作日到账"）及后续注意事项（`result_or_next_step`）。

### 3.5 错误分支全表

| 触发工具 | 错误码 (`SandboxError`) | 是否可恢复 (`recoverable`) | 触发条件 | Agent 期望应对行为与终态 |
|---|---|---|---|---|
| `check_eligibility` | `ELIGIBILITY_INACTIVE_ACCOUNT` | ❌ 否 | 账户处于封存或冻结状态 | 告知资格不符，执行 `Escalate` 转人工柜面排查 |
| `check_eligibility` | `ELIGIBILITY_ZERO_BALANCE` | ❌ 否 | 账户余额 $\le 0$ | 告知账户余额为零无法提取，以 `FinishWithRefusal` 结单 |
| `check_eligibility` | `ELIGIBILITY_COOLDOWN` | ❌ 否 | 距离上次提取尚在限制冷却期内（如 12 个月内已提过） | 告知在提取冷却期内，以 `FinishWithRefusal` 结单 |
| `submit_rent_withdrawal` | `AMOUNT_EXCEEDS_LIMIT` | ❌ 否 (Tool级)<br>✅ 是 (对话级) | 申请金额超过账户余额或年提取限额上限 | **核心交互测试点**：Agent 向群众解释政策上限与当前最大可提额度，**协商降额后重新发起 `submit`** |
| `submit_rent_withdrawal` | `BANK_ACCOUNT_NOT_LINKED` | ❌ 否 | 账户未绑定一类银行卡（`linked_bank_account is None`） | 告知缺少收款银行卡，引导线下或线上绑卡，执行 `Escalate` |
| `submit_rent_withdrawal` | `TEMPORARY_UNAVAILABLE` | ✅ 是 | 结算通道瞬时网络抖动或超时（注入错误） | 捕获后保持参数不变自动重试提交 |

### 3.6 流程变体与沙箱对比规则（CompareSpec）
- 办结终态（`Finish`）必须在数据库中生成一条租房提取记录，并原子扣减账户余额：
  ```python
  # COMPARE_SPEC_BY_FLOW[None]["Finish"]
  {
      "tables.fund_account[0].balance": "exact",
      "tables.withdrawal_applications[0].reason": "exact:rent",
      "tables.withdrawal_applications[0].amount": "exact",
      "tables.withdrawal_applications[0].status": "in_set:submitted,approved",
  }
  ```

### 3.7 训练考察维度
- **动态限额拦截与多轮协商**：模型不能因为工具返回 `AMOUNT_EXCEEDS_LIMIT` 就盲目转人工或挂断，而必须具备"解释政策上限 $\rightarrow$ 询问用户是否调整为上限金额 $\rightarrow$ 重新提交"的完整对话闭环能力（对应 `BD-N1` / `BD-N3` 边界对比样本）。
- **前置资格依赖**：防止未核验资格直接提交扣款的跳步行为。

---

## 4. Task Type 3：withdrawal_for_purchase（购房提取公积金）

### 4.1 业务背景与真实政务场景映射
- **现实映射**：缴存职工购买自住商品房或存量二手房，申请提取公积金用于支付购房款或首付款。
- **业务特性**：属于**多要素复合主体（Multi-Entity Composite Subject）核验业务**。除了核验提取人自身身份和资格外，必须向住建系统交叉核验网签购房合同的真实性、网签备案状态（`filing_status`）以及房屋买受人（`buyer_id_number`）是否为申请人本人。

### 4.2 `required_slots` 与追问策略
- **必填槽位**：`required_slots = ["id_number", "requested_amount", "contract_number"]`（身份证号、申请提取金额、购房合同编号）。
- **追问策略**：购房合同编号（`contract_number`）是法定的关联业务凭证编号，若用户遗漏，Agent 必须明确向群众索取。

### 4.3 工具清单与调用时序约束

#### 工具清单
1. `verify_identity`（Read）：实名核验。
2. `verify_delegate_authorization`（Read）：代办核验。
3. `check_eligibility`（Read）：校验购房提取资格（参数 `withdraw_reason="purchase"`）。
4. `verify_purchase_contract`（Read）：网签购房合同跨部门核验。
5. `submit_purchase_withdrawal`（Write）：提交购房提取申请。

#### 时序与 Precondition 依赖 DAG
```mermaid
graph TD
    V["verify_identity(id_number)"] -->|"identity_verified(id_number)"| E["check_eligibility(id_number, purchase)"]
    V -->|"identity_verified(id_number)"| C["verify_purchase_contract(contract_number, id_number)"]
    E -->|"eligibility_confirmed(id_number)"| S["submit_purchase_withdrawal(id_number, amount, contract_number)"]
    C -->|"contract_verified(id_number, contract_number)"| S
```

- **复合主体绑定设计（Composite Subject Binding）**：
  在 `src/agentic_gov/task_types/housing_fund/withdrawal_for_purchase.py` 中：
  ```python
  VERIFY_PURCHASE_CONTRACT_SPEC = ApiSpec(
      tool_name="verify_purchase_contract",
      preconditions=["identity_verified"],
      postconditions=["contract_verified"],
      # 二元组绑定：同时绑定身份证与合同号
      postcondition_subject_refs={
          "contract_verified": ("args.id_number", "args.contract_number"),
      },
      ...
  )
  ```
  **核心安全价值**：彻底防范"拿合同 A 的核验通过状态，去提交合同 B 的提取申请"或"拿张三核验过的合同，帮李四提交提取"的越权漏洞。

### 4.4 政策规则定义

```python
# 文件位置: src/agentic_gov/task_types/housing_fund/withdrawal_for_purchase.py
POLICY_CARD = PolicyCard(
    policy_id="HF-WD-PURCHASE",
    policy_version="v1.0",
    task_type="withdrawal_for_purchase",
    required_slots=["id_number", "requested_amount", "contract_number"],
    preconditions=["identity_verified", "eligibility_confirmed", "contract_verified"],
    hard_rules=[
        "no_sensitive_write_before_identity_verification",
        "no_approval_if_ineligible",
        "no_approval_without_contract_verification",
        "verified_delegate_without_authorization_must_finish_with_refusal",
    ],
    escalation_conditions=[
        "eligibility_account_not_found",
        "eligibility_inactive_account",
        "contract_not_found",
        "contract_owner_mismatch",
        "bank_account_not_linked",
        "contract_authenticity_disputed",
        "amount_exceeds_policy_limit",
        "coowner_conflict",
        "user_requests_manual_support",
    ],
    policy_limit_declarations={
        "withdrawal_limit_purchase": {"unit": "CNY", "default_range": [500000, 2000000]}
    },
    mandatory_disclosures={
        "Finish": [
            "processing_time",
            "required_documents",
            "amount_not_exceeding_purchase_price",
            "result_or_next_step",
        ],
        "Escalate": ["result_or_next_step"],
        "FinishWithRefusal": ["result_or_next_step"],
    },
    allowed_tools=[
        "verify_identity",
        "verify_delegate_authorization",
        "check_eligibility",
        "verify_purchase_contract",
        "submit_purchase_withdrawal",
    ],
)
```

- **政策限额计算规则**：
  - `withdrawal_limit_purchase` 离散取值池（`constants.py`）：`[500000, 800000, 1000000, 1500000, 2000000]` 元。
  - **三道限额取小约束**：
    $$\text{effective\_limit} = \min(\text{account.balance}, \text{policy\_limit}, \text{contract.purchase\_price})$$
    提取总额不仅不能超过公积金账户余额与政策上限，还**绝对不能超过购房总价（`purchase_price`）**。
- **必告知项（`mandatory_disclosures`）**：
  - 成功办结时，除办理时限与下一步指引外，必须额外告知：所需纸质备查材料（`required_documents`，如契税完税凭证、购房发票）、提取金额不得超过购房总价规则（`amount_not_exceeding_purchase_price`）。

### 4.5 错误分支全表

| 触发工具 | 错误码 (`SandboxError`) | 是否可恢复 (`recoverable`) | 触发条件 | Agent 期望应对行为与终态 |
|---|---|---|---|---|
| `verify_purchase_contract` | `CONTRACT_NOT_FOUND` | ❌ 否 | 住建系统无此合同记录 | 告知合同查无记录，执行 `Escalate` 转人工核验购房合同 |
| `verify_purchase_contract` | `CONTRACT_NOT_FILED` | ❌ 否 | 合同尚未完成官方网签备案（`filing_status != 'filed'`） | 告知未完成网签备案不具备提取资格，以 `FinishWithRefusal` 依规拒绝 |
| `verify_purchase_contract` | `CONTRACT_OWNER_MISMATCH` | ❌ 否 | 合同买受人身份证与申请人不一致 | 涉嫌代办或产权人争议，执行 `Escalate` 转人工审批 |
| `submit_purchase_withdrawal` | `AMOUNT_EXCEEDS_PURCHASE_PRICE` | ❌ 否 (Tool级)<br>✅ 是 (对话级) | 申请金额超过房屋总价 | 告知提取额度不能超过购房款总额，协商降低至购房总价后重试 |
| `submit_purchase_withdrawal` | `AMOUNT_EXCEEDS_LIMIT` | ❌ 否 (Tool级)<br>✅ 是 (对话级) | 申请金额超过余额或政策上限 | 告知政策上限并协助调整至限额后重试 |
| `submit_purchase_withdrawal` | `BANK_ACCOUNT_NOT_LINKED` | ❌ 否 | 账户未绑定银行卡 | 告知缺少收款卡，执行 `Escalate` |

### 4.6 流程变体与沙箱对比规则（CompareSpec）
- 办结终态（`Finish`）必须记录写入的合同编号，并精确扣减余额：
  ```python
  # COMPARE_SPEC_BY_FLOW[None]["Finish"]
  {
      "tables.fund_account[0].balance": "exact",
      "tables.withdrawal_applications[0].reason": "exact:purchase",
      "tables.withdrawal_applications[0].amount": "exact",
      "tables.withdrawal_applications[0].contract_number": "exact",
      "tables.withdrawal_applications[0].status": "in_set:submitted,approved",
  }
  ```

### 4.7 训练考察维度
- **外部系统异构数据校验**：考察 Agent 在长对话中搬运并比对合同号、买受人信息的能力。
- **拒绝（Refusal）与转人工（Escalate）的精细区分**：
  - `CONTRACT_NOT_FILED`（未备案）属于法理上的硬性不符合条件 $\rightarrow$ 期望 `FinishWithRefusal`。
  - `CONTRACT_OWNER_MISMATCH`（买受人不一致）可能属于配偶/共有人共同购房提取 $\rightarrow$ 期望 `Escalate` 进入人工材料复审通道。

---

## 5. Task Type 4：loan_repayment_query（贷款还款查询与提前还款）

### 5.1 业务背景与真实政务场景映射
- **现实映射**：市民办理个人住房公积金贷款相关业务，包含两种典型场景：
  1. **纯查询（`query_only`）**：查询当前贷款余额、月供金额、剩余期数、还款利率及还款状态；
  2. **提前还款办理（`with_prepayment`）**：职工希望提前偿还部分或全部贷款本金，需要系统先行精确计算违约金/罚息、试算变更后的月供或缩期方案，确认无误后提交还款申请。
- **业务特性**：属于**复杂状态机计算前置（Calculation-Before-Write）与动态分支变体业务**。是整个系统中业务逻辑最严密、训练难度最高的事项。

### 5.2 `required_slots` 与追问策略（重点：v1.5 架构决策）
- **必填槽位**：`required_slots = ["id_number"]`。
- **关键设计哲学（为什么不包含 `prepayment_amount` 和 `prepayment_type`？）**：
  - 在早期版本（v1.4）讨论中，曾有争论是否将提前还款金额和类型也放入 `required_slots`。
  - **最终裁决**：若放入 `required_slots`，会导致在纯查询场景下，Agent 一进线就向用户追问"您打算还多少钱"，产生严重的**过度追问（Eager Slot-Filling）**。
  - **真正的政务决策逻辑**：Agent 必须先执行 `query_loan_info` 查得客户的贷款状态和剩余本金，再根据群众意图**动态决定是否需要后续追问提前还款金额与类型**。条件槽的约束由下游工具 `calculate_prepayment` 的 `required_args` 在运行时保证。

### 5.3 工具清单与调用时序约束

#### 工具清单
1. `verify_identity`（Read）：身份核验。
2. `verify_delegate_authorization`（Read）：代办核验。
3. `query_loan_info`（Read）：获取名下公积金贷款明细。
4. `calculate_prepayment`（Read）：纯数学计算工具，计算罚息、新月供或新剩余期限（**只读计算，绝不修改 DB**）。
5. `submit_prepayment_request`（Write）：提交提前还款申请，更新贷款台账与状态。

#### 时序与 Precondition 依赖 DAG
```mermaid
graph TD
    subgraph Flow 1: query_only [纯查询流程]
        V1["verify_identity(id_number)"] -->|identity_verified| Q1["query_loan_info(id_number)"]
        Q1 --> Finish1["Finish (告知数据时效与贷款详情)"]
    end

    subgraph Flow 2: with_prepayment [提前还款流程]
        V2["verify_identity(id_number)"] -->|identity_verified| Q2["query_loan_info(id_number)"]
        Q2 -->|"loan_info_retrieved(id_number, loan_id)"| C2["calculate_prepayment(id_number, loan_id, amount, type)"]
        C2 -->|"prepayment_calculated(id_number, loan_id)"| S2["submit_prepayment_request(id_number, loan_id, amount, type)"]
        S2 --> Finish2["Finish (告知还款计划与扣款时效)"]
    end
```

- **长程实体搬运（Result-to-Args Subject Binding）**：
  - `query_loan_info` 的返回值包含系统生成的 `loan_id`。
  - 其 Postcondition 声明：`postcondition_subject_refs={"loan_info_retrieved": ("args.id_number", "result.loan_id")}`。
  - 下游 `calculate_prepayment` 与 `submit_prepayment_request` 的 Precondition 要求 `("args.id_number", "args.loan_id")` 必须精确匹配。
  - **核心保障**：Agent 必须如实提取前序查询返回的 `loan_id` 并沿调用链透传，任何模型幻觉编造的 `loan_id` 都会在 Precondition 阶段被沙箱拦截。

- **跨调用历史一致性校验（`PREPAYMENT_INPUT_MISMATCH` 防御）**：
  在 `handle_submit_prepayment_request` 内部，通过只读 `call_log` 溯源上一笔成功的 `calculate_prepayment` 记录：
  ```python
  # 源码位置: src/agentic_gov/task_types/housing_fund/loan_repayment_query.py
  for field in ("prepayment_amount", "prepayment_type", "repayment_plan_strategy"):
      calculate_value = last.request_args.get(field, "reduce_payment")
      submit_value = args.get(field, "reduce_payment")
      if calculate_value != submit_value:
          return error_result(
              SandboxError.PREPAYMENT_INPUT_MISMATCH,
              field=field,
              calculate_value=calculate_value,
              submit_value=submit_value,
          )
  ```
  **业务防御目标**：严禁"试算按 5 万元算，提交却按 10 万元扣款"的参数漂移，确保用户在对话中确认的试算方案与最终扣款申请严格一致。

### 5.4 政策规则定义

```python
# 文件位置: src/agentic_gov/task_types/housing_fund/loan_repayment_query.py
POLICY_CARD = PolicyCard(
    policy_id="HF-LOAN-REPAY",
    policy_version="v1.0",
    task_type="loan_repayment_query",
    required_slots=["id_number"],
    preconditions=["identity_verified", "loan_info_retrieved"],
    hard_rules=[
        "no_prepayment_submission_before_calculation",
        "no_prepayment_if_loan_overdue_or_combined",
        "verified_delegate_without_authorization_must_finish_with_refusal",
    ],
    escalation_conditions=[
        "bank_account_not_linked",
        "combined_loan_detected",
        "loan_overdue",
        "prepayment_penalty_disputed",
        "user_requests_manual_support",
    ],
    policy_limit_declarations={
        "min_prepayment_amount": {"unit": "CNY", "default_range": [5000, 30000]},
        "prepayment_penalty_rate": {"unit": "ratio", "default_range": [0, 0.02]},
    },
    mandatory_disclosures={
        "query_only": {
            "Finish": ["loan_info_data_freshness", "result_or_next_step"],
            "Escalate": ["result_or_next_step"],
            "FinishWithRefusal": ["result_or_next_step"],
        },
        "with_prepayment": {
            "Finish": [
                "loan_info_data_freshness",
                "result_or_next_step",
                "processing_time",
                "prepayment_penalty",
                "new_repayment_plan_summary",
            ],
            "Escalate": ["result_or_next_step"],
            "FinishWithRefusal": ["result_or_next_step"],
        },
    },
    allowed_tools=[
        "verify_identity",
        "verify_delegate_authorization",
        "query_loan_info",
        "calculate_prepayment",
        "submit_prepayment_request",
    ],
)
```

- **数学试算逻辑（`calculate_prepayment`）**：
  1. **违约金/补偿金计算**：$\text{penalty\_amount} = \text{round}(\text{prepayment\_amount} \times \text{penalty\_rate}, 2)$。
  2. **结清模式（`prepayment_type == 'full'`）**：新月供置为 `None`，剩余期数置 0，剩余本金置 0。
  3. **部分还款 - 减少月供模式（`reduce_payment`）**：期限 $n$ 不变，新本金 $P' = P - \text{amount}$，按等额本息公式重算新月供：
     $$\text{monthly\_payment}' = P' \cdot \frac{r(1+r)^n}{(1+r)^n - 1} \quad \left(r = \frac{\text{annual\_rate}}{12}\right)$$
  4. **部分还款 - 缩短期限模式（`shorten_term`）**：月供保持不变，通过仿真还款循环确定偿清所需的新月数 $n'$。

### 5.5 错误分支全表

| 触发工具 | 错误码 (`SandboxError`) | 是否可恢复 (`recoverable`) | 触发条件 | Agent 期望应对行为与终态 |
|---|---|---|---|---|
| `query_loan_info` | `NO_ACTIVE_LOAN` | ❌ 否 | 借款人无任何贷款记录，或贷款已结清（`settled`） | 告知当前名下无有效公积金贷款，以 `FinishWithRefusal` 结单 |
| `query_loan_info` | （发现 `loan_type == 'combined'`）| ❌ 否 | 属于公积金+商业银行组合贷款 | 组合贷涉及商业银行审批，线上无法直接还款，执行 `Escalate` 转人工线下处理 |
| `query_loan_info` | （发现 `status == 'overdue'`） | ❌ 否 | 贷款已存在逾期欠款记录 | 存在逾期无法直接提前还款，执行 `Escalate` 转催收人工处理 |
| `calculate_prepayment` | `BELOW_MINIMUM_PREPAYMENT` | ✅ 是 | 提前还款金额低于起还线（`min_prepayment_amount`） | 告知最低起还金额，向用户确认是否调高至起还线后重试 |
| `calculate_prepayment` | `AMOUNT_EXCEEDS_REMAINING` | ✅ 是 | 提前还款金额超过剩余本金总额（`remaining_principal`） | 告知剩余本金总额，向用户确认调整为全额结清后重试 |
| `submit_prepayment_request` | `PREPAYMENT_INPUT_MISMATCH` | ❌ 否 (Tool级)<br>✅ 是 (对话级) | 提交金额/类型与前序计算试算参数不一致 | 重新以用户最终确认的参数调用 `calculate_prepayment` 后再提交 |
| `submit_prepayment_request` | `BANK_ACCOUNT_NOT_LINKED` | ❌ 否 | 账户未绑定用于扣划还款的银行卡 | 告知未绑卡，执行 `Escalate` 转人工柜面/系统绑卡 |

### 5.6 流程变体与沙箱裁剪机制

#### 1. Runtime Bundle 动态工具裁剪（`runtime_bundle.py`）
在纯查询场景（`query_only`）下，必须防止 Agent 意外暴露或调用写接口：
```python
# 文件位置: src/agentic_gov/task_types/runtime_bundle.py
_QUERY_ONLY_BLOCKED_TOOLS: frozenset[str] = frozenset({"submit_prepayment_request"})

def filter_tool_names_for_task(task: CanonicalTask, tool_names: ...) -> list[str]:
    ordered = list(tool_names)
    if task.task_type == "loan_repayment_query" and task.metadata.flow_variant == "query_only":
        return [name for name in ordered if name not in _QUERY_ONLY_BLOCKED_TOOLS]
    return ordered
```
在 `query_only` 任务实例中，沙箱引擎会自动将 `submit_prepayment_request` 从 `allowed_tools` 及 Prompt API 列表中剔除。若 Agent 强行调用，引擎会在第 2 步抛出 `TOOL_NOT_ALLOWED`。

#### 2. 双层 Mandatory Disclosures
为了避免对纯查询用户误报提前还款违约金信息，`PolicyCard.mandatory_disclosures` 在该事项中采用**双层字典结构**：
- `query_only` $\rightarrow$ 仅要求披露 `loan_info_data_freshness` 与 `result_or_next_step`；
- `with_prepayment` $\rightarrow$ 增加要求披露 `processing_time`、`prepayment_penalty`（违约金/罚息）、`new_repayment_plan_summary`（新还款方案摘要）。

#### 3. Flow-Conditioned CompareSpec
```python
COMPARE_SPEC_BY_FLOW = {
    "query_only": {"Finish": {}, "Escalate": {}, "FinishWithRefusal": {}},
    "with_prepayment": {
        "Finish": {
            "tables.prepayment_applications[0].loan_id": "exact",
            "tables.prepayment_applications[0].prepayment_amount": "exact",
            "tables.prepayment_applications[0].prepayment_type": "exact",
            "tables.prepayment_applications[0].status": "in_set:submitted,approved",
        },
        "Escalate": {},
        "FinishWithRefusal": {},
    },
}
```

### 5.7 训练考察维度（含 Experiment Note 003 复盘）
- **SFT 饱和与失效复盘（Note 003）**：
  在 Phase 3 SFT checkpoint-720 评估中，各任务 Strict Success Rate 表现呈现严重分化：
  - `account_balance_query`: 87.1%
  - `withdrawal_for_rent`: 85.0%
  - `withdrawal_for_purchase`: 41.2%
  - **`loan_repayment_query`: 16.1%（Hard Violation 率高达 22.6%）**
- **失败根因**：贷款还款场景具有高密度的条件分支与严格的时序依赖。纯 SFT 模仿学习容易导致模型"过度泛化"，在 `query_only` 场景误转人工（Escalate），在需要转人工的逾期/组合贷场景盲目执行还款计算。
- **强化学习（GRPO）演进**：这一现象直接证实了引入 Phase 6 GRPO 的必要性——通过基于沙箱状态的严格奖励函数（$R_{\text{complete}}$ 验证 DB 写状态与参数搬运、$R_{\text{escalate}}$ 验证转人工理由的精确触发、$R_{\text{format}}$ 压制非法工具调用），引导模型在对抗与复杂分支场景下收敛到精确的决策边界。

---

## 6. 难度递进设计意图与强化学习演进

### 6.1 难度阶梯设计哲学：⭐ $\rightarrow$ ⭐⭐⭐⭐

整个公积金业务域的设计，遵循了软件工程与强化学习课程学习（Curriculum Learning）的渐进复杂度原则：

```mermaid
timeline
    title agentic-gov 事项难度递进阶梯
    ⭐ account_balance_query : 只读单查 : 身份核验前置 : 0-Write 状态无损
    ⭐⭐ withdrawal_for_rent : 线性单写 : 资格判定 : 动态限额协商
    ⭐⭐⭐ withdrawal_for_purchase : 复合主体 : 跨部门数据核验 : 3道限额取小
    ⭐⭐⭐⭐ loan_repayment_query : 状态机与分支变体 : 计算前置 : 运行时工具裁剪
```

### 6.2 引入的新挑战维度矩阵

| 维度 | `account_balance_query` (⭐) | `withdrawal_for_rent` (⭐⭐) | `withdrawal_for_purchase` (⭐⭐⭐) | `loan_repayment_query` (⭐⭐⭐⭐) |
|---|---|---|---|---|
| **操作性质** | 纯只读（Read-Only） | 包含单点写入（Single-Write） | 包含单点写入（Single-Write） | 读/写分支动态可变（Dual-Variant） |
| **状态机深度** | 2 步线性链 | 3 步线性链 | 4 步分叉汇聚链 | 2~4 步动态条件分支与计算环 |
| **Subject 绑定复杂度** | 单一主体 `(id_number)` | 单一主体 `(id_number)` | 复合主体 `(id_number, contract_number)` | 长程动态主体 `(id_number, result.loan_id)` |
| **限额与边界校验** | 无 | 单一动态限额 `min(balance, limit)` | 3维复合限额 `min(bal, lim, price)` | 动态区间校验（最低起还线与剩余本金） |
| **工具间依赖计算** | 无 | 无 | 无 | 必须经由 `calculate` 试算，并在 `submit` 校验一致性 |
| **流程裁剪支持** | 静态单流程 | 静态单流程 | 静态单流程 | 依赖 `runtime_bundle` 动态剔除写工具 |
| **披露标准层级** | 单层披露标准 | 单层披露标准 | 单层披露标准 | 双层动态披露标准（按 `flow_variant`） |

### 6.3 训练与评测视角：为什么这一设计能够有效支撑 RL 演化？

1. **确定性的可证伪性（Falsifiability）**：
   通过 `Precondition` / `Postcondition` 的 Subject 绑定与 `CompareSpec` 的数据库字段级断言，沙箱能够对 Agent 的每一步操作给出**确定的、无歧义的 Binary Reward**。
2. **丰富的错误恢复空间（Recoverable Error Surface）**：
   在 `AMOUNT_EXCEEDS_LIMIT`、`BELOW_MINIMUM_PREPAYMENT`、`TEMPORARY_UNAVAILABLE` 等场景下，系统不直接宣告失败，而是为 Agent 提供了"感知错误 $\rightarrow$ 解释政策 $\rightarrow$ 协商确认 $\rightarrow$ 修正参数 $\rightarrow$ 重新提交"的多轮自我纠错空间。
3. **真实政务价值闭环**：
   四大事项覆盖了政务服务中**90%以上的核心模式**（只读查询、常规申报、多跨协同审批、金融信贷计算），为构建高可靠、合规可解释的政务垂直大模型智能体提供了标准基准。

---

## 7. 面试复盘 Q&A 提炼（高频自测清单）

### Q1：为什么 `loan_repayment_query` 的 `required_slots` 只有 `id_number`，而没有把金额和还款类型放进去？
> **答题关键**：
> 1. 这是在 Phase 1 v1.5 Code Review 中的核心决策。`loan_repayment_query` 同时承载了**纯查询**与**提前还款**两种场景。
> 2. `required_slots` 代表 Agent 在调用任何工具前**必须无条件向群众收集的槽位**。如果将 `prepayment_amount` 设为无条件必填，会导致纯查询用户一进线就被追问还款金额，破坏了"先查系统资产，再决定下一步意图"的交互原则。
> 3. 提前还款的金额与类型约束通过下游工具 `calculate_prepayment` 的 `required_args` 及运行时 Precondition 在条件分支中精确保证。

### Q2：系统中的 Precondition 是如何防止 Agent "张冠李戴"（跨身份/跨合同越权）的？
> **答题关键**：
> 1. 在 v1.4 及更早版本中，Precondition Flag 是简单的全局布尔值，存在"验证了 A 的身份，却能拿着 B 的身份证号查余额"的严重安全漏洞。
> 2. v1.5 引入了声明式的 **Subject Binding（主体绑定）** 机制。`ApiSpec` 通过 `precondition_subject_refs` 和 `postcondition_subject_refs` 声明 flag 绑定的字段元组（如 `("args.id_number",)` 或 `("args.id_number", "args.contract_number")`）。
> 3. 沙箱引擎在底层以 `(flag_name, subject_tuple)` 作为账本键。下游工具执行前，引擎必须核验当前参数对应的主体元组是否已获前置授权，从基础设施层杜绝了越权漏洞。

### Q3：`calculate_prepayment` 和 `submit_prepayment_request` 之间为什么要设计 `PREPAYMENT_INPUT_MISMATCH` 检查？
> **答题关键**：
> 1. 金融与政务业务要求"所见即所得"，用户在对话中确认的试算方案（金额、还款类型、还款策略）必须与最终落库扣减的方案严格一致。
> 2. `submit_prepayment_request` handler 通过引擎传入的只读 `call_log`，自动回溯最近一次成功的 `calculate_prepayment` 记录，比对关键字段。若模型在长文本生成中出现参数漂移，沙箱会立即拦截并返回 `PREPAYMENT_INPUT_MISMATCH`，强制模型重新试算。

### Q4：为什么购房提取中的 `CONTRACT_NOT_FILED` 对应 `FinishWithRefusal`，而 `CONTRACT_OWNER_MISMATCH` 对应 `Escalate`？
> **答题关键**：
> 1. **法理不可违（Refusal）**：未在住建系统完成网签备案（`not_filed`）的购房合同，在法律层面不具备提取公积金的基本法定条件，AI 客服应依据政策明确拒绝受理，无需耗费人工资源。
> 2. **业务存疑需人工裁决（Escalate）**：买受人身份证不一致（`mismatch`）在现实中常见于夫妻共同购房、直系亲属共有产权等复杂情况。AI 无法直接判定其不合法，但线上无法自动核验结婚证等辅助证明，因此必须转交人工审核通道。
