/* NoPink Collector - Background Service Worker */

const STORAGE_KEY_RECORDS = "nopink_records";
const STORAGE_KEY_MACHINE = "nopink_machine_id";

async function ensureMachineId() {
  const data = await chrome.storage.local.get(STORAGE_KEY_MACHINE);
  if (data[STORAGE_KEY_MACHINE]) {
    return data[STORAGE_KEY_MACHINE];
  }
  const generated = `pc-${crypto.randomUUID().slice(0, 8)}`;
  await chrome.storage.local.set({ [STORAGE_KEY_MACHINE]: generated });
  return generated;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureMachineId();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "SAVE_RECORD") {
      const data = await chrome.storage.local.get(STORAGE_KEY_RECORDS);
      const records = Array.isArray(data[STORAGE_KEY_RECORDS])
        ? data[STORAGE_KEY_RECORDS]
        : [];
      const exists = records.some((r) => r.id === msg.record.id);
      if (!exists) {
        records.push(msg.record);
        await chrome.storage.local.set({ [STORAGE_KEY_RECORDS]: records });
      }
      sendResponse({ ok: true, duplicate: exists, total: records.length });
      return;
    }

    if (msg.type === "GET_SAVED_IDS") {
      const data = await chrome.storage.local.get(STORAGE_KEY_RECORDS);
      const records = Array.isArray(data[STORAGE_KEY_RECORDS])
        ? data[STORAGE_KEY_RECORDS]
        : [];
      sendResponse({ ok: true, ids: records.map((r) => r.id) });
      return;
    }

    if (msg.type === "GET_STATE") {
      const machineId = await ensureMachineId();
      const data = await chrome.storage.local.get(STORAGE_KEY_RECORDS);
      const records = Array.isArray(data[STORAGE_KEY_RECORDS])
        ? data[STORAGE_KEY_RECORDS]
        : [];
      sendResponse({ ok: true, machineId, records });
      return;
    }

    if (msg.type === "SET_MACHINE_ID") {
      const clean = String(msg.machineId || "")
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, "");
      if (!clean) {
        sendResponse({ ok: false, error: "Invalid machineId" });
        return;
      }
      await chrome.storage.local.set({ [STORAGE_KEY_MACHINE]: clean });
      sendResponse({ ok: true, machineId: clean });
      return;
    }

    if (msg.type === "CLEAR_RECORDS") {
      await chrome.storage.local.set({ [STORAGE_KEY_RECORDS]: [] });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "DOWNLOAD_NPDB") {
      const bytes = new TextEncoder().encode(msg.content);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      const dataUrl = `data:application/octet-stream;base64,${btoa(binary)}`;
      const filename = `NoPink/nopink-db-${msg.machineId}.npdb`;
      await chrome.downloads.download({
        url: dataUrl,
        filename,
        conflictAction: "overwrite",
        saveAs: false
      });
      sendResponse({ ok: true, filename });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((err) => {
    sendResponse({ ok: false, error: err.message });
  });

  return true;
});
