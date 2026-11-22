# NoPink

> **X (Twitter) 粉红言论采集、本地 AI 核心词提纯与 FeedSieve 黑名单词库生成工具链**

NoPink 是一套三段式、隐私优先、支持多机独立同步的 X (Twitter) 降噪工具链：

1. **Step 1 — Chrome 采集插件 (`extension/`)**：在 X 时间线每条推文的头像旁注入一键采集按钮，抓取 `显示名称`、`@ID` 与 `发言正文`，本地存储并支持 **AES-256-GCM 加密打包为每台电脑独立的 `.npdb` 数据库**，安全同步至 OneDrive（文件内无任何明文垃圾内容）。
2. **Step 2 — 本地 AI 关键词提纯 (`analyzer/`)**：加载 OneDrive 目录下的所有 `.npdb` 加密库，解密合并去重后，调用本地大模型（Ollama / LM Studio / llama.cpp）通过两阶段提示词找出高频共现词、剔除日常常见词、保留高区分度核心词。
3. **Step 3 — FeedSieve 黑名单词库生成 (`exporter/`)**：将提纯后的核心词库导出为 [FeedSieve（福滤娃）](https://chromewebstore.google.com/detail/feedsieve/amhdjglnonjaoenddnifpnljgmocfdph) 可用的禁语词表（`.txt` 逐行导入 / YAML 词库包 / JSON 报告）。

---

## 目录结构

```text
NoPink/
├── README.md                  # 项目总览与快速开始
├── PROJECT.md                 # 项目愿景、里程碑与范围边界
├── ARCHITECTURE.md            # 系统架构、数据流与 .npdb 加密格式契约
├── DECISIONS.md               # 架构决策记录 (DEC-001 ~ DEC-004)
├── TODO.md                    # 任务规划与优先级追踪
├── BUGS.md                    # 缺陷与回归追踪
├── RESULT.md                  # 阶段成果归档
├── AI_TASKS.md                # 多智能体分区任务说明
├── WORKFLOW_GUIDE.md          # 多智能体协同研发工作流参考
├── extension/                 # [Step 1] Chrome Manifest V3 采集插件
├── analyzer/                  # [Step 2] Python 本地 AI 关键词筛选器
├── exporter/                  # [Step 3] FeedSieve 黑名单词库生成器
└── tests/                     # 自动化单元测试
```

---

## 快速开始

### 1. 安装 Chrome 采集插件 (`extension/`)
1. 打开 Chrome 扩展管理页 `chrome://extensions/`，开启右上角 **开发者模式**。
2. 点击 **加载已解压的扩展程序**，选择 `d:\NoPink\extension` 目录。
3. 打开 [x.com](https://x.com)，每条推文头像下方会出现小巧的 `NP` 采集按钮。
4. 点击插件图标打开弹窗，设置本机标识（`machineId`）与加密口令（Passphrase），可选择 OneDrive 本地同步目录并一键导出 `nopink-db-<machineId>.npdb`。

### 2. 运行本地 AI 关键词分析 (`analyzer/`)
确保本地已启动 Ollama（如 `ollama serve`）或 LM Studio 等 OpenAI 兼容服务：

```powershell
python -m analyzer.cli `
  --input-dir "$env:OneDrive\NoPink" `
  --output "output/keywords.json" `
  --provider ollama `
  --model qwen2.5:14b
```

### 3. 生成 FeedSieve 黑名单词库 (`exporter/`)

```powershell
python -m exporter.cli `
  --input "output/keywords.json" `
  --out-dir "output/feedsieve" `
  --max-risk low
```

生成文件说明：
- `output/feedsieve/feedsieve_muted_words.txt`：每行一个核心词，可直接复制粘贴至 FeedSieve 插件 **「降噪 → 禁语管理」** 或 X 原生静音词。
- `output/feedsieve/feedsieve_keyword_pack.yaml`：兼容 FeedSieve `community/keyword-packs/` 规范的 YAML 词库包。
- `output/feedsieve/feedsieve_report.json`：完整分析报告（含词频、风险等级与被剔除的常见词）。

### 4. 运行测试

```powershell
python -m unittest discover -s tests -v
```
