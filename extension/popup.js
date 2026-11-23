/* NoPink Collector - Popup Controller */

const IDB_NAME = "nopink_fs_db";
const IDB_STORE = "handles";
const HANDLE_KEY = "onedrive_dir";

let activeTabScrolling = false;

function setStatus(text, type = "") {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = type;
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandle(handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDirHandle() {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function sendMsg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, resolve);
  });
}

async function sendToActiveTab(payload) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id) {
    return { ok: false, error: "未找到当前活动标签页" };
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, payload, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: "请先在 X (x.com) 页面打开并刷新后再使用批量提取"
        });
        return;
      }
      resolve(resp || { ok: false, error: "页面无响应" });
    });
  });
}

function updateScrollBtnUI(isScrolling) {
  activeTabScrolling = Boolean(isScrolling);
  const btn = document.getElementById("batchScrollBtn");
  if (!btn) return;
  if (activeTabScrolling) {
    btn.textContent = "⏹ 停止滚页";
    btn.classList.add("btn-active-scroll");
  } else {
    btn.textContent = "自动滚页提取";
    btn.classList.remove("btn-active-scroll");
  }
}

async function refreshCountBadge() {
  const state = await sendMsg({ type: "GET_STATE" });
  if (state && state.ok) {
    document.getElementById("countBadge").textContent = `${state.records.length} 条`;
  }
}

async function init() {
  const state = await sendMsg({ type: "GET_STATE" });
  if (state && state.ok) {
    document.getElementById("machineIdInput").value = state.machineId;
    document.getElementById("countBadge").textContent = `${state.records.length} 条`;
  }

  const pageInfo = await sendToActiveTab({ type: "GET_PAGE_TARGET" });
  if (pageInfo && pageInfo.ok) {
    if (pageInfo.targetHandle) {
      document.getElementById("targetHandleInput").value = pageInfo.targetHandle;
    }
    if (typeof pageInfo.maxLimit === "number") {
      document.getElementById("maxLimitInput").value = String(pageInfo.maxLimit);
    }
    updateScrollBtnUI(pageInfo.isAutoScrolling);
  }

  if (chrome.storage.session) {
    const sess = await chrome.storage.session.get("nopink_pass");
    if (sess.nopink_pass) {
      document.getElementById("passphraseInput").value = sess.nopink_pass;
    }
  }

  const dirHandle = await loadDirHandle().catch(() => null);
  if (dirHandle) {
    setStatus(`已绑定目录: ${dirHandle.name}（导出将直接覆盖写入）`, "ok");
  }
}

document.getElementById("batchVisibleBtn").addEventListener("click", async () => {
  const targetHandle = document.getElementById("targetHandleInput").value.trim();
  const res = await sendToActiveTab({
    type: "BATCH_COLLECT_VISIBLE",
    targetHandle
  });
  if (res && res.ok) {
    if (res.targetHandle) {
      document.getElementById("targetHandleInput").value = res.targetHandle;
    }
    await refreshCountBadge();
    setStatus(
      `已提取 ${res.targetHandle}：新增 ${res.addedCount} 条（过滤路人 ${res.skippedOtherUsers} 条）· 共 ${res.total} 条`,
      "ok"
    );
  } else {
    setStatus((res && res.error) || "提取失败", "err");
  }
});

document.getElementById("batchScrollBtn").addEventListener("click", async () => {
  if (activeTabScrolling) {
    const res = await sendToActiveTab({ type: "STOP_AUTO_SCROLL" });
    updateScrollBtnUI(false);
    await refreshCountBadge();
    if (res && res.ok) {
      setStatus("已发送停止自动滚页指令", "ok");
    }
    return;
  }

  const targetHandle = document.getElementById("targetHandleInput").value.trim();
  const maxLimitVal = parseInt(document.getElementById("maxLimitInput").value, 10);
  const maxLimit = !Number.isNaN(maxLimitVal) && maxLimitVal >= 0 ? maxLimitVal : 60;
  const res = await sendToActiveTab({
    type: "START_AUTO_SCROLL",
    targetHandle,
    maxLimit
  });
  if (res && res.ok) {
    if (res.targetHandle) {
      document.getElementById("targetHandleInput").value = res.targetHandle;
    }
    updateScrollBtnUI(true);
    setStatus(`正在慢速采集 ${res.targetHandle}（单次上限 ${maxLimit || "不限"} 条，遇限流自动刹车）`, "ok");
  } else {
    setStatus((res && res.error) || "启动自动滚页失败", "err");
  }
});

document.getElementById("saveMachineBtn").addEventListener("click", async () => {
  const val = document.getElementById("machineIdInput").value;
  const res = await sendMsg({ type: "SET_MACHINE_ID", machineId: val });
  if (res && res.ok) {
    document.getElementById("machineIdInput").value = res.machineId;
    setStatus(`本机标识已更新为 ${res.machineId}`, "ok");
  } else {
    setStatus("无效的本机标识（仅支持字母、数字、-、_）", "err");
  }
});

document.getElementById("passphraseInput").addEventListener("input", (e) => {
  if (chrome.storage.session) {
    chrome.storage.session.set({ nopink_pass: e.target.value });
  }
});

document.getElementById("pickDirBtn").addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await saveDirHandle(handle);
    setStatus(`已绑定同步目录: ${handle.name}`, "ok");
  } catch (err) {
    if (err.name !== "AbortError") {
      setStatus(`选择目录失败: ${err.message}`, "err");
    }
  }
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const passphrase = document.getElementById("passphraseInput").value;
  if (!passphrase || passphrase.length < 4) {
    setStatus("请先输入至少 4 位的加密口令", "err");
    return;
  }

  const state = await sendMsg({ type: "GET_STATE" });
  if (!state || !state.ok) {
    setStatus("读取本地数据失败", "err");
    return;
  }
  if (state.records.length === 0) {
    setStatus("当前没有可导出的采集记录", "err");
    return;
  }

  try {
    setStatus("正在加密打包...");
    const npdbContent = await encryptRecordsToNpdb(
      state.records,
      state.machineId,
      passphrase
    );
    const filename = `nopink-db-${state.machineId}.npdb`;

    const dirHandle = await loadDirHandle().catch(() => null);
    if (dirHandle) {
      const perm = await dirHandle.requestPermission({ mode: "readwrite" });
      if (perm === "granted") {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(npdbContent);
        await writable.close();
        setStatus(`已加密写入 ${dirHandle.name}/${filename} (${state.records.length} 条)`, "ok");
        return;
      }
    }

    const dl = await sendMsg({
      type: "DOWNLOAD_NPDB",
      machineId: state.machineId,
      content: npdbContent
    });
    if (dl && dl.ok) {
      setStatus(`已下载至 ${dl.filename} (${state.records.length} 条)`, "ok");
    } else {
      setStatus("导出失败: " + (dl ? dl.error : "未知错误"), "err");
    }
  } catch (err) {
    setStatus("加密导出失败: " + err.message, "err");
  }
});

let confirmClear = false;
document.getElementById("clearBtn").addEventListener("click", async () => {
  if (!confirmClear) {
    confirmClear = true;
    setStatus("再次点击“清空”以确认删除本机缓存", "err");
    setTimeout(() => { confirmClear = false; }, 3500);
    return;
  }
  confirmClear = false;
  await sendMsg({ type: "CLEAR_RECORDS" });
  document.getElementById("countBadge").textContent = "0 条";
  setStatus("本机缓存已清空", "ok");
});

init();
