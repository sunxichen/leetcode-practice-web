"""02_sandbox.py — Phase 1: 领域无关沙箱引擎与轻量内存数据库（Sandbox Engine & In-Memory DB）

【全链路位置】
本模块位于 agentic-gov 的执行底座（Phase 1）。
它实现了一个无外部系统依赖、纯 Python 内存化、具备事务原子性与完整错误注入能力的沙箱运行时。
在 Phase 2（SFT 数据合成）、Phase 3（静态多轮回放评测）以及 Phase 6（自由多轮 GRPO Rollout）中，
Agent 的每一次 `Call_API` 工具调用均由该沙箱引擎执行并反馈状态。
"""

from __future__ import annotations

import copy
from typing import Any, Callable

# ---------------------------------------------------------------------------
# 真实源码引用路径 (verified against src/agentic_gov/...)
# ---------------------------------------------------------------------------
from agentic_gov.schemas.sandbox import (
    SandboxResult,
    ToolCallRecord,
    DbSnapshot,
    SandboxError,
)
from agentic_gov.sandbox.errors import (
    UnknownToolError,
    SandboxBugError,
    error_result,
    ok_result,
)
from agentic_gov.sandbox.database import (
    Database,
    IdGenerator,
    TABLE_ID_FIELDS,
)
from agentic_gov.sandbox.engine import (
    Sandbox,
    _validate_arg,
    _subject_repr,
)
from agentic_gov.schemas.api_spec import ApiSpec, ArgSpec
from agentic_gov.schemas.policy import PolicyCard


# ===========================================================================
# 1. 内存数据库实现与原子操作 (In-Memory Database)
# ===========================================================================

class InMemoryDatabase:
    """受控的内存数据库，提供深拷贝读隔离、原子主键生成与变更日志追踪。
    
    【设计考量】
    1. 读隔离：所有 get / find_one 返回的字典均经过 copy.deepcopy，防止 Handler 
       通过持有引用在外部静默篡改数据库内部状态；
    2. 确定性自增 PK：IdGenerator 绑定 task_id 种子，按表前缀（如 APP_00001, PPA_00001）
       确定性自增，保证无论何时重放，同一任务生成的申请单号完全一致；
    3. 变更审计：所有 insert / update 都会追加记录到 _change_log，用于后续
       比对分析与状态回滚。
    """

    def __init__(self, initial_state: DbSnapshot, id_generator: IdGenerator) -> None:
        self._tables: dict[str, list[dict[str, Any]]] = copy.deepcopy(initial_state.tables)
        self._id_gen = id_generator
        self._change_log: list[dict[str, Any]] = []

    def get(self, table: str, **where: Any) -> list[dict[str, Any]]:
        """按条件查询多行记录（只读防御性深拷贝）。"""
        rows = self._tables.get(table, [])
        if not where:
            return [copy.deepcopy(r) for r in rows]
        matched = [r for r in rows if all(r.get(k) == v for k, v in where.items())]
        return [copy.deepcopy(r) for r in matched]

    def find_one(self, table: str, **where: Any) -> dict[str, Any] | None:
        """查询单行匹配记录。"""
        rows = self.get(table, **where)
        return rows[0] if rows else None

    def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        """插入一行记录，自动为申办表分配确定性自增主键。"""
        new_row = copy.deepcopy(row)
        if table in TABLE_ID_FIELDS:
            pk_field, prefix = TABLE_ID_FIELDS[table]
            if pk_field not in new_row:
                new_row[pk_field] = self._id_gen.next(prefix)
        
        self._tables.setdefault(table, []).append(new_row)
        self._change_log.append({"op": "insert", "table": table, "row": copy.deepcopy(new_row)})
        return copy.deepcopy(new_row)

    def update(self, table: str, where: dict[str, Any], update_fields: dict[str, Any]) -> int:
        """更新匹配行字段并记录审计日志。"""
        rows = self._tables.get(table, [])
        count = 0
        for r in rows:
            if all(r.get(k) == v for k, v in where.items()):
                r.update(copy.deepcopy(update_fields))
                count += 1
                self._change_log.append({
                    "op": "update",
                    "table": table,
                    "where": where,
                    "update": update_fields,
                })
        return count

    def snapshot(self) -> DbSnapshot:
        """导出当前数据库全量快照。"""
        return DbSnapshot(tables=copy.deepcopy(self._tables))


# ===========================================================================
# 2. 领域无关沙箱引擎核心执行生命周期 (Sandbox Engine Lifecycle)
# ===========================================================================

class SandboxRuntime:
    """单 Episode 沙箱运行时引擎。
    
    【执行生命周期 8 步规范】
    每次 Agent 发起 `execute(tool_name, args)` 时，严格按以下管道流转：
      Step 1 [工具存在性检查]：校验 tool_name 是否在 api_specs 中，防止未知工具调用；
      Step 2 [业务白名单校验]：校验 tool_name 是否属于 PolicyCard.allowed_tools；
      Step 3 [必填字段检查]：校验 args 是否包含 ApiSpec.required_args；
      Step 4 [类型与正则校验]：校验入参格式（如 18 位身份证正则、非负金额数值）；
      Step 5 [前置条件校验]：基于 Subject 检查 RuntimeFlags（如未 verify_identity 之前禁止查询）；
      Step 6 [错误注入拦截]：按 call_counter 检查是否有配置的 InjectedError（模拟网络瞬断）；
      Step 7 [Handler 真实分发]：将只读 call_log 与 DB 实例注入具体业务 Handler；
      Step 8 [后置状态更新]：若 Handler 返回 ok，将 ApiSpec.postconditions 写入 RuntimeFlags。
    """

    def __init__(
        self,
        task_id: str,
        db_init_state: DbSnapshot,
        policy_card: PolicyCard,
        api_specs: dict[str, ApiSpec],
        tool_handlers: dict[str, Callable],
        sandbox_overrides: dict[str, Any] | None = None,
    ) -> None:
        self.task_id = task_id
        self.policy_card = policy_card
        self.api_specs = api_specs
        self.tool_handlers = tool_handlers
        
        # 初始化确定性 ID 生成器与内存 DB
        self._id_gen = IdGenerator(seed=task_id)
        self.db = Database(db_init_state, id_generator=self._id_gen)
        
        # 运行时状态标志（如 identity_verified:110101... -> True）
        self.runtime_flags: dict[str, bool] = {}
        self._tool_call_log: list[ToolCallRecord] = []
        self._call_counter: dict[str, int] = {}
        self._pending_injections: list[dict[str, Any]] = (
            sandbox_overrides.get("inject_errors", []) if sandbox_overrides else []
        )

    def execute(self, tool_name: str, args: dict[str, Any]) -> SandboxResult:
        """分发并执行工具调用，返回结构化执行结果。"""
        # Step 1: 工具存在性
        if tool_name not in self.api_specs:
            raise UnknownToolError(f"未注册的工具: {tool_name}")

        # Step 2: 政策允许工具白名单
        if tool_name not in self.policy_card.allowed_tools:
            res = error_result(SandboxError.TOOL_NOT_ALLOWED, tool=tool_name)
            self._record(tool_name, args, res)
            return res

        spec = self.api_specs[tool_name]

        # Step 3: 必填入参存在性
        for req in spec.required_args:
            if req.name not in args:
                res = error_result(SandboxError.MISSING_REQUIRED_ARG, field=req.name)
                self._record(tool_name, args, res)
                return res

        # Step 4: 入参格式与类型校验
        for arg_spec in spec.required_args + spec.optional_args:
            if arg_spec.name in args:
                val = args[arg_spec.name]
                ok, reason = _validate_arg(val, arg_spec)
                if not ok:
                    res = error_result(SandboxError.INVALID_FORMAT, field=arg_spec.name, reason=reason)
                    self._record(tool_name, args, res)
                    return res

        # Step 5: 前置业务条件校验 (Preconditions): 未满足时不递增计数器，直接拦截返回
        for pre in spec.preconditions:
            flag_key = pre
            if not self.runtime_flags.get(flag_key, False):
                res = error_result(SandboxError.PRECONDITION_NOT_MET, missing_precondition=pre)
                self._record(tool_name, args, res)
                return res

        # Step 6: 错误注入拦截 (Error Injection): 仅对合法触达本步骤的调用递增局部工具计数器
        self._call_counter[tool_name] = self._call_counter.get(tool_name, 0) + 1
        injected = self._pop_injection(tool_name, self._call_counter[tool_name])
        if injected:
            # 命中预设注入（如 TEMPORARY_UNAVAILABLE），第 N 次拦截，第 N+1 次放行支持自愈重试
            res = error_result(SandboxError(injected["error_code"]), injected=True)
            self._record(tool_name, args, res)
            return res

        # Step 7: 分发至具体业务 Handler 执行
        handler = self.tool_handlers[tool_name]
        # 传递防御性深拷贝的历史记录，杜绝 handler 污染主调用栈
        safe_call_log = copy.deepcopy(self._tool_call_log)
        res: SandboxResult = handler(self.db, args, safe_call_log)

        # Step 8: 后置状态写入
        if res.status == "ok":
            for post in spec.postconditions:
                self.runtime_flags[post] = True

        self._record(tool_name, args, res)
        return res

    def _pop_injection(self, tool_name: str, call_index: int) -> dict[str, Any] | None:
        """检查当前轮次是否命中预先配置的错误注入。"""
        for i, item in enumerate(self._pending_injections):
            if item.get("tool") == tool_name and item.get("on_call_index", 1) == call_index:
                return self._pending_injections.pop(i)
        return None

    def _record(self, tool_name: str, args: dict[str, Any], result: SandboxResult) -> None:
        """将调用结果存入不可变审计日志。"""
        self._tool_call_log.append(
            ToolCallRecord(
                tool_name=tool_name,
                request_args=copy.deepcopy(args),
                result_status=result.status,
                result_data=copy.deepcopy(result.data),
                error_code=result.error_code,
            )
        )

    def finalize(self) -> DbSnapshot:
        """结束本轮交互并导出最终数据库状态。"""
        return self.db.snapshot()
