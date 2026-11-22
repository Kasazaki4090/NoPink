# Architecture Decision Records (DECISIONS.md)

本文档记录 **NoPink** 项目的关键架构与技术选型决策。

---

## Decision Index

| ID | Title | Status | Date |
| :--- | :--- | :--- | :--- |
| `DEC-001` | 每台电脑独立加密 `.npdb` 仓库用于 OneDrive 同步 | Accepted | 2026-11-22 |
| `DEC-002` | Chrome MV3 插件采用 Web Crypto + File System Access API | Accepted | 2026-11-22 |
| `DEC-003` | 本地 AI 采用双接口适配与两阶段 Map-Reduce 提纯 | Accepted | 2026-11-22 |
| `DEC-004` | FeedSieve 集成采用禁语 `.txt` 与 `keyword-pack` `.yaml` 双导出 | Accepted | 2026-11-22 |

---

## DEC-001: 每台电脑独立加密 `.npdb` 仓库用于 OneDrive 同步

### Context
用户需要在多台电脑上浏览 X 并收集样本，通过 OneDrive 同步汇总，但明确要求**不能以明文存储**，且需避免多机同时写入同一数据库文件导致 OneDrive 冲突。

### Alternatives Considered
1. **单文件 SQLite 放入 OneDrive**：多台电脑同时修改必然触发 OneDrive 文件锁与冲突副本（`-PC1`）；且 SQLite 默认明文存储，直接查看或被索引仍可见内容。
2. **明文 JSON 按机器分片**：解决冲突但违反“非明文”要求。
3. **按 `machineId` 分片的 AES-256-GCM + Gzip 加密信封 (`nopink-db-<machineId>.npdb`)**：每台电脑只覆盖写入自己的 `.npdb` 文件，内容经过 PBKDF2-SHA256 派生密钥加密与 Gzip 压缩。

### Decision
* **Chosen Architecture**: 方案 3 — `nopink-db-v1` 加密信封，按 `machineId` 分片存储。
* **Key Justification**: 零外部服务端依赖、浏览器与 Python 均可原生/标准库加解密、彻底杜绝 OneDrive 冲突与明文暴露。

### Consequences
* **Positive**: 跨端同步安全、无冲突、体积小。
* **Negative / Trade-offs**: 用户需在各台电脑使用同一加密口令（Passphrase）以便 `analyzer/` 统一解密。
* **Invariants**: `.npdb` 文件顶层不得包含任何采集到的用户名、Handle 或推文文本。

### Status
Accepted

---

## DEC-002: Chrome MV3 插件采用 Web Crypto + File System Access API

### Context
Chrome 扩展运行在沙箱中，无法直接读写任意磁盘路径，但需要方便用户将 `.npdb` 保存到 OneDrive 同步目录。

### Decision
* **Chosen Architecture**: 本地暂存使用 `chrome.storage.local`；加密导出优先使用弹窗中的 `showDirectoryPicker`（将目录句柄持久化至 IndexedDB，后续一键覆盖写入 OneDrive 目标目录），并提供 `chrome.downloads.download`（`NoPink/nopink-db-<machineId>.npdb`）作为降级方案。
* **Key Justification**: 无需安装本地 Native Messaging Host 即可实现真正的单文件覆盖同步到 OneDrive。

### Status
Accepted

---

## DEC-003: 本地 AI 采用双接口适配与两阶段 Map-Reduce 提纯

### Context
随着收集样本增多，单次上下文可能超出本地小模型（如 7B/14B）窗口限制，且单轮提取容易混入高频日常词汇（如“因为”、“所以”、“中国”、“美国”等泛用词）。

### Decision
* **Chosen Architecture**:
  1. 同时支持 Ollama 原生 `/api/chat` 与 OpenAI 兼容 `/v1/chat/completions`（覆盖 LM Studio / llama.cpp / vLLM）。
  2. 采用 **Stage 1 批次提取（Map） + Stage 2 汇总剔除常见词（Reduce）** 两阶段提示词管道，输出带 `false_positive_risk`（`low` / `medium` / `high`）的结构化 JSON。

### Status
Accepted

---

## DEC-004: FeedSieve 集成采用禁语 `.txt` 与 `keyword-pack` `.yaml` 双导出

### Context
FeedSieve（`amhdjglnonjaoenddnifpnljgmocfdph`）支持在扩展内直接管理 X 禁语（Muted Words），同时其开源仓库 `realchendahuang/feedsieve` 使用 `community/keyword-packs/*.yaml` 管理词库包。

### Decision
* **Chosen Architecture**: `exporter/` 同时生成逐行 `.txt`（供 FeedSieve 禁语管理直接导入/粘贴）和标准 `.yaml` 词库包，并允许按风险等级阈值过滤（默认仅导出 `low` 风险核心词，避免误伤正常推文）。

### Status
Accepted
