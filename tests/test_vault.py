import json
import tempfile
import unittest
from pathlib import Path

from cryptography.exceptions import InvalidTag

from analyzer.vault import decrypt_npdb_dict, encrypt_npdb, load_vault_dir


class TestVault(unittest.TestCase):
    def test_encrypt_roundtrip_and_zero_plaintext(self) -> None:
        records = [
            {
                "id": "1001",
                "displayName": "测试账号A",
                "handle": "@pink_user_a",
                "tweetText": "这是一条包含特定话术的测试发言内容",
                "tweetUrl": "https://x.com/pink_user_a/status/1001",
                "capturedAt": "2026-11-22T10:00:00Z",
            }
        ]
        env = encrypt_npdb(records, "pc-win11", "my-secret-pass")
        raw_text = json.dumps(env, ensure_ascii=False)

        self.assertEqual(env["format"], "nopink-db-v1")
        self.assertEqual(env["machineId"], "pc-win11")
        self.assertEqual(env["count"], 1)
        self.assertNotIn("测试账号A", raw_text)
        self.assertNotIn("@pink_user_a", raw_text)
        self.assertNotIn("特定话术", raw_text)

        decrypted = decrypt_npdb_dict(env, "my-secret-pass")
        self.assertEqual(decrypted["machineId"], "pc-win11")
        self.assertEqual(len(decrypted["records"]), 1)
        self.assertEqual(decrypted["records"][0]["handle"], "@pink_user_a")

    def test_wrong_passphrase_fails(self) -> None:
        env = encrypt_npdb([{"id": "1", "tweetText": "abc"}], "pc-1", "correct-pass")
        with self.assertRaises(InvalidTag):
            decrypt_npdb_dict(env, "wrong-pass")

    def test_load_vault_dir_merges_and_deduplicates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            env1 = encrypt_npdb(
                [
                    {"id": "101", "handle": "@a", "tweetText": "text 1"},
                    {"id": "102", "handle": "@b", "tweetText": "text 2"},
                ],
                "pc-office",
                "shared-pass",
            )
            env2 = encrypt_npdb(
                [
                    {"id": "102", "handle": "@b", "tweetText": "text 2"},
                    {"id": "103", "handle": "@c", "tweetText": "text 3"},
                ],
                "pc-home",
                "shared-pass",
            )
            (tmp_dir / "nopink-db-pc-office.npdb").write_text(
                json.dumps(env1), encoding="utf-8"
            )
            (tmp_dir / "nopink-db-pc-home.npdb").write_text(
                json.dumps(env2), encoding="utf-8"
            )

            merged = load_vault_dir(tmp_dir, "shared-pass")
            self.assertEqual(len(merged["machines"]), 2)
            self.assertEqual(len(merged["records"]), 3)
            ids = {r["id"] for r in merged["records"]}
            self.assertEqual(ids, {"101", "102", "103"})


if __name__ == "__main__":
    unittest.main()
