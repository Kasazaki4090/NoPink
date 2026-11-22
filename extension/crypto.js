/* NoPink Collector - Web Crypto AES-256-GCM + PBKDF2 + Gzip (.npdb) */

const NPDB_FORMAT = "nopink-db-v1";
const PBKDF2_ITERATIONS = 200000;

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function gzipBytes(inputBytes) {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(inputBytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzipBytes(compressedBytes) {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function deriveAesKey(passphrase, salt, usages) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

async function encryptRecordsToNpdb(records, machineId, passphrase) {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("加密口令至少需要 4 个字符");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, ["encrypt"]);

  const plainObj = {
    machineId,
    records
  };
  const plainBytes = new TextEncoder().encode(JSON.stringify(plainObj));
  const compressed = await gzipBytes(plainBytes);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    compressed
  );

  const envelope = {
    format: NPDB_FORMAT,
    machineId,
    exportedAt: new Date().toISOString(),
    count: records.length,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    compression: "gzip",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    payload: bytesToBase64(new Uint8Array(cipherBuf))
  };

  return JSON.stringify(envelope, null, 2);
}

async function decryptNpdb(envelopeJson, passphrase) {
  const env = typeof envelopeJson === "string" ? JSON.parse(envelopeJson) : envelopeJson;
  if (env.format !== NPDB_FORMAT) {
    throw new Error(`Unsupported format: ${env.format}`);
  }
  const salt = base64ToBytes(env.salt);
  const iv = base64ToBytes(env.iv);
  const payload = base64ToBytes(env.payload);
  const key = await deriveAesKey(passphrase, salt, ["decrypt"]);

  const plainCompressed = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    payload
  );
  const decompressed = await gunzipBytes(new Uint8Array(plainCompressed));
  return JSON.parse(new TextDecoder().decode(decompressed));
}
