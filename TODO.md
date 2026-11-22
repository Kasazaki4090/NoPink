# TODO (NoPink)

跟踪 **NoPink** 的研发任务与优先级。

---

## Current TODO

### 1. Step 1 — Chrome 采集扩展 (`extension/`)
- [x] P0 搭建 Manifest V3 扩展基础结构与权限配置
- [x] P0 实现推文头像旁 `NP` 采集按钮注入（适配 X 虚拟滚动与动态加载）
- [x] P0 提取 `displayName`、`handle`、`tweetText`、`tweetUrl` 并本地去重存储
- [x] P0 实现 `crypto.js`（PBKDF2 + AES-256-GCM + Gzip `.npdb` 打包）
- [x] P1 实现 `popup` 界面：支持 `machineId` 管理、OneDrive 目录授权与一键加密导出
- [ ] P2 支持可选的“定时/每满 N 条自动提示导出”提醒徽标

### 2. Step 2 — 本地 AI 关键词筛选 (`analyzer/`)
- [x] P0 实现 `.npdb` 跨电脑解密、合并与去重加载器 (`vault.py`)
- [x] P0 实现 Ollama 与 OpenAI 兼容本地 AI 客户端 (`llm_client.py`)
- [x] P0 编写两阶段提示词 (`keyword_extract.md`, `keyword_consolidate.md`)
- [x] P0 实现两阶段 Map-Reduce 关键词提纯与 CLI (`extractor.py`, `cli.py`)
- [ ] P2 增加本地自定义停用词表 (`stopwords.txt`) 二次硬过滤支持

### 3. Step 3 — FeedSieve 黑名单词库生成 (`exporter/`)
- [x] P0 实现 FeedSieve 禁语 `.txt` 与 `keyword-pack` `.yaml` 生成器
- [x] P0 支持按误伤风险等级 (`low` / `medium`) 过滤导出
- [x] P1 生成统计报告 `feedsieve_report.json`

### 4. 测试与工程化 (`tests/`)
- [x] P0 `.npdb` 加密格式与零明文单元测试
- [x] P0 多机 `.npdb` 合并去重与导出单元测试
- [x] P1 端到端 Mock LLM 提纯到 FeedSieve 导出集成测试
