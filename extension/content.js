/* NoPink Collector - X (Twitter) Content Script */

(() => {
  const BUTTON_CLASS = "nopink-collect-btn";
  const PROCESSED_ATTR = "data-nopink-bound";
  const savedKeys = new Set();

  const RESERVED_PATHS = new Set([
    "home",
    "explore",
    "notifications",
    "messages",
    "search",
    "settings",
    "i",
    "compose",
    "lists",
    "bookmarks",
    "communities",
    "jobs",
    "grok",
    "premium",
    "tos",
    "privacy",
    "login",
    "logout",
    "signup"
  ]);

  let isAutoScrolling = false;
  let stopAutoScrollFlag = false;
  let sessionAddedCount = 0;
  let sessionSkippedOthers = 0;
  let sessionMaxLimit = 60;
  let lastDetectedUrl = "";

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 检测 X 页面主时间线是否已触发限流或加载报错（Something went wrong / Retry / 出错了）
   */
  function detectRateLimitOrError() {
    const primaryCol =
      document.querySelector('[data-testid="primaryColumn"]') || document.body;
    const errorPatterns = [
      "Something went wrong",
      "Rate limit exceeded",
      "Try reloading",
      "出错了",
      "请尝试重新加载",
      "超出速率限制",
      "超出浏览限制"
    ];

    // 检查主栏底部的错误提示与重试按钮
    const buttons = primaryCol.querySelectorAll('button, div[role="button"]');
    for (const btn of buttons) {
      const txt = (btn.innerText || "").trim();
      if (txt === "Retry" || txt === "重试") {
        return true;
      }
    }

    const spans = primaryCol.querySelectorAll("span");
    for (const sp of spans) {
      const txt = (sp.innerText || "").trim();
      if (!txt) continue;
      for (const pat of errorPatterns) {
        if (txt.includes(pat)) {
          return true;
        }
      }
    }
    return false;
  }

  function normalizeHandle(raw) {
    const clean = String(raw || "").trim().replace(/^@+/, "");
    if (!clean || !/^[A-Za-z0-9_]{1,30}$/.test(clean)) return "";
    return `@${clean}`;
  }

  function detectPageTargetHandle() {
    const parts = (location.pathname || "").split("/").filter(Boolean);
    if (parts.length >= 1) {
      const first = parts[0];
      if (!RESERVED_PATHS.has(first.toLowerCase()) && /^[A-Za-z0-9_]{1,30}$/.test(first)) {
        return `@${first}`;
      }
    }
    try {
      const q = new URLSearchParams(location.search).get("q") || "";
      const fromMatch = q.match(/\bfrom:([A-Za-z0-9_]{1,30})\b/i);
      if (fromMatch) {
        return `@${fromMatch[1]}`;
      }
    } catch (_) {
      // ignore URLSearchParams errors
    }
    return "";
  }

  function showToast(text, isError = false, duration = 2600) {
    let toast = document.getElementById("nopink-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "nopink-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.className = isError ? "nopink-toast nopink-toast-err" : "nopink-toast";
    toast.classList.add("nopink-toast-show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove("nopink-toast-show");
    }, duration);
  }

  function isBeforeNode(nodeA, nodeB) {
    if (!nodeA || !nodeB) return true;
    return Boolean(nodeA.compareDocumentPosition(nodeB) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function extractTweetData(article) {
    const userNameBoxes = article.querySelectorAll('div[data-testid="User-Name"]');
    const userNameBox = userNameBoxes[0] || null;
    const quotedUserNameBox = userNameBoxes[1] || null;

    let displayName = "";
    let handle = "";

    if (userNameBox) {
      const spans = userNameBox.querySelectorAll("span");
      for (const sp of spans) {
        const txt = (sp.innerText || "").trim();
        if (!txt) continue;
        if (!handle && /^@[A-Za-z0-9_]{1,30}$/.test(txt)) {
          handle = txt;
        }
      }
      const firstLink = userNameBox.querySelector('a[role="link"]');
      if (firstLink) {
        const raw = (firstLink.innerText || "").trim().split("\n")[0].trim();
        if (raw && !raw.startsWith("@")) {
          displayName = raw;
        }
      }
      if (!displayName) {
        for (const sp of spans) {
          const txt = (sp.innerText || "").trim();
          if (txt && !txt.startsWith("@") && txt !== "·") {
            displayName = txt;
            break;
          }
        }
      }
    }

    // 仅提取当前推文作者本人的正文，排除引用推文（Quoted Tweet）内部的正文
    let tweetText = "";
    const textEls = article.querySelectorAll('div[data-testid="tweetText"]');
    for (const el of textEls) {
      if (!quotedUserNameBox || isBeforeNode(el, quotedUserNameBox)) {
        tweetText = (el.innerText || "").trim();
        break;
      }
    }

    let tweetUrl = "";
    const statusLinks = article.querySelectorAll('a[href*="/status/"]');
    for (const a of statusLinks) {
      if (quotedUserNameBox && !isBeforeNode(a, quotedUserNameBox)) {
        continue;
      }
      const href = a.getAttribute("href") || "";
      const match = href.match(/^\/[^/]+\/status\/\d+/);
      if (match) {
        tweetUrl = `https://x.com${match[0]}`;
        break;
      }
    }

    const id = tweetUrl
      ? tweetUrl.split("/status/")[1]
      : `${handle || "unknown"}::${tweetText.slice(0, 80)}`;

    return {
      id,
      displayName: displayName || handle || "Unknown",
      handle: handle || "",
      tweetText,
      tweetUrl,
      capturedAt: new Date().toISOString()
    };
  }

  function markArticleSaved(article, id) {
    savedKeys.add(id);
    const btn = article.querySelector(`.${BUTTON_CLASS}`);
    if (btn) {
      btn.classList.add("nopink-saved");
      btn.textContent = "✓";
    }
  }

  function saveRecordsBatch(records) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "SAVE_RECORDS_BATCH", records },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { ok: false, error: "Empty response" });
        }
      );
    });
  }

  /**
   * 仅提取页面上属于 targetHandle 的推文与回复，过滤掉回复串中的所有其他正常网友
   */
  async function collectVisibleForTarget(rawTargetHandle, silent = false) {
    const targetHandle = normalizeHandle(rawTargetHandle || detectPageTargetHandle());
    if (!targetHandle) {
      if (!silent) {
        showToast("请先指定要提取的目标账号 @handle", true);
      }
      return { ok: false, error: "未指定目标 @handle" };
    }

    const targetLower = targetHandle.toLowerCase();
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const matchedRecords = [];
    const matchedArticles = [];
    let skippedOtherUsers = 0;
    let skippedEmptyText = 0;

    for (const article of articles) {
      const record = extractTweetData(article);
      if (!record.handle) continue;

      if (record.handle.toLowerCase() !== targetLower) {
        skippedOtherUsers++;
        continue;
      }

      if (!record.tweetText) {
        skippedEmptyText++;
        continue;
      }

      matchedRecords.push(record);
      matchedArticles.push({ article, id: record.id });
    }

    if (matchedRecords.length === 0) {
      const msg =
        skippedOtherUsers > 0
          ? `当前屏未找到 ${targetHandle} 的文字发言（已过滤 ${skippedOtherUsers} 条他人推文）`
          : `当前屏未找到 ${targetHandle} 的推文`;
      if (!silent) {
        showToast(msg, true);
      }
      return {
        ok: true,
        targetHandle,
        addedCount: 0,
        duplicateCount: 0,
        skippedOtherUsers,
        skippedEmptyText,
        total: savedKeys.size
      };
    }

    const resp = await saveRecordsBatch(matchedRecords);
    if (!resp.ok) {
      if (!silent) {
        showToast("批量保存失败: " + (resp.error || "未知错误"), true);
      }
      return resp;
    }

    for (const item of matchedArticles) {
      markArticleSaved(item.article, item.id);
    }

    if (!silent) {
      showToast(
        `已采集 ${targetHandle}：新增 ${resp.addedCount} 条（重复 ${resp.duplicateCount} 条，过滤他人 ${skippedOtherUsers} 条）· 库内共 ${resp.total} 条`,
        false,
        3400
      );
    }

    updateBatchPanelUI();
    return {
      ok: true,
      targetHandle,
      addedCount: resp.addedCount,
      duplicateCount: resp.duplicateCount,
      skippedOtherUsers,
      skippedEmptyText,
      total: resp.total
    };
  }

  function getPanelMaxLimit() {
    const input = document.getElementById("nopink-limit-input");
    if (input) {
      const val = parseInt(input.value, 10);
      if (!Number.isNaN(val) && val >= 0) {
        return val;
      }
    }
    return sessionMaxLimit;
  }

  function setPanelMaxLimit(limitVal) {
    const num = parseInt(limitVal, 10);
    if (!Number.isNaN(num) && num >= 0) {
      sessionMaxLimit = num;
      const input = document.getElementById("nopink-limit-input");
      if (input) {
        input.value = String(num);
      }
    }
  }

  async function startAutoScrollCollect(rawTargetHandle, customMaxLimit) {
    const targetHandle = normalizeHandle(rawTargetHandle || getPanelTargetHandle());
    if (!targetHandle) {
      showToast("请先输入或打开目标用户主页 (@handle)", true);
      return { ok: false, error: "未指定目标 @handle" };
    }
    if (isAutoScrolling) {
      return { ok: true, alreadyRunning: true, targetHandle };
    }

    if (typeof customMaxLimit === "number" && customMaxLimit >= 0) {
      setPanelMaxLimit(customMaxLimit);
    }
    const maxLimit = getPanelMaxLimit();

    isAutoScrolling = true;
    stopAutoScrollFlag = false;
    sessionAddedCount = 0;
    sessionSkippedOthers = 0;
    let idleRounds = 0;
    let scrollCount = 0;
    let rateLimited = false;
    let reachedLimit = false;
    const maxIdleRounds = 7;
    let totalInDb = savedKeys.size;

    setPanelTargetHandle(targetHandle);
    updateBatchPanelUI();
    const limitDesc = maxLimit > 0 ? `上限 ${maxLimit} 条` : "无上限";
    showToast(`开始拟人慢速提取 ${targetHandle}（${limitDesc}，防限流保护已开启）...`);

    while (!stopAutoScrollFlag && idleRounds < maxIdleRounds) {
      if (detectRateLimitOrError()) {
        rateLimited = true;
        break;
      }

      const stepRes = await collectVisibleForTarget(targetHandle, true);
      if (stepRes && stepRes.ok) {
        sessionAddedCount += stepRes.addedCount || 0;
        sessionSkippedOthers = Math.max(sessionSkippedOthers, stepRes.skippedOtherUsers || 0);
        if (typeof stepRes.total === "number") {
          totalInDb = stepRes.total;
        }
        if ((stepRes.addedCount || 0) > 0) {
          idleRounds = 0;
        } else {
          idleRounds++;
        }
      } else {
        idleRounds++;
      }

      updateBatchPanelUI(totalInDb);

      // 检查是否达到单次防限流采集上限
      if (maxLimit > 0 && sessionAddedCount >= maxLimit) {
        reachedLimit = true;
        break;
      }

      if (stopAutoScrollFlag || idleRounds >= maxIdleRounds) {
        break;
      }

      if (detectRateLimitOrError()) {
        rateLimited = true;
        break;
      }

      scrollCount++;
      const scrollRatio = 1.08 + Math.random() * 0.34;
      window.scrollBy({
        top: Math.floor(window.innerHeight * scrollRatio),
        behavior: "smooth"
      });

      // 每连续滚动 8 屏进行一次阶段性防限流小憩（5.5 ~ 7.5 秒），平时随机停顿 2.6 ~ 4.3 秒
      let waitMs = randomInt(2600, 4300);
      if (scrollCount % 8 === 0) {
        waitMs = randomInt(5500, 7500);
        const statusEl = document.getElementById("nopink-batch-status");
        if (statusEl) {
          statusEl.textContent = `☕ 防限流小憩 ${(waitMs / 1000).toFixed(1)}s · 已新增 ${sessionAddedCount} 条`;
        }
      }

      await new Promise((r) => setTimeout(r, waitMs));
    }

    isAutoScrolling = false;
    stopAutoScrollFlag = false;
    updateBatchPanelUI(totalInDb);

    if (rateLimited) {
      showToast(
        `⚠️ 检测到 X 触发浏览限制/加载报错，已自动紧急刹车！本次已安全保存 ${sessionAddedCount} 条（库内共 ${totalInDb} 条），建议休息 10~15 分钟`,
        true,
        6000
      );
    } else if (reachedLimit) {
      showToast(
        `🛡️ 已达单次防限流上限（本次新增 ${sessionAddedCount} 条 · 库内共 ${totalInDb} 条），已自动停机保护账号`,
        false,
        4500
      );
    } else {
      showToast(
        `✅ ${targetHandle} 提取结束：本次新增 ${sessionAddedCount} 条 · 库内共 ${totalInDb} 条`,
        false,
        4000
      );
    }

    return {
      ok: true,
      targetHandle,
      sessionAddedCount,
      rateLimited,
      reachedLimit,
      total: totalInDb
    };
  }

  function stopAutoScrollCollect() {
    if (isAutoScrolling) {
      stopAutoScrollFlag = true;
      showToast("正在停止自动滚动提取...");
    }
    return { ok: true };
  }

  function getPanelTargetHandle() {
    const input = document.getElementById("nopink-target-input");
    if (input && input.value.trim()) {
      return normalizeHandle(input.value);
    }
    return detectPageTargetHandle();
  }

  function setPanelTargetHandle(handle) {
    const input = document.getElementById("nopink-target-input");
    if (input && handle) {
      input.value = handle;
    }
  }

  function ensureBatchPanel() {
    let panel = document.getElementById("nopink-batch-panel");
    const detected = detectPageTargetHandle();

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "nopink-batch-panel";
      panel.className = "nopink-batch-panel";
      panel.innerHTML = `
        <div class="nopink-batch-header">
          <span class="nopink-batch-logo">NoPink 专人采集</span>
          <button type="button" id="nopink-batch-collapse" class="nopink-batch-collapse" title="收起/展开">−</button>
        </div>
        <div class="nopink-batch-body" id="nopink-batch-body">
          <div class="nopink-batch-row nopink-batch-row-split">
            <input type="text" id="nopink-target-input" class="nopink-target-input" placeholder="@目标账号" />
            <input type="number" id="nopink-limit-input" class="nopink-limit-input" min="0" max="500" value="${sessionMaxLimit}" title="单次自动滚页采集上限（防 X 15分钟浏览限流，默认 60 条，填 0 为不限）" />
          </div>
          <div class="nopink-batch-actions">
            <button type="button" id="nopink-btn-visible" class="nopink-batch-btn nopink-batch-btn-sec" title="仅提取当前画面中该账号本人的发帖与回复（跳过其他网友）">
              提取本屏
            </button>
            <button type="button" id="nopink-btn-scroll" class="nopink-batch-btn nopink-batch-btn-pri" title="拟人慢速滚动并持续提取该账号本人的发帖与回复（遇限流或达上限自动刹车）">
              自动滚页提取
            </button>
          </div>
          <div class="nopink-batch-hint" id="nopink-batch-status">
            防限流慢速 · 单次上限 ${sessionMaxLimit} 条
          </div>
        </div>
      `;
      document.body.appendChild(panel);

      const collapseBtn = document.getElementById("nopink-batch-collapse");
      collapseBtn.addEventListener("click", () => {
        const body = document.getElementById("nopink-batch-body");
        const collapsed = body.classList.toggle("nopink-hidden");
        collapseBtn.textContent = collapsed ? "+" : "−";
      });

      document.getElementById("nopink-limit-input").addEventListener("change", (e) => {
        setPanelMaxLimit(e.target.value);
        updateBatchPanelUI();
      });

      document.getElementById("nopink-btn-visible").addEventListener("click", () => {
        collectVisibleForTarget(getPanelTargetHandle(), false);
      });

      document.getElementById("nopink-btn-scroll").addEventListener("click", () => {
        if (isAutoScrolling) {
          stopAutoScrollCollect();
        } else {
          startAutoScrollCollect(getPanelTargetHandle(), getPanelMaxLimit());
        }
      });
    }

    if (location.href !== lastDetectedUrl) {
      lastDetectedUrl = location.href;
      const input = document.getElementById("nopink-target-input");
      if (input && detected && !isAutoScrolling) {
        input.value = detected;
      }
      if (detected) {
        panel.classList.remove("nopink-hidden");
      }
    }
  }

  function updateBatchPanelUI(totalOverride) {
    const scrollBtn = document.getElementById("nopink-btn-scroll");
    const statusEl = document.getElementById("nopink-batch-status");
    if (!scrollBtn || !statusEl) return;

    const total = typeof totalOverride === "number" ? totalOverride : savedKeys.size;
    const maxLimit = getPanelMaxLimit();
    const limitTag = maxLimit > 0 ? `${sessionAddedCount}/${maxLimit}` : `+${sessionAddedCount}`;
    if (isAutoScrolling) {
      scrollBtn.textContent = `⏹ 停止 (${limitTag})`;
      scrollBtn.classList.add("nopink-scrolling-active");
      statusEl.textContent = `慢速采集中：新增 ${limitTag} 条 · 库内共 ${total} 条`;
    } else {
      scrollBtn.textContent = "自动滚页提取";
      scrollBtn.classList.remove("nopink-scrolling-active");
      statusEl.textContent = `防限流上限 ${maxLimit || "不限"} 条 · 库内已存 ${total} 条`;
    }
  }

  function injectButton(article) {
    if (article.getAttribute(PROCESSED_ATTR) === "1") return;
    const avatarBox = article.querySelector('div[data-testid="Tweet-User-Avatar"]');
    if (!avatarBox || !avatarBox.parentElement) return;

    article.setAttribute(PROCESSED_ATTR, "1");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BUTTON_CLASS;
    btn.title = "点击：采集此条推文\nShift+点击：将此人设为目标并提取当前屏TA的所有发言";
    btn.textContent = "NP";

    const preview = extractTweetData(article);
    if (savedKeys.has(preview.id)) {
      btn.classList.add("nopink-saved");
      btn.textContent = "✓";
    }

    const stopNav = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    btn.addEventListener("mousedown", stopNav);
    btn.addEventListener("pointerdown", stopNav);

    btn.addEventListener("click", (e) => {
      stopNav(e);
      const record = extractTweetData(article);
      if (!record.handle && !record.tweetText) {
        showToast("未能识别该推文内容", true);
        return;
      }

      // Shift + 点击任意头像旁 NP 按钮：直接将该账号设为目标并提取整屏该账号的所有推文
      if (e.shiftKey && record.handle) {
        setPanelTargetHandle(record.handle);
        collectVisibleForTarget(record.handle, false);
        return;
      }

      chrome.runtime.sendMessage(
        { type: "SAVE_RECORD", record },
        (resp) => {
          if (chrome.runtime.lastError) {
            showToast("保存失败: " + chrome.runtime.lastError.message, true);
            return;
          }
          if (resp && resp.ok) {
            savedKeys.add(record.id);
            btn.classList.add("nopink-saved");
            btn.textContent = "✓";
            updateBatchPanelUI(resp.total);
            showToast(
              resp.duplicate
                ? `已存在 (${record.handle || record.displayName})`
                : `已采集 ${record.handle || record.displayName} · 共 ${resp.total} 条`
            );
          } else {
            showToast("保存失败", true);
          }
        }
      );
    });

    avatarBox.parentElement.appendChild(btn);
  }

  function scanTweets() {
    ensureBatchPanel();
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of articles) {
      injectButton(article);
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "GET_PAGE_TARGET") {
      sendResponse({
        ok: true,
        targetHandle: getPanelTargetHandle() || detectPageTargetHandle(),
        isAutoScrolling,
        sessionAddedCount,
        maxLimit: getPanelMaxLimit()
      });
      return false;
    }

    if (msg.type === "BATCH_COLLECT_VISIBLE") {
      if (msg.targetHandle) {
        setPanelTargetHandle(msg.targetHandle);
      }
      collectVisibleForTarget(msg.targetHandle || getPanelTargetHandle(), false).then(sendResponse);
      return true;
    }

    if (msg.type === "START_AUTO_SCROLL") {
      if (msg.targetHandle) {
        setPanelTargetHandle(msg.targetHandle);
      }
      if (typeof msg.maxLimit === "number" && msg.maxLimit >= 0) {
        setPanelMaxLimit(msg.maxLimit);
      }
      const target = normalizeHandle(msg.targetHandle || getPanelTargetHandle());
      if (!target) {
        sendResponse({ ok: false, error: "请先输入目标 @handle" });
        return false;
      }
      startAutoScrollCollect(target, getPanelMaxLimit());
      sendResponse({
        ok: true,
        started: true,
        targetHandle: target,
        maxLimit: getPanelMaxLimit()
      });
      return false;
    }

    if (msg.type === "STOP_AUTO_SCROLL") {
      sendResponse(stopAutoScrollCollect());
      return false;
    }

    return false;
  });

  chrome.runtime.sendMessage({ type: "GET_SAVED_IDS" }, (resp) => {
    if (resp && Array.isArray(resp.ids)) {
      resp.ids.forEach((id) => savedKeys.add(id));
    }
    scanTweets();
    updateBatchPanelUI(savedKeys.size);
  });

  const observer = new MutationObserver(() => {
    scanTweets();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
