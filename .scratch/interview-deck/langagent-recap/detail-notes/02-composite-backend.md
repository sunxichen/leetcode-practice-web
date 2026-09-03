# 专题二：deepagents CompositeBackend 详解

---

## 1. 架构总览与核心价值

在构建基于大语言模型（LLM）的复杂代码与长任务智能体（如 Coding Agent、Long Task Agent）时，Agent 需要与异构的存储和执行介质进行交互：
1. **工作区源码与运行环境**：需要真实的 Linux 容器或宿主机文件系统，以支持执行构建、测试、编译以及 `ripgrep` 等高性能文件检索；
2. **跨会话长期记忆（Long-Term Memory）**：需要持久化在业务数据库或键值存储（如 LangGraph `BaseStore` 或企业级 Java 后端 REST API）中；
3. **会话级上下文与历史快照（Conversation History）**：需要对接到对象存储（OSS/S3）以实现大消息与上下文文件的异步分发；
4. **临时状态与中间变量**：需要保存在会话运行时的内存 State（Pregel Checkpoint Channel）中，会话结束即自动随生命周期销毁。

如果将上述异构系统的操作直接暴露为零散的自定义业务工具（例如同时暴露 `read_sandbox_file`、`get_user_memory`、`fetch_history_oss`），会导致模型工具空间爆炸、Prompt 冗余，并在推理时出现严重的工具调用混乱。

`deepagents 0.6.12` 提出了 **统一文件系统协议层与复合路由架构（Unified Virtual Filesystem & Composite Routing）**：通过抽象统一的 `BackendProtocol` 契约，并通过 `CompositeBackend` 按 **路径前缀（Path Prefix）** 将 Agent 的标准文件操作透明地分发到不同的底层后端；同时由上层 `FilesystemMiddleware` 向大模型暴露一致、极简的 POSIX 风格工具集（`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `execute`）。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                LLM Agent Tool Layer                                    │
│  ls() | read_file() | write_file() | edit_file() | glob() | grep() | execute()         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 调用 (ToolMessage 入参 & 权限校验)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               FilesystemMiddleware (deepagents/middleware/filesystem.py)               │
│  - 权限拦截 (_check_fs_permission) 与并发超时控制 (_glob_slots, GLOB_TIMEOUT=20s)       │
│  - 大结果截断与防逐出保护 (TOOLS_EXCLUDED_FROM_EVICTION)                                │
│  - 大工具输出文件系统转存 (_large_tool_results_prefix = "/large_tool_results")          │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 统一 BackendProtocol 接口调用
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 CompositeBackend (deepagents/backends/composite.py)                    │
│  - 路由规则树：sorted_routes 按路径前缀长度倒序匹配 (Longest Prefix Match)              │
│  - 路径标准化与前缀剥离：_route_for_path() (例如 /memories/a.md -> 剥离为 /a.md)         │
│  - 跨后端聚合与路径还原：ls("/") / glob() / grep() 聚合各后端并重映射虚拟路径前缀       │
│  - 执行命令直通默认沙箱：execute() 强制路由至 default 后端                              │
└───────┬───────────────────────────┬────────────────────────────┬───────────────────────┘
        │ 默认未匹配路径             │ 前缀匹配 /shared/, /memories/│ 前缀匹配 /conversation_history/
        ▼                           ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐     ┌───────────────────────────────┐
│ default:             │    │ JavaMemoryBackend    │     │ ConversationHistoryBackend    │
│ DaytonaSandbox       │    │ (长期记忆 REST API)  │     │ (会话上下文 OSS 存储)          │
│ (远程容器 Shell+文件)│    │ - 乐观锁版本校验     │     │ - 双阶段 HTTP/OSS 获取         │
│ - BaseSandbox 模板   │    │ - 显式拦截 glob/grep │     │ - 显式拦截 ls/glob/grep       │
└──────────────────────┘    └──────────────────────┘     └───────────────────────────────┘
```

---

## 2. Backend 抽象家族体系

在 `deepagents 0.6.12` 中，所有的后端均基于 `deepagents.backends.protocol.BackendProtocol` 接口构建。存储与执行能力被严密解耦，形成了清晰的继承与衍生家族。

### 2.1 核心协议契约与数据结构

#### 1. 标准化数据结构（`deepagents/backends/protocol.py`）

| 数据结构名 | 类型 / 定义 | 关键字段 | 语义契约 |
|---|---|---|---|
| `FileInfo` | `TypedDict`<br>(L134-L152) | `path: str`（必须）<br>`is_dir: bool`（可选）<br>`size: int`（可选）<br>`modified_at: str`（可选） | 描述文件/目录的元数据结构，`path` 保证为绝对路径或带前缀虚拟路径。 |
| `FileData` | `TypedDict`<br>(L167-L181) | `content: str`<br>`encoding: str` (`"utf-8"` \| `"base64"`)<br>`created_at: str`（可选）<br>`modified_at: str`（可选） | 后端存储与返回文件内容的核心载荷。文本存储为 UTF-8 字符串，二进制存储为 Base64 字符串。 |
| `GrepMatch` | `TypedDict`<br>(L154-L165) | `path: str`<br>`line: int` (1-indexed)<br>`text: str` | 单条内容匹配项，行号从 1 开始。 |
| `ReadResult` | `@dataclass`<br>(L183-L194) | `error: str \| None`<br>`file_data: FileData \| None` | 文件读取结果。成功时携带 `file_data`，失败时携带错误描述字符串。 |
| `WriteResult` | `@dataclass`<br>(L227-L254) | `error: str \| None`<br>`path: str \| None`<br>`files_update: dict \| None` (已废弃) | 创建新文件结果。目标文件已存在时报错。 |
| `EditResult` | `@dataclass`<br>(L256-L287) | `error: str \| None`<br>`path: str \| None`<br>`occurrences: int \| None` | 精确字符替换结果，记录成功替换的匹配次数。 |
| `LsResult` | `@dataclass`<br>(L289-L300) | `error: str \| None`<br>`entries: list[FileInfo] \| None` | 目录非递归浏览结果。 |
| `GlobResult` | `@dataclass`<br>(L315-L326) | `error: str \| None`<br>`matches: list[FileInfo] \| None` | 路径模式匹配结果列表。 |
| `GrepResult` | `@dataclass`<br>(L302-L313) | `error: str \| None`<br>`matches: list[GrepMatch] \| None` | 文本字面量检索结果列表。 |
| `ExecuteResponse`| `@dataclass`<br>(L783-L800) | `output: str`<br>`exit_code: int \| None`<br>`truncated: bool` | 命令行执行结果，合并 stdout 与 stderr，提供退出码及截断标识。 |
| `FileUploadResponse` / `FileDownloadResponse` | `@dataclass`<br>(L70-L132) | `path: str`<br>`content: bytes \| None`<br>`error: FileOperationError \| str \| None` | 批处理文件上传与下载的单项响应，支持部分成功语义。 |

#### 2. `BackendProtocol` 抽象基类（`deepagents/backends/protocol.py#L329-L781`）
定义了所有存储后端必须实现的统一同步/异步契约方法：
- `ls(path: str) -> LsResult` / `als(...)`
- `read(file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult` / `aread(...)`
- `write(file_path: str, content: str) -> WriteResult` / `awrite(...)`
- `edit(file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> EditResult` / `aedit(...)`
- `glob(pattern: str, path: str | None = None) -> GlobResult` / `aglob(...)`
- `grep(pattern: str, path: str | None = None, glob: str | None = None) -> GrepResult` / `agrep(...)`
- `upload_files(files: list[tuple[str, bytes]]) -> list[FileUploadResponse]` / `aupload_files(...)`
- `download_files(paths: list[str]) -> list[FileDownloadResponse]` / `adownload_files(...)`

#### 3. `SandboxBackendProtocol` 命令执行扩展（`deepagents/backends/protocol.py#L803-L860`）
继承自 `BackendProtocol`，为支持命令执行的隔离环境（容器/虚拟机）增加契约：
- `@property id -> str`：返回沙箱实例全局唯一标识符；
- `execute(command: str, *, timeout: int | None = None) -> ExecuteResponse` / `aexecute(...)`：在沙箱内同步/异步执行 Shell 命令。

---

### 2.2 具体 Backend 实现族谱

```
                      ┌───────────────────┐
                      │  BackendProtocol  │
                      └─────────┬─────────┘
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
        ▼                       ▼                        ▼
┌──────────────┐        ┌──────────────┐        ┌──────────────────┐
│ StateBackend │        │ StoreBackend │        │ FilesystemBackend│
└──────────────┘        └──────────────┘        └────────┬─────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │LocalShellBackend │ (同时实现 Sandbox)
                                                └──────────────────┘
                      ┌────────────────────────┐
                      │ SandboxBackendProtocol │
                      └──────────┬─────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │   BaseSandbox    │
                        └────────┬─────────┘
           ┌─────────────────────┴─────────────────────┐
           │                                           │
           ▼                                           ▼
┌──────────────────┐                       ┌───────────────────────┐
│ LangSmithSandbox │                       │    DaytonaSandbox     │
│ (LangSmith SDK)  │                       │  (langchain_daytona)  │
└──────────────────┘                       └───────────────────────┘
```

#### 1. `StateBackend`（会话内临时状态后端）
- **源码位置**：`deepagents/backends/state.py#L38-L384`
- **构造签名**：`StateBackend(runtime: object = None, *, file_format: FileFormat = "v2")`
- **实现原理**：
  - 文件并不真正写入磁盘，而是存放在 LangGraph State 的 `files: dict[str, FileData]` Channel 中；
  - 内部通过 `langgraph.config.get_config()` 获取当前上下文，使用 `CONFIG_KEY_READ`（L122）读取状态，使用 `CONFIG_KEY_SEND`（L145）向 Pregel 运行时派发 `[("files", update)]` 增量变更，由 `DeltaChannel` 的 `_file_data_delta_reducer` 合并；
  - 设置 `fresh=True`（L123），支持单个 Superstep 内的 Read-Your-Writes（即写即读）语义。
- **持久化边界**：**仅限于单个 Conversation Thread 生命周期内**。随 LangGraph Checkpoint 保存，不跨 Thread 共享。

#### 2. `StoreBackend`（跨会话持久化键值后端）
- **源码位置**：`deepagents/backends/store.py#L172-L812`
- **构造签名**：`StoreBackend(runtime: object = None, *, store: BaseStore | None = None, namespace: NamespaceFactory | None = None, file_format: FileFormat = "v2")`
- **实现原理**：
  - 适配 LangGraph 原生 `BaseStore`（如 PostgresStore / InMemoryStore）；
  - 通过 `NamespaceFactory`（L124）动态解析命名空间（例如 `lambda rt: (rt.server_info.user.identity, "filesystem")`），在 store 中以 `(namespace, file_path)` 形式存储 `FileData`；
  - 目录列举与全文检索通过 `_search_store_paginated()`（L378-L424）自动分页扫描并本地过滤。
- **持久化边界**：**跨会话、跨 Thread 永久持久化**。所有共享同一命名空间的 Agent 或 Run 均可读写。

#### 3. `FilesystemBackend`（宿主机本地文件系统后端）
- **源码位置**：`deepagents/backends/filesystem.py#L67-L1108`
- **构造签名**：`FilesystemBackend(root_dir: str | Path | None = None, virtual_mode: bool | None = None, max_file_size_mb: int = 10)`
- **实现原理**：
  - 基于 Python 标准库 `Path` 与 `os.open(..., O_NOFOLLOW)` 防止符号链接劫持；
  - `virtual_mode=True`（L197-L209）：强制以 `root_dir` 为虚拟根目录，严禁 `..` 路径穿越与绝对路径逃逸，适配 `CompositeBackend` 的前缀剥离机制；
  - `grep()` 实现（L570-L616）：优先通过 `_ripgrep_search` 调用系统 `rg --json -F`（字面量检索），若系统无 `rg` 则平滑回退到 Python 逐行扫描 `_python_search`（L743-L881）。
- **持久化边界**：**宿主机磁盘持久化**。受操作系统文件权限与进程生命周期管理约束。

#### 4. `BaseSandbox`（命令驱动型沙箱抽象基类）
- **源码位置**：`deepagents/backends/sandbox.py#L586-L1019`
- **核心定位**：所有云端/容器沙箱（如 `DaytonaSandbox`, `LangSmithSandbox`）的通用基类，继承自 `SandboxBackendProtocol`。
- **派生设计**：子类只需实现核心方法 `execute()`、`upload_files()`、`download_files()` 与 `id` 属性；所有文件操作方法（`ls`, `read`, `write`, `edit`, `glob`, `grep`）均在 `BaseSandbox` 中通过在沙箱内组装执行 Python 脚本或 Linux 原生命令实现：
  - **`ls`**（L627-L636）：在沙箱中执行 `os.scandir(path)` Python 脚本，以 JSON Lines 格式流式输出条目；
  - **`read`**（L637-L680）：在沙箱中执行带服务端分页的 Python 脚本，原生支持 `offset`/`limit` 切片，大文本输出截断至 `MAX_OUTPUT_BYTES = 500KB`（L108），二进制文件限制 `MAX_BINARY_BYTES = 500KB`（L98）；
  - **`write`**（L706-L748）：先执行 `_write_preflight` 校验目标文件不存在并 `mkdir -p` 创建父目录，再调用 `upload_files` 上传二进制/文本内容；
  - **`edit`**（L749-L936）：双模执行引擎——当 `old_string + new_string <= 50KB`（`_EDIT_INLINE_MAX_BYTES`）时，通过 Base64 编码的 Heredoc 脚本单次 RPC 执行原地替换；当超过 50KB 时，通过 `upload_files` 将新旧字符串上传为 `/tmp/.deepagents_edit_*` 临时文件后在服务端替换并清理；
  - **`grep`**（L937-L983）：组装执行 `grep -rHnFZ [--include=glob] -e pattern search_path 2>/dev/null || true`，以 `\0`（NUL）分隔文件名与行数据，消除路径含冒号时的解析歧义；
  - **`glob`**（L984-L995）：注入 Base64 编码的 `_GLOB_COMMAND_TEMPLATE` 脚本，在沙箱进程内运行 `glob.glob(pattern, recursive=True)` 并读取 `stat` 元数据返回。

#### 5. 其他框架内置后端
- **`LocalShellBackend`**（`deepagents/backends/local_shell.py#L27-L388`）：继承 `FilesystemBackend` 并实现 `SandboxBackendProtocol`，通过 `subprocess.run(shell=True)` 直接在宿主机上执行无沙箱保护的命令。
- **`LangSmithSandbox`**（`deepagents/backends/langsmith.py#L48-L276`）：包装 LangSmith 原生 `Sandbox` 客户端，重写了 `write()` 和 `read()` 直接走 HTTP Body 传输以突破命令参数长度上限（`ARG_MAX`）。
- **`ContextHubBackend`**（`deepagents/backends/context_hub.py#L46-L338`）：将文件版本化提交并持久化到 LangSmith Hub Repo。

---

## 3. CompositeBackend 路由机制与源码执行链

`CompositeBackend`（`deepagents/backends/composite.py#L107-L741`）是多后端存储系统的核心路由器。其设计的精髓在于：**将虚拟的 URL 式路径前缀作为命名空间，下层后端对真实前缀完全无感知（保持内部根目录 `/` 的纯粹性），由路由器完成透明的路径剥离与结果重映射。**

### 3.1 构造与路由排序规则

```python
# deepagents/backends/composite.py L130-L159
class CompositeBackend(BackendProtocol):
    def __init__(
        self,
        default: BackendProtocol | StateBackend,
        routes: dict[str, BackendProtocol],
        *,
        artifacts_root: str = "/",
    ) -> None:
        self.default = default
        self.routes = routes
        # 关键机制：按前缀长度严格降序排序，确保最长前缀优先匹配 (Longest Prefix Match)
        self.sorted_routes = sorted(routes.items(), key=lambda x: len(x[0]), reverse=True)
        self.artifacts_root = artifacts_root
```

- **路由匹配优先级**：必须按字符串长度倒序排列。
  *例如*：若同时注册了 `/workspace/project/conversation_history/`（长度 43）与 `/conversation_history/`（长度 22），较长的前缀排在首位，避免短前缀意外截断更特化的深层路径。

### 3.2 路径匹配与标准化算法（`_route_for_path`）

```
                     ┌────────────────────────────────────┐
                     │           输入路径 path             │
                     └─────────────────┬──────────────────┘
                                       │
                                       ▼
                   ┌────────────────────────────────────────┐
                   │  遍历 sorted_routes (最长前缀优先)       │
                   └───────────────────┬────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │ 匹配条件 1:                                  │ 匹配条件 2:
                │ path == prefix_no_slash                     │ path.startswith(normalized_prefix)
                ▼                                             ▼
       ┌────────────────────────┐                   ┌────────────────────────┐
       │ 访问虚拟路由根目录      │                   │ 访问虚拟路由子路径     │
       │ 例: "/memories"        │                   │ 例: "/memories/k.md"   │
       │ 返回:                  │                   │ 返回:                  │
       │ backend, "/", prefix   │                   │ backend, "/k.md", prefix
       └────────────────────────┘                   └────────────────────────┘
                                       │
                                       │ 未命中任何路由规则
                                       ▼
                               ┌────────────────────────────────┐
                               │ 兜底回退至默认后端              │
                               │ 返回:                          │
                               │ default, path, None            │
                               └────────────────────────────────┘
```

源码实现（`deepagents/backends/composite.py#L74-L104`）：
1. **完全匹配路由根（无末尾斜杠）**：若 `path == "/memories"`，将其映射到对应后端，子路径归一化为 `"/"`；
2. **前缀匹配子路径**：若 `path == "/memories/notes.txt"`，剥离前缀 `"/memories/"`，确保传给子后端的 `backend_path` 为 `"/notes.txt"`；
3. **未命中任何前缀**：回退至 `default` 后端，路径保持原样。

---

### 3.3 各操作调用链与路径重映射全景

| 操作分类 | 路由模式 | 核心源码位置 | 行为说明与路径重映射机制 |
|---|---|---|---|
| **单点读取 (`read` / `aread`)** | 点对点分发 | L262-L289 | 1. `_route_for_path` 解析目标 backend 与剥离后的 `stripped_key`；<br>2. 调用 `backend.read(stripped_key, offset, limit)`。 |
| **单点写入 (`write` / `awrite`)** | 点对点分发 + 路径还原 | L465-L495 | 1. 路由至对应 backend 写入 `stripped_key`；<br>2. 若返回 `WriteResult.path` 非空，**将其还原覆盖为调用方传入的全局完整路径 `file_path`**。 |
| **精确编辑 (`edit` / `aedit`)** | 点对点分发 + 路径还原 | L497-L533 | 1. 路由至对应 backend 编辑 `stripped_key`；<br>2. 若返回 `EditResult.path` 非空，还原覆盖为 `file_path`。 |
| **目录列表 (`ls` / `als`)** | 条件单点 / 全局聚合 | L175-L260 | - **命中特定路由**：查询该 backend 后，通过 `_remap_file_info_path` 补齐虚拟前缀；<br>- **根目录 `path == "/"`**：先查询 `default.ls("/")`，随后遍历 `self.sorted_routes`，**将每个挂载的前缀作为虚拟目录项注入**（`FileInfo(path="/memories/", is_dir=True, size=0, ...)`）；<br>- **普通非根路径**：仅查询 `default` 后端。 |
| **文件检索 (`glob` / `aglob`)** | 前缀单点 / 全局多路扇出 | L401-L464 | - **指定 path 且命中路由**：仅检索该后端；<br>- **path 为空或根**：**顺序逐路扇出**，依次检索 default 后端以及所有 routes 后端（顺序 `for` 循环，无并发原语；唯一的并发控制 `_glob_slots = BoundedSemaphore(4)` 在 middleware 层，限制的是多次 glob 工具调用之间的并发度）。对 routes 后端自动通过 `_strip_route_from_pattern` 消除 Pattern 中的多余前缀，再用 `_remap_file_info_path` 补齐前缀后合并排序。 |
| **文本搜索 (`grep` / `agrep`)** | 前缀单点 / 全局多路扇出 | L300-L399 | - **指定 path 且命中路由**：仅搜索该后端；<br>- **path 为 None 或 `"/"`**：同时搜索 `default` 与所有 `routes`，通过 `_remap_grep_path` 为所有匹配的 `GrepMatch.path` 补齐虚拟前缀后聚合返回。 |
| **命令执行 (`execute` / `aexecute`)** | **非路由直通** | L535-L596 | **命令执行不参与路径路由**。强制直通 `self.default`。若 `default` 未实现 `SandboxBackendProtocol`，抛出 `NotImplementedError`。 |
| **批量上传/下载 (`upload_files` / `download_files`)** | 批次聚合分发 | L598-L741 | 1. 按目标 backend 分组批次（`defaultdict(list)`），记录原始数组下标；<br>2. 每个后端仅调用一次 `upload_files`/`download_files` 批量接口；<br>3. 汇总各后端响应，按原始索引组装并还原全局路径返回。 |

---

## 4. 提供给 Agent 的全量 Tools 规范

在 `deepagents 0.6.12` 中，`FilesystemMiddleware`（`deepagents/middleware/filesystem.py#L765` 起，类本体延续至文件尾约 L2411）负责向 Agent 暴露标准工具集。每个工具对应一个 Pydantic Schema，并严密封装了底层 Backend 的调用。

### 4.1 7 大工具签名与语义详解

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FilesystemMiddleware Tool Layer                                       │
├─────────────┬───────────────────────────┬──────────────────────────────────────────┬──────────────────┤
│ 工具名       │ Pydantic Schema           │ 核心参数与默认值                         │ 支撑 Backend 接口 │
├─────────────┼───────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ ls          │ LsSchema                  │ path: str                                │ backend.ls()     │
│             │ (L339-L343)               │                                          │ backend.als()    │
├─────────────┼───────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ read_file   │ ReadFileSchema            │ file_path: str                           │ backend.read()   │
│             │ (L345-L359)               │ offset: int = 0                          │ backend.aread()  │
│             │                           │ limit: int = 100                         │                  │
├─────────────┼───────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ write_file  │ WriteFileSchema           │ file_path: str                           │ backend.write()  │
│             │ (L361-L367)               │ content: str                             │ backend.awrite() │
├─────────────┼───────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ edit_file   │ EditFileSchema            │ file_path: str                           │ backend.edit()   │
│             │ (L369-L382)               │ old_string: str                          │ backend.aedit()  │
│             │                           │ new_string: str                          │                  │
│             │                           │ replace_all: bool = False                │                  │
├─────────────┼───────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ glob        │ GlobSchema                │ pattern: str                             │ backend.glob()   │
│             │ (L384-L390)               │ path: str | None = None                  │ backend.aglob()  │
├─────────────┼───────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ grep        │ GrepSchema                │ pattern: str                             │ backend.grep()   │
│             │ (L392-L405)               │ path: str | None = None                  │ backend.agrep()  │
│             │                           │ glob: str | None = None                  │                  │
│             │                           │ output_mode: Literal[...] = "files_..."  │                  │
├─────────────┼───────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ execute     │ ExecuteSchema             │ command: str                             │ backend.execute()│
│             │ (L407-L416)               │ timeout: int | None = None               │ backend.aexecute()│
└─────────────┴───────────────────────────┴──────────────────────────────────────────┴──────────────────┘
```

#### 1. `ls`（列出目录条目）
- **入参**：`path: str`（必须以 `/` 开头的绝对路径）。
- **语义与防护**：非递归浏览指定目录下的直接文件与子目录。受 `_check_fs_permission(..., "read", ...)` 拦截；若条目过多，自动通过 `truncate_if_too_long` 截断。
- **底层支撑**：调用 `backend.ls(validated_path)`。

#### 2. `read_file`（读取文件内容与多模态感知）
- **入参**：`file_path: str`, `offset: int = 0`, `limit: int = 100`。
- **语义与格式化**：
  - 文本文件：以 `cat -n` 格式返回（行号从 1 开始）；行长超 5000 字符时自动折行标记（如 `5.1`, `5.2`）；支持基于 `offset`/`limit` 的服务端与客户端双重切片；
  - 空文件：统一返回系统提醒字符串 `System reminder: File exists but has empty contents`（L237）；
  - 二进制与多模态文件（`.png`, `.jpg`, `.pdf`, `.mp3` 等）：自动通过 Base64 包装为 LangChain 标准多模态 `ContentBlock`（L1124-L1138），并注入 `read_file_media_type` 供 UI/模型识别。
- **底层支撑**：调用 `backend.read(validated_path, offset, limit)`。

#### 3. `write_file`（创建并写入新文件）
- **入参**：`file_path: str`, `content: str`。
- **语义与安全**：若目标文件已存在，直接返回失败错误信息（防止 Agent 意外覆盖未读文件，强制 Agent 改用 `edit_file` 或明确删除）。受写权限规则拦截。
- **底层支撑**：调用 `backend.write(validated_path, content)`。

#### 4. `edit_file`（精确字符串替换）
- **入参**：`file_path: str`, `old_string: str`, `new_string: str`, `replace_all: bool = False`。
- **语义与幂等**：
  - 必须先读后改：强制匹配原文件中的确切缩进与换行风格（CRLF/LF 智能适应）；
  - 默认安全检查：`replace_all=False` 时，若 `old_string` 在文件中出现 0 次或超过 1 次，编辑均拒绝执行并报错。
- **底层支撑**：调用 `backend.edit(validated_path, old_string, new_string, replace_all)`。

#### 5. `glob`（按模式检索文件路径）
- **入参**：`pattern: str`（如 `**/*.py`），`path: str | None = None`。
- **并发与超时保护**（L1435-L1474）：使用 `_glob_slots = threading.BoundedSemaphore(4)` 控制最大 4 个并发，施加 `GLOB_TIMEOUT = 20.0s` 强超时，超时后优雅剥离并提示模型缩窄检索范围。
- **底层支撑**：调用 `backend.glob(pattern, path=backend_path)`。

#### 6. `grep`（文件内容字面量全文检索）
- **入参**：`pattern: str`（字面量，非正则），`path: str | None = None`，`glob: str | None = None`，`output_mode: Literal["files_with_matches", "content", "count"] = "files_with_matches"`。
- **输出格式**：
  - `files_with_matches`：仅列出命中文件路径；
  - `content`：输出 `路径:行号: 行文本`；
  - `count`：统计各文件命中次数。
- **底层支撑**：调用 `backend.grep(pattern, path, glob)`。

> 💡 **与 Fragment #11 的呼应**：关于 `glob` 与 `grep` 的通用语义差异、底层命令（`Path.rglob` vs `rg -F` vs 沙箱 Python 脚本）及逐行匹配深度，请参见专题报告 [Follow-up #11: glob 与 grep 的区别](../../fragments/f11-glob-vs-grep.md)，此处不再赘述。

#### 7. `execute`（沙箱隔离命令执行）
- **入参**：`command: str`, `timeout: int | None = None`。
- **运行时动态挂载与校验**（L1706-L1748）：
  - 仅当底层后端满足 `supports_execution(backend)`（即为 `SandboxBackendProtocol` 或以其为 `default` 的 `CompositeBackend`）时可用；否则向模型返回不支持执行的结构化错误；
  - 超时约束：`timeout` 不能超过 `max_execute_timeout`（默认 3600s）。
- **底层支撑**：调用 `backend.execute(command, timeout=timeout)`。

---

### 4.2 大结果逐出与防死循环保护（`TOOLS_EXCLUDED_FROM_EVICTION`）

`FilesystemMiddleware` 内置了消息与工具输出的大结果逐出机制（Message Eviction），但在 `deepagents/middleware/filesystem.py#L696-L704` 中显式定义了：

```python
TOOLS_EXCLUDED_FROM_EVICTION = (
    "ls",
    "glob",
    "grep",
    "read_file",
    "edit_file",
    "write_file",
)
```

**设计动机与工程防线**：
1. **防止文件重读死循环**：若 `read_file` 的大输出被转存为 `/large_tool_results/call_xxx.txt`，Agent 再次读取同一/同类文件可能无效或陷入递归（源码注释语义：截断后的单行超长文件重读同一文件无效——见 filesystem.py L688-L695；`read_file` 因此被排除在驱逐转存之外）；
2. **引导模型缩小范围而非保存噪声**：`ls`、`glob`、`grep` 内部均自带字符/条目截断。当匹配结果过多时，代表 Agent 的查询词过于宽泛（噪声），应当引导 Agent 缩窄搜索路径，而不是自动把几万条搜索噪声落盘保存；
3. **写操作天然紧凑**：`write_file` 和 `edit_file` 仅返回简短确认消息，永远不会触碰 Token 阈值。

---

## 5. 持久化与存储边界划分

在混合 Agent 架构中，理解数据落在哪个生命周期层级至关重要：

| 存储层级 | 支撑组件 | 数据存储形式 | 生命周期与隔离域 | 典型存放内容 |
|---|---|---|---|---|
| **会话状态暂存<br>(In-Session State)** | `StateBackend`<br>LangGraph `files` Channel | 内存字典 `FileData`<br>（序列化于 Checkpointer） | 仅限当前 Conversation Thread；不同 Thread 强隔离；会话重置即失效。 | 会话内部生成的临时草稿、中间分析数据、未持久化的上下文。 |
| **跨会话持久化<br>(Cross-Session Store)** | `StoreBackend`<br>LangGraph `BaseStore` | KV / 关系型数据库条目 | 跨 Thread 永久持久化；通过 `(namespace, key)` 按用户/Agent 隔离。 | 跨会话 Agent 技能索引、长期沉淀的配置项与知识。 |
| **沙箱工作区磁盘<br>(Sandbox Disk)** | `DaytonaSandbox` / `FilesystemBackend` | Linux 容器真实文件系统<br>(Ext4 / OverlayFS) | 绑定沙箱实例生命周期；跨步骤实时落盘；支持 Shell 进程直接读写。 | 依赖包、代码库仓库、构建产物、导出的最终报告。 |
| **外部业务微服务<br>(External Business API)** | `JavaMemoryBackend`<br>`ConversationHistoryBackend` | 业务 MySQL 数据库 / 阿里云 OSS 对象存储 | 永久持久化；由企业级后端托管并实施权限与版本控制。 | 用户全局偏好（`/shared/preferences.md`）、会话上下文文件。 |
| **中间件输出转存<br>(Offloading Cache)** | `FilesystemMiddleware`<br>`_large_tool_results_prefix` | 后端虚拟路径文件<br>`/large_tool_results/<call_id>` | 随底层 Backend 生命周期流转（默认存入沙箱或 State）。 | 超大 ToolResult、超长 HumanMessage 自动截断后的完整载荷。 |

---

## 6. langAgent 中的实际组装与工程落地

在 `langAgent develop` 基线（`.scratch/langagent-develop-reference`）中，Long Task Agent 的存储与沙箱组装集中在 `src/agent/long_task/factory.py` 的 `build_long_task_agent()` 函数中。

### 6.1 CompositeBackend 组装实况

```python
# src/agent/long_task/factory.py L533-L544
# 4a. 构建 CompositeBackend：默认走 DaytonaSandbox，专用虚拟文件走专用后端
# 多路由覆盖：模型可能吐出 /workspace/project/conversation_history/ 或 /conversation_history/
routes = {
    "/workspace/project/conversation_history/": ConversationHistoryBackend(thread_id=_thread_id),
    "/conversation_history/": ConversationHistoryBackend(thread_id=_thread_id),
    **memory_routes,
}
composite_backend = CompositeBackend(
    default=backend,  # DaytonaSandbox 实例（编者注，非源码注释；实际传入的是其子类 EnvAwareDaytonaSandbox，见 sandbox_env.py）
    routes=routes,
)
```

#### 1. 默认后端（`default`）：`DaytonaSandbox`
- 承载整个 Long Task 的执行工作区（默认工作目录 `/workspace/project`）；
- 容器镜像预装了 Python 3.12、Node.js 24、Maven 3.8.8 + JDK 8、`ripgrep` 及中文字体；
- Agent 的所有命令执行（`execute`）以及未命中虚拟前缀的工程代码读写均在 Daytona 沙箱中完成。

#### 2. 虚拟记忆路由（`/shared/` 与 `/memories/`）
- 在 `factory.py#L491-L509` 中根据 `MemoryContext` 动态挂载：
  - `/shared/` 挂载 `JavaUserGlobalMemoryBackend(user_id=...)`，对应跨 Agent 通用画像文件 `/shared/preferences.md`；
  - `/memories/` 挂载 `JavaUserAgentMemoryBackend(user_id=..., app_id=...)`，对应当前 Agent 独享画像 `/memories/preferences.md`。
- **乐观锁与版本冲突防护**（`memory_backend.py#L123-L150`）：
  - 写入与替换时携带 `expected_version`；
  - 遇到 HTTP 409 冲突时自动执行 `_MAX_EDIT_RETRIES = 1` 次拉取重试；
  - 显式重写 `glob` 与 `grep`（L231-L248），分别返回 `"glob not supported for long-term memory"` 与 `"grep not supported for long-term memory"` 错误，阻断 Agent 全局暴搜，引导精确读取。

#### 3. 历史与上下文路由（`/conversation_history/`）
- 针对模型在长路径与短路径间漂移的容错设计，同时挂载 `/workspace/project/conversation_history/` 与 `/conversation_history/`；
- 挂载 `ConversationHistoryBackend(thread_id=_thread_id)`（`conversation_history_backend.py#L67-L360`）；
- **双阶段拉取机制**：先调用 Java 后端接口获取 `oss_path`，再通过公网 URL 或 `getFileUrl` 换取 OSS 文件流；
- 写入通过统一 PUT 接口提交后端；显式拦截 `ls`、`glob`、`grep`。

---

### 6.2 框架提供但项目未启用的能力清单

为了保持技术方案的严谨性，经核对框架源码与项目实现，以下为 **deepagents 0.6.12 框架原生提供、但 langAgent 生产基线未启用/替换** 的特性：

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                           框架能力 vs 项目落地 对照清单                                    │
├───────────────────────────────┬───────────────────────────────┬───────────────────────────┤
│ 框架原生提供能力              │ langAgent 生产选型 / 状态     │ 架构决策原因              │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────┤
│ StoreBackend                  │ 框架提供，项目未启用          │ 记忆由企业级 Java 后端 REST │
│ (BaseStore 持久化)            │                               │ API 统一管控，不直连 Store │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────┤
│ LocalShellBackend             │ 框架提供，项目未启用          │ 生产环境必须保证强隔离，     │
│ (宿主机非沙箱执行)             │                               │ 统一接入 Daytona 云端容器 │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────┤
│ LangSmithSandbox              │ 框架提供，项目未启用          │ 沙箱基础设施采用自建        │
│                               │                               │ Daytona 集群而非 LangSmith │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────┤
│ ContextHubBackend             │ 框架提供，项目未启用          │ 无 Hub Repo 协作诉求      │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────┤
│ FilesystemPermission          │ 框架提供，项目未启用          │ 框架限制：执行类沙箱后端暂  │
│ (allow/deny/interrupt)        │                               │ 不支持工具级细粒度权限校验│
├───────────────────────────────┼───────────────────────────────┼───────────────────────────┤
│ AsyncSubAgentMiddleware       │ 框架提供，项目未启用          │ Long Task 采用同步声明式   │
│ (远程后台子 Agent)            │                               │ SubAgent + SubgraphTool   │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────┘
```

---

## 7. 权威证据清单与源码索引

| 证据项编号 | 涉及组件 / 文件路径 | 对应行号范围 | 关键事实与契约说明 |
|---|---|---|---|
| **EVD-CB-01** | `deepagents/backends/protocol.py` | L134-L181 | 定义 `FileInfo`、`GrepMatch`、`FileData` 基础元数据与内容结构体。 |
| **EVD-CB-02** | `deepagents/backends/protocol.py` | L183-L326 | 定义 `ReadResult`、`WriteResult`、`EditResult`、`LsResult`、`GrepResult`、`GlobResult` 返回类型。 |
| **EVD-CB-03** | `deepagents/backends/protocol.py` | L329-L781 | `BackendProtocol` 抽象基类声明及同步/异步方法规范（含 L659 起的 deprecated 方法）。 |
| **EVD-CB-04** | `deepagents/backends/protocol.py` | L803-L860 | `SandboxBackendProtocol` 扩展 `execute`/`aexecute` 及 `id` 属性。 |
| **EVD-CB-05** | `deepagents/backends/composite.py` | L74-L104 | `_route_for_path` 路径前缀匹配、前缀剥离与默认回退算法。 |
| **EVD-CB-06** | `deepagents/backends/composite.py` | L130-L159 | `CompositeBackend` 初始化，`sorted_routes` 按最长前缀倒序排列。 |
| **EVD-CB-07** | `deepagents/backends/composite.py` | L175-L260 | `ls` 方法在根路径 `/` 下自动注入所有挂载前缀为虚拟目录条目。 |
| **EVD-CB-08** | `deepagents/backends/composite.py` | L300-L464 | `grep` 与 `glob` 在根路径下顺序逐路扇出检索所有后端并通过 `_remap_*` 还原前缀。 |
| **EVD-CB-09** | `deepagents/backends/composite.py` | L535-L573 | `execute` 强制直通 `default` 后端，拒绝路径路由。 |
| **EVD-CB-10** | `deepagents/backends/state.py` | L84-L147 | `StateBackend` 基于 `CONFIG_KEY_READ` 与 `CONFIG_KEY_SEND` 读写 Pregel State Channel。 |
| **EVD-CB-11** | `deepagents/backends/store.py` | L232-L267 | `StoreBackend` 基于 `get_store()` 与 `NamespaceFactory` 实现跨会话持久化。 |
| **EVD-CB-12** | `deepagents/backends/filesystem.py` | L176-L218 | `FilesystemBackend._resolve_path` 实现 `virtual_mode` 路径防逃逸保护。 |
| **EVD-CB-13** | `deepagents/backends/filesystem.py` | L617-L742 | `FilesystemBackend` 优先调用 `rg -F`，平滑回退至 Python 搜索。 |
| **EVD-CB-14** | `deepagents/backends/sandbox.py` | L586-L1019 | `BaseSandbox` 基于命令注入模板派生实现 `ls/read/write/edit/glob/grep`。 |
| **EVD-CB-15** | `deepagents/middleware/filesystem.py` | L339-L416 | 定义 `LsSchema`, `ReadFileSchema`, `WriteFileSchema`, `EditFileSchema`, `GlobSchema`, `GrepSchema`, `ExecuteSchema`。 |
| **EVD-CB-16** | `deepagents/middleware/filesystem.py` | L696-L704 | `TOOLS_EXCLUDED_FROM_EVICTION` 显式排除文件与检索工具，防止递归重读。 |
| **EVD-CB-17** | `deepagents/middleware/filesystem.py` | L957-L1830 | `FilesystemMiddleware` 构建并暴露 7 大工具的具体实现（类本体延续至约 L2411）。 |
| **EVD-CB-18** | `src/agent/long_task/factory.py` | L533-L558 | Long Task Agent 构建时使用 `CompositeBackend` 组合 `DaytonaSandbox`、长期记忆与历史路由。 |
| **EVD-CB-19** | `src/agent/long_task/memory_backend.py` | L52-L248 | `JavaMemoryBackend` 乐观锁更新、重试与主动拦截 glob/grep。 |
| **EVD-CB-20** | `src/agent/long_task/conversation_history_backend.py` | L67-L360 | `ConversationHistoryBackend` 经 OSS 双阶段获取内容与拦截全局遍历。 |
| **EVD-CB-21** | `src/agent/long_task/chinese_deep_agent.py` | L215-L289 | 运行时 Monkey Patch 替换工具中文描述与执行指令约束。 |
