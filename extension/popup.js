/* NoPink Collector - Popup Controller */

const IDB_NAME = "nopink_fs_db";
const IDB_STORE = "handles";
const HANDLE_KEY = "onedrive_dir";

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

async function init() {
  const state = await sendMsg({ type: "GET_STATE" });
  if (state && state.ok) {
    document.getElementById("machineIdInput").value = state.machineId;
    document.getElementById("countBadge").textContent = `${state.records.length} 条`;
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
