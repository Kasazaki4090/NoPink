"""Encrypted .npdb vault reader/writer and multi-machine merger."""

from __future__ import annotations

import base64
import gzip
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

NPDB_FORMAT = "nopink-db-v1"
PBKDF2_ITERATIONS = 200_000


def _derive_key(passphrase: str, salt: bytes, iterations: int = PBKDF2_ITERATIONS) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_npdb(records: list[dict[str, Any]], machine_id: str, passphrase: str) -> dict[str, Any]:
    """Encrypt records into a nopink-db-v1 envelope (zero plaintext)."""
    if not passphrase or len(passphrase) < 4:
        raise ValueError("Passphrase must be at least 4 characters.")

    salt = os.urandom(16)
    iv = os.urandom(12)
    key = _derive_key(passphrase, salt, PBKDF2_ITERATIONS)

    plain_bytes = json.dumps(
        {"machineId": machine_id, "records": records},
        ensure_ascii=False,
    ).encode("utf-8")
    compressed = gzip.compress(plain_bytes)

    ciphertext = AESGCM(key).encrypt(iv, compressed, None)

    return {
        "format": NPDB_FORMAT,
        "machineId": machine_id,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(records),
        "kdf": "PBKDF2-SHA256",
        "iterations": PBKDF2_ITERATIONS,
        "cipher": "AES-256-GCM",
        "compression": "gzip",
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "payload": base64.b64encode(ciphertext).decode("ascii"),
    }


def decrypt_npdb_dict(envelope: dict[str, Any], passphrase: str) -> dict[str, Any]:
    """Decrypt a nopink-db-v1 envelope dict into {machineId, records}."""
    if envelope.get("format") != NPDB_FORMAT:
        raise ValueError(f"Unsupported .npdb format: {envelope.get('format')}")

    salt = base64.b64decode(envelope["salt"])
    iv = base64.b64decode(envelope["iv"])
    payload = base64.b64decode(envelope["payload"])
    iterations = int(envelope.get("iterations", PBKDF2_ITERATIONS))

    key = _derive_key(passphrase, salt, iterations)
    compressed = AESGCM(key).decrypt(iv, payload, None)
    plain_bytes = gzip.decompress(compressed)
    return json.loads(plain_bytes.decode("utf-8"))


def decrypt_npdb_file(file_path: Path, passphrase: str) -> dict[str, Any]:
    """Read and decrypt a .npdb file."""
    envelope = json.loads(file_path.read_text(encoding="utf-8"))
    return decrypt_npdb_dict(envelope, passphrase)


def load_vault_dir(input_dir: Path, passphrase: str) -> dict[str, Any]:
    """Load all *.npdb files in input_dir, decrypt, merge and deduplicate records."""
    npdb_files = sorted(input_dir.glob("*.npdb"))
    if not npdb_files:
        raise FileNotFoundError(f"No .npdb files found in {input_dir}")

    seen_ids: set[str] = set()
    merged_records: list[dict[str, Any]] = []
    machines: list[dict[str, Any]] = []

    for path in npdb_files:
        data = decrypt_npdb_file(path, passphrase)
        machine_id = data.get("machineId", path.stem)
        recs = data.get("records", [])
        added = 0
        for rec in recs:
            rec_id = rec.get("id") or f"{rec.get('handle', '')}::{rec.get('tweetText', '')[:80]}"
            if rec_id in seen_ids:
                continue
            seen_ids.add(rec_id)
            rec_copy = dict(rec)
            rec_copy["sourceMachine"] = machine_id
            merged_records.append(rec_copy)
            added += 1

        machines.append(
            {
                "machineId": machine_id,
                "file": path.name,
                "rawCount": len(recs),
                "uniqueAdded": added,
            }
        )

    return {
        "machines": machines,
        "records": merged_records,
    }
