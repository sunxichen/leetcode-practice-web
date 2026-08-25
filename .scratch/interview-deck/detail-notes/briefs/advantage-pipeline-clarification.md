# Follow-up brief：把 PPO / GRPO family 的 Advantage 来源讲清楚

用户指出一个正确且关键的问题：当前专题虽然写了 GRPO 的 group-relative advantage，却没有把 **PPO 的 A 如何算出**，以及 **CISPO / DAPO / GSPO 与 GRPO advantage 的关系**明确做成第一层概念。这会让读者误以为 loss function 自己负责生成 A，或误以为所有 CISPO 都天然等于 GRPO。

请修改以下两个文件：

- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/rl-objectives-ppo-grpo-cispo-reinforce-dapo-gspo-dpo.md`
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/rl-objectives-core-pseudocode.py`

不要修改可运行的 `rl-objectives-losses.py`，除非发现会导致它与修正后的概念直接矛盾。

## 必须补上的概念

### 1. 先建立二层分离

在统一骨架后尽早加一个很清楚的小节：

- **层 A：Advantage / training signal 怎么产生**（reward -> A）
- **层 B：policy surrogate loss 怎么消费 A**（A + new/old logp -> loss）

明确：PPO / GRPO / CISPO / DAPO / GSPO 的 loss 往往只消费 `A`，但 `A` 的来源是决定算法/配方含义的上游设计。

### 2. PPO 的 A 要精确说明

- 原始 PPO loss 不规定唯一的 advantage estimator；其常见经典实践为 Critic 估计 `V_phi(s)`，用 TD residual + Generalized Advantage Estimation：
  `delta_t = r_t + gamma * V(s_{t+1}) - V(s_t)`
  `A_t^GAE = sum_l (gamma * lambda)^l * delta_{t+l}`
- 说明 PPO 在 LLM 的 token/action 对应关系，但不要说所有 LLM PPO 必须用 GAE：有些 RLHF/agent recipe 也会将 outcome reward 广播或采用其他 reward decomposition / advantage estimator。核心是：**PPO clip loss 接收 A，不生产 A。**
- 补充 Critic 的优点（更低方差、可做逐步 credit assignment）与成本/失败模式（额外模型、value drift/value misfit）。

### 3. GRPO family 的 A 要逐个精确区分

添加一张小表/流程图，至少包含：

| 方法 | A 的来源 | 是否方法本体强制该来源 | 在本文/agentic-gov 中的关系 |

- **GRPO**：同一 prompt 的 G 个 completion reward，group mean/std z-score；无 critic。`A_i` 通常广播到该 completion 的 response tokens。此处是 GRPO 的关键定义。
- **DAPO**：原论文的 LLM-RL 配方建立在 GRPO group-relative advantage 上；dynamic sampling 过滤/补采 reward 方差为 0 的 group。它主要改的是 clip/reduction 与系统采样，不要说 DAPO 重新定义了 A。
- **GSPO**：原论文的 group policy optimization recipe 仍用 group-relative reward/advantage；核心创新是 ratio/reduction 的 sequence-level 变化，而不是另造 A。请重新核对一手论文用词，避免绝对化。
- **CISPO**：CISPO 的 detached clipped IS-weight policy objective 本身可消费任意 A，并**不在狭义定义上强制 GRPO advantage**。但 MiniMax 的 group-RL recipe 和 agentic-gov/ART 的工程组合中可以喂 GRPO group-relative A。请把“CISPO 方法本体”与“CISPO + GRPO reward/advantage 的训练配方”分开。
- **DPO**：无 online reward/advantage，单列为边界。

### 4. Pseudocode 需更像面试答案

在 `rl-objectives-core-pseudocode.py` 顶部添加一个很短的 **Advantage pipeline map**：

```python
# PPO: rewards + critic_values -> GAE advantages [B, T] -> PPO loss
# GRPO: grouped trajectory rewards -> group z-score A_i [B] -> broadcast to tokens -> GRPO loss
# DAPO/GSPO: same GRPO-style A in their original group-RL recipe -> their changed surrogate/reduction
# CISPO: arbitrary A -> CISPO loss; agentic-gov passes GRPO-style A
# DPO: chosen/rejected preferences -> DPO loss (no A)
```

并新加一个 `gae_advantage(...)` Python-style 伪代码函数（8-15 行），只展示 TD residual 反向递推与 mask，注明 critic value 是输入、stop-gradient 的位置和 episode terminal 的处理假设。

为了对比突出：

- 在 `ppo_clip_loss` 前明确 `advantages` 是 `gae_advantage` 的典型产物，不要让函数本身看起来在生成 A。
- GRPO 函数明确 `adv = group_relative_advantage(rewards, group_id)` 后 broadcast；或者新增一段 5 行的 `grpo_advantage_pipeline`，让 loss 保持精简。
- DAPO / GSPO 函数前明确其 input `advantages` 在原论文 group-RL recipe 中复用该 GRPO pipeline。
- CISPO 前明确 `advantages` 为外部输入；另用一行展示 agentic-gov call site 是 `group_relative_advantage(...) -> cispo_loss(...)`。不要因此把 CISPO 本体定义错。

保持“不可运行、短、核心 diff”定位，不把文件膨胀成完整可运行实现。

## 事实要求

先基于已有一手来源核查；如有任何关于 GSPO/CISPO advantage 来源的版本差异，宁愿明确条件/版本，也不要过度断言。完成后回复：改了什么、关系表最终结论、以及有无须在原可运行代码中同步的矛盾。