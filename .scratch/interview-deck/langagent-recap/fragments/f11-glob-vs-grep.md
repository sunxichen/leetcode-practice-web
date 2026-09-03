# Follow-up #11: glob 与 grep 的区别（语义、框架形态与基线能力）

---

## 1. 电梯答案

- **通用语义区别**：`glob` 负责**文件路径与名称检索**（按通配符模式遍历目录树，只看文件路径与元数据，不读取文件内容，输出匹配的文件/目录路径列表）；`grep` 负责**文件文本内容检索**（在指定文件或目录中做字面量子串匹配，逐行读取文件内容，输出包含匹配项的文件路径、行号及对应行文本）。
- **deepagents 0.6.12 中的形态**：二者在框架中呈现**双层形态**：
  1. **Agent 工具层**（`deepagents.middleware.filesystem`）：分别封装为 `glob`（入参 `pattern`, `path`）与 `grep`（入参 `pattern`, `path`, `glob`, `output_mode`）两个标准 `StructuredTool`；其中仅 `glob` 享有 20s 硬超时与 4 并发信号量保护，`grep` 无超时逻辑（直接调用 backend），二者均有大输出截断（且均列入 `TOOLS_EXCLUDED_FROM_EVICTION`，避免截断后陷入文件重读死循环）；
  2. **Backend 协议层**（`deepagents.backends.protocol.BackendProtocol`）：抽象了 `glob()` / `aglob()` 返回 `GlobResult(matches: list[FileInfo])` 与 `grep()` / `agrep()` 返回 `GrepResult(matches: list[GrepMatch])` 的标准接口，由 `FilesystemBackend`（本地调用 `rg -F` 或 Python 回退）与 `BaseSandbox`/`DaytonaSandbox`（沙箱内执行 `python3 -c "import glob..."` 或 `grep -rHnFZ`）提供底层实现。
- **langAgent develop 基线能力**：Long Task Agent 在构建时使用 `create_deep_agent` 挂载以 `DaytonaSandbox` 为默认后端的 `CompositeBackend`；Agent 能够对沙箱工作区内的源码与产物执行 `glob` 路径发现与 `grep` 内容搜索；而针对挂载的记忆（`/shared/`、`/memories/`）与历史（`/conversation_history/`）等虚拟后端，`glob`/`grep` 均做了主动拦截并返回结构化不支持错误，引导 Agent 改用 `read_file` 精确读取。

---

## 2. 详解

### 2.1 通用语义与核心特征对比

在操作系统与软件工程领域，`glob`（Global Pattern Match）与 `grep`（Global Regular Expression Print）是两类职责正交的检索机制：

| 维度 | `glob` (路径/文件名模式匹配) | `grep` (文件内容检索) |
|---|---|---|
| **检索目标** | 文件系统树中的**路径名、目录名、文件名** | 文件内部的**文本内容 / 字符序列** |
| **是否读取文件内容** | ❌ **否**（仅遍历目录项与 `stat` 元数据） | ✅ **是**（必须打开并逐行扫描文件内容） |
| **标准输入参数** | 1. 路径通配模式 `pattern`（如 `**/*.py`、`tests/test_*.py`）<br>2. 搜索起始根目录 `path`（可选） | 1. 目标搜索文本 `pattern`（deepagents 中为字面量）<br>2. 搜索目录 `path`（可选）<br>3. 文件名过滤通配符 `glob`（可选）<br>4. 输出模式 `output_mode`（可选） |
| **核心通配/匹配语法** | 通配符：`*`（任意字符）、`**`（递归多级目录）、`?`（单个字符）、`[abc]`（字符集） | 字面量子串匹配（deepagents 框架下使用 `-F` 避免正则特殊字符转义歧义） |
| **输出结果结构** | 文件绝对路径列表或 `FileInfo` 结构体（含 `path`, `is_dir`, `size`, `modified_at`） | 匹配项列表 `GrepMatch`（含 `path`, `line` 行号, `text` 行文本）或匹配文件清单/计数 |
| **典型适用场景** | 1. 探索工程目录结构、定位特定后缀文件（如查找所有 `.json`）<br>2. 确认文件是否存在或是否已被创建 | 1. 跨文件搜索特定类名、函数名、配置项声明<br>2. 检索错误堆栈关键字、`TODO` 标记或引用位置 |
| **典型误用与反模式** | 试图用 `glob` 去找“包含某个变量名的文件”（无法感知内容） | 用 `grep` 去遍历大目录寻找文件（开销极大，应先用 `glob` 缩小文件集） |

---

### 2.2 deepagents 0.6.12 框架中的形态与签名实现

在 `deepagents 0.6.12` 中，`glob` 与 `grep` 是 `FilesystemMiddleware` 向大模型暴露的核心感知工具，同时也是后端存储体系的基础协议。

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LLM Agent Tool Layer                            │
│  - glob(pattern, path=None) -> ToolMessage                             │
│  - grep(pattern, path=None, glob=None, output_mode="...") -> ToolMsg  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 调用
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               FilesystemMiddleware (权限拦截 + glob 并发控制 + 截断保护)     │
│  - _glob_slots (BoundedSemaphore=4) & GLOB_TIMEOUT (20.0s)（仅 glob 工具）  │
│  - TOOLS_EXCLUDED_FROM_EVICTION = ("ls", "glob", "grep", ...)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 委派
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   BackendProtocol 统一存储协议契约                       │
│  - glob(pattern: str, path: str | None) -> GlobResult                  │
│  - grep(pattern: str, path: str | None, glob: str | None) -> GrepResult│
└───────┬───────────────────────────┼────────────────────────────┬───────┘
        │                           │                            │
        ▼                           ▼                            ▼
┌──────────────────┐      ┌───────────────────┐       ┌──────────────────┐
│ FilesystemBackend│      │    BaseSandbox    │       │ CompositeBackend │
│ (rg -F / python) │      │ (grep -F / python)│       │ (前缀分发与路由重映射)│
└──────────────────┘      └───────────────────┘       └──────────────────┘
```

#### 1. Agent 工具层（Tool Layer）
由 `deepagents.middleware.filesystem.FilesystemMiddleware` 提供：

- **`glob` 工具**（Schema: `GlobSchema`）：
  - **参数**：`pattern: str`（必须，支持 `**/*.py` 等通配符）、`path: str | None = None`（搜索基准目录）。
  - **运行时保护**：
    - 路径权限校验：`_check_fs_permission(..., "read", permission_path)`。
    - 独立并发池与超时防护：使用 `_glob_slots = threading.BoundedSemaphore(_SYNC_GLOB_WORKERS)`（`_SYNC_GLOB_WORKERS = 4`）限制最多 4 个并发 glob，并由 `concurrent.futures.wait` 施加 `GLOB_TIMEOUT = 20.0s` 硬超时。
    - 结果截断：返回匹配绝对路径的字符串表示，超长自动经 `truncate_if_too_long` 截断。
- **`grep` 工具**（Schema: `GrepSchema`）：
  - **参数**：`pattern: str`（必须，**字面量文本**，非正则表达式）、`path: str | None = None`、`glob: str | None = None`（按文件名先验过滤，如 `*.py`）、`output_mode: Literal["files_with_matches", "content", "count"] = "files_with_matches"`。
  - **格式化输出**：`_format_grep_tool_result` 将底层匹配转换为可读文本：
    - `files_with_matches`：仅列出包含匹配的文件路径（默认）；
    - `content`：输出 `文件路径:行号: 行文本`；
    - `count`：统计各文件匹配次数。
- **大结果逐出排除机制**：
  - `TOOLS_EXCLUDED_FROM_EVICTION` 明确包含了 `"glob"` 与 `"grep"`。
  - **设计动机**：这两个工具内部自带结果截断；当匹配结果过多时，代表 Agent 的查询条件过于宽泛（属于噪声），应当提示 Agent 缩窄搜索范围，而不是将大结果自动转存为磁盘文件（否则容易诱发 Agent 反复 `read_file` 陷入无效循环）。

#### 2. Backend 协议层（Protocol Layer）
在 `deepagents.backends.protocol.BackendProtocol` 中定义了标准抽象：

```python
class BackendProtocol(abc.ABC):
    def glob(self, pattern: str, path: str | None = None) -> GlobResult: ...
    async def aglob(self, pattern: str, path: str | None = None) -> GlobResult: ...

    def grep(self, pattern: str, path: str | None = None, glob: str | None = None) -> GrepResult: ...
    async def agrep(self, pattern: str, path: str | None = None, glob: str | None = None) -> GrepResult: ...
```

- **返回值规范**：
  - `GlobResult`: `@dataclass`，字段 `error: str | None = None`, `matches: list[FileInfo] | None = None`。
  - `GrepResult`: `@dataclass`，字段 `error: str | None = None`, `matches: list[GrepMatch] | None = None`。
  - `FileInfo`: `TypedDict`，必须字段 `path: str`，可选 `is_dir`, `size`, `modified_at`。
  - `GrepMatch`: `TypedDict`，包含 `path: str`, `line: int` (1-indexed), `text: str`。

#### 3. 各 Backend 具体实现差异

- **`FilesystemBackend`**（本地文件系统）：
  - `grep()`：优先调用底层 `_ripgrep_search`（实际命令行为 `[rg, "--json", "-F"]`，可选追加 `--glob <include_glob>`，以 `--` 分隔后接 `pattern` 与目标路径，使用 `--json` 输出模式解析结构化结果），当宿主机未安装 ripgrep 或执行失败时，平滑降级至 Python 实现的 `_python_search`（结合 `wcmatch.glob` 与逐行子串匹配）。
  - `glob()`：调用标准库 `Path(search_path).rglob(pattern)`，并处理 `virtual_mode` 路径前缀映射。
- **`BaseSandbox`**（沙箱/容器后端基类，`DaytonaSandbox` 继承之）：
  - `grep()`：在容器内组装执行 Shell 命令 `grep -rHnFZ [--include=glob] -e pattern search_path 2>/dev/null || true`，解析 NUL (`\0`) 分隔符输出以避免文件名包含冒号时的歧义。
  - `glob()`：构造 Base64 编码的 Python 单行脚本 `_GLOB_COMMAND_TEMPLATE`（内部调用 `glob.glob(pattern, recursive=True)` 及 `os.stat` 获取元数据），通过 `self.execute()` 在容器进程中运行并解析 JSON 结果。
- **`CompositeBackend`**（多后端复合路由）：
  - 当 `path` 为 `None` 或未命中任何路由前缀时，**顺序**遍历 `default` 后端与所有挂载 `routes` 逐一检索并聚合结果（for 循环顺序执行，无并发）；
  - 自动通过 `_remap_grep_path` 和 `_remap_file_info_path` 补齐虚拟路由前缀（例如将 `/memories` 后端内返回的 `/notes.txt` 还原为 `/memories/notes.txt`）。

---

### 2.3 langAgent develop 基线中的实际能力与工程策略

在 `langAgent develop` 分支中，`glob` 与 `grep` 的具体装配与使用体现了以下关键工程设计：

1. **Long Task 沙箱工作区的主力检索能力**：
   - 在 `src/agent/long_task/factory.py` 中，`build_long_task_agent()` 通过 `create_deep_agent` 装配 `CompositeBackend`，其 `default` 后端为 `DaytonaSandbox`。
   - Agent 在分析用户工程、排查多文件 bug、寻找配置定义时，直接调用 `glob` 与 `grep` 工具，指令在 Daytona 云端沙箱容器内高速执行。
2. **虚拟存储后端的显式边界保护**：
   - 在 `CompositeBackend` 中挂载了非普通文件的专用虚拟路由：
     - `/shared/` 与 `/memories/`（挂载 `JavaUserGlobalMemoryBackend` / `JavaUserAgentMemoryBackend`）
     - `/workspace/project/conversation_history/` 与 `/conversation_history/`（挂载 `ConversationHistoryBackend`）
   - **拦截逻辑**：上述虚拟后端在源码中明确重写了 `glob()` 与 `grep()`，直接返回 `GlobResult(matches=[], error="glob not supported for long-term memory")` 及 `GrepResult(matches=[], error="grep not supported for conversation_history")`。
   - **工程意义**：防止 Agent 误将虚拟持久化存储当作常规工作区目录进行全局暴搜，强制引导 Agent 通过受控的记忆文件协议（如 `read_file("/shared/preferences.md")`）进行读写。
3. **中文 Prompt 提示与命令拦截约束**：
   - `src/agent/long_task/chinese_deep_agent.py` 在启动时调用 `apply_chinese_patches()`，将工具描述热替换为中文版 `FS_GLOB_DESC` 与 `FS_GREP_DESC`。
   - 并在沙箱命令执行工具描述 `FS_EXECUTE_DESC` 中明确加入系统级负向约束：
     > *“非常重要：你必须避免使用 find 和 grep 等搜索命令。而是使用 grep、glob 工具来搜索。你必须避免使用 cat、head、tail 等读取工具，使用 read_file 来读取文件。”*
   - 该设计避免了模型在 `execute` 中直接调用系统 `find` / `grep` 导致的不可控输出溢出和难以结构化解析的问题。

---

## 3. 证据清单

| 证据项 | 涉及组件 / 文件路径 | 对应行号 / 范围 | 关键事实 / 契约说明 |
|---|---|---|---|
| **EVD-F11-01** | `deepagents/middleware/filesystem.py` | L384-L405 | 定义 `GlobSchema`（`pattern`, `path`）与 `GrepSchema`（`pattern`, `path`, `glob`, `output_mode`）。 |
| **EVD-F11-02** | `deepagents/middleware/filesystem.py` | L1402-L1673 | `_create_glob_tool`（20s 超时、4 并发信号量控制）与 `_create_grep_tool`（字面量检索与多模式输出）具体实现。 |
| **EVD-F11-03** | `deepagents/middleware/filesystem.py` | L696-L704 | `TOOLS_EXCLUDED_FROM_EVICTION` 显式排除 `"glob"` 和 `"grep"`，避免搜索结果截断后被逐出为磁盘大文件。 |
| **EVD-F11-04** | `deepagents/backends/protocol.py` | L134-L165, L290-L326 | 定义 `FileInfo`、`GrepMatch`、`LsResult`（L290）、`GrepResult`（L303）、`GlobResult`（L316）标准数据结构。 |
| **EVD-F11-05** | `deepagents/backends/protocol.py` | L413-L541 | `BackendProtocol` 声明 `grep` / `agrep` 与 `glob` / `aglob` 抽象方法及签名。 |
| **EVD-F11-06** | `deepagents/backends/filesystem.py` | L570-L680, L883-L930 | `FilesystemBackend` 中 `_ripgrep_search`（调用 `rg -F`）、`_python_search` 回退与 `Path.rglob()` 实现。 |
| **EVD-F11-07** | `deepagents/backends/sandbox.py` | L46-L76, L485-L541, L937-L995 | `BaseSandbox` 使用 Base64 编码的 Python 脚本执行 `glob`，使用 `grep -rHnFZ` 执行 `grep`。 |
| **EVD-F11-08** | `deepagents/backends/composite.py` | L30-L112, L300-L464 | `CompositeBackend` 实现前缀匹配路由分发、`grep`（起于 L300）、`_remap_grep_path`（L30）与 `_remap_file_info_path`（L63）路径还原。 |
| **EVD-F11-09** | `src/agent/long_task/factory.py` | L533-L558 | Long Task Agent 构建时使用 `CompositeBackend` 组合 `DaytonaSandbox` 与虚拟记忆/历史路由。 |
| **EVD-F11-10** | `src/agent/long_task/memory_backend.py` | L231-L248 | `JavaMemoryBackend` 显式重写 `glob` / `grep` 返回 unsupported error 保护虚拟记忆。 |
| **EVD-F11-11** | `src/agent/long_task/conversation_history_backend.py` | L337-L360 | `ConversationHistoryBackend` 显式返回 unsupported error 拦截 glob / grep 遍历。 |
| **EVD-F11-12** | `src/agent/long_task/chinese_deep_agent.py` | L258-L275 | `apply_chinese_patches()` 注入中文工具描述 `FS_GLOB_DESC` 与 `FS_GREP_DESC`。 |
| **EVD-F11-13** | `src/agent/long_task/chinese_deep_agent_prompts.py` | L263-L285, L310 | 提示词中明确规范 glob/grep 工具用途，并在执行命令提示中禁止 Agent 直接运行 `find` / `grep`。 |
