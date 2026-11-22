# AI Task Partitions (AI_TASKS.md)

本文件定义 **NoPink** 的多智能体/模块化开发分区，避免跨边界冲突。

---

## Partition 1: Chrome Extension (`extension/`)
- **Owned Directory**: `extension/`
- **Contract**: 输出符合 `ARCHITECTURE.md` 第 4 节定义的 `nopink-db-v1` 格式 `.npdb` 文件。
- **Acceptance**:
  - 在 X 时间线头像旁稳定渲染采集按钮，点击不触发页面跳转。
  - 导出的 `.npdb` 文件中不包含任何明文推文、用户名或 Handle。

## Partition 2: Local AI Analyzer (`analyzer/`)
- **Owned Directory**: `analyzer/`
- **Contract**: 读取 `*.npdb` 文件，输出 `keywords.json`。
- **Acceptance**:
  - 能够合并多台电脑的 `.npdb` 并按 `tweetUrl` / 内容哈希去重。
  - 提示词明确剔除日常常见词、人称代词与泛用政治新闻词，仅保留高辨识度核心词。

## Partition 3: FeedSieve Exporter (`exporter/`)
- **Owned Directory**: `exporter/`
- **Contract**: 读取 `keywords.json`，输出 `feedsieve_muted_words.txt`、`feedsieve_keyword_pack.yaml`、`feedsieve_report.json`。
- **Acceptance**:
  - 支持按 `max-risk` 过滤误伤风险高的词条。
  - 导出的 `.txt` 为 UTF-8 LF 每行一词，可直接导入 FeedSieve 禁语管理。
