/* NoPink Collector - X (Twitter) Content Script */

(() => {
  const BUTTON_CLASS = "nopink-collect-btn";
  const PROCESSED_ATTR = "data-nopink-bound";
  const savedKeys = new Set();

  function showToast(text, isError = false) {
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
    }, 2200);
  }

  function extractTweetData(article) {
    const userNameBox = article.querySelector('div[data-testid="User-Name"]');
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

    const textEl = article.querySelector('div[data-testid="tweetText"]');
    const tweetText = textEl ? (textEl.innerText || "").trim() : "";

    let tweetUrl = "";
    const statusLinks = article.querySelectorAll('a[href*="/status/"]');
    for (const a of statusLinks) {
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

  function injectButton(article) {
    if (article.getAttribute(PROCESSED_ATTR) === "1") return;
    const avatarBox = article.querySelector('div[data-testid="Tweet-User-Avatar"]');
    if (!avatarBox || !avatarBox.parentElement) return;

    article.setAttribute(PROCESSED_ATTR, "1");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BUTTON_CLASS;
    btn.title = "NoPink：采集该账号与发言";
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
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of articles) {
      injectButton(article);
    }
  }

  chrome.runtime.sendMessage({ type: "GET_SAVED_IDS" }, (resp) => {
    if (resp && Array.isArray(resp.ids)) {
      resp.ids.forEach((id) => savedKeys.add(id));
    }
    scanTweets();
  });

  const observer = new MutationObserver(() => {
    scanTweets();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
