# NoPink (PROJECT.md)

一套隐私优先的 X (Twitter) 粉红言论采集、本地 AI 核心词提纯与 FeedSieve 黑名单词库生成工具链。

---

## 1. Project Goal

让用户在刷 X 时能够零摩擦地标记并收集目标账号发言，通过**每台电脑独立加密存储 + OneDrive 无明文同步 + 本地 AI 关键词提纯**，最终自动生成高信噪比、低误伤的黑名单词库并导入 FeedSieve 插件实现时间线降噪。

```text
[X (Twitter) Web UI — Chrome 扩展一键点击头像旁采集]
        ↓
[每台电脑独立加密库: nopink-db-<machineId>.npdb (AES-256-GCM + Gzip)]
        ↓  (OneDrive 自动同步，零明文暴露)
[本地 AI 关键词提纯引擎 (Ollama / LM Studio 两阶段 Map-Reduce)]
        ↓
[FeedSieve 黑名单词库生成 (.txt 禁语列表 / .yaml 词库包)]
```

---

## 2. Phase Milestones

### Phase 1 Goals (MVP / Foundation)
- [x] **Step 1 Chrome 插件**：在推文头像旁注入采集按钮，提取 `名字 / @ID / 发言正文 / 推文链接`，本地存储并支持按 `machineId` 独立加密导出 `.npdb` 至 OneDrive 目录。
- [x] **Step 2 本地 AI 分析器**：加载并解密多台电脑的 `.npdb` 文件，合并去重，使用两阶段提示词调用本地 AI 提取共现核心词并剔除常见词。
- [x] **Step 3 FeedSieve 词库导出器**：将提纯后的词库导出为 FeedSieve 禁语 `.txt` 与 `keyword-pack` `.yaml`。
- [x] **自动化测试套件**：覆盖 `.npdb` 加解密（含零明文断言）、多机合并去重、本地 AI 批处理与导出逻辑。

### Features That May Be Limited in Phase 1
- 全自动后台静默写入 OneDrive（受限于浏览器安全沙箱，需在插件弹窗中授权一次目录或通过下载目录覆盖导出）。
- 自动模拟点击 FeedSieve 内部 UI 写入禁语（一期采用标准 `.txt` / `.yaml` 导出以便人工复核防误伤）。

### Out of Scope (Explicit Anti-Goals)
- 不向任何云端服务器或第三方 API 上传采集到的推文数据（严禁非本地 AI 泄露隐私与原始文本）。
- 不自动对账号发起批量举报、批量拉黑或自动化网络请求（严格本地只读采集）。
- 不在 OneDrive 或本地磁盘落盘任何明文 `.json` / `.csv` / `.sqlite` 采集样本。

---

## 3. Platform and Technologies
- **Operating Systems**: Windows 10/11（主力），兼容 macOS / Linux（Python CLI 与 Chrome 扩展）。
- **Extension**: Chrome Manifest V3, Vanilla JS (ES2022), Web Crypto API (`AES-256-GCM` + `PBKDF2`), File System Access API。
- **Analyzer & Exporter**: Python 3.10+, `cryptography`, `PyYAML`, `requests`。
- **Local AI**: Ollama (`/api/chat`) 或任何 OpenAI 兼容本地推理服务（LM Studio, llama.cpp, vLLM）。

---

## 4. Reference Projects & Baseline Standards
- **FeedSieve (福滤娃)**: Chrome Web Store `amhdjglnonjaoenddnifpnljgmocfdph` / GitHub `realchendahuang/feedsieve`（仅作词库格式与禁语导入规范参考，无运行时代码依赖）。
