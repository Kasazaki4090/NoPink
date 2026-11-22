"""CLI entry point for NoPink local AI keyword analyzer."""

from __future__ import annotations

import argparse
import getpass
import json
import os
from pathlib import Path

from analyzer.extractor import extract_keywords
from analyzer.llm_client import LocalLLMClient
from analyzer.vault import load_vault_dir


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decrypt OneDrive .npdb vaults and extract core keywords using local AI."
    )
    parser.add_argument(
        "--input-dir",
        required=True,
        type=Path,
        help="Directory containing nopink-db-*.npdb files (e.g. OneDrive/NoPink).",
    )
    parser.add_argument(
        "--output",
        default=Path("output/keywords.json"),
        type=Path,
        help="Output JSON file path.",
    )
    parser.add_argument(
        "--provider",
        choices=["ollama", "openai"],
        default="ollama",
        help="Local AI server type.",
    )
    parser.add_argument(
        "--model",
        default="qwen2.5:14b",
        help="Local model name (e.g. qwen2.5:14b).",
    )
    parser.add_argument(
        "--endpoint",
        default=None,
        help="Custom local AI base URL (default: http://localhost:11434 for ollama).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=30,
        help="Tweets per LLM batch.",
    )
    parser.add_argument(
        "--passphrase",
        default=None,
        help="Vault passphrase (or set NOPINK_PASSPHRASE env var).",
    )
    args = parser.parse_args()

    passphrase = args.passphrase or os.environ.get("NOPINK_PASSPHRASE")
    if not passphrase:
        passphrase = getpass.getpass("请输入 .npdb 加密口令: ")

    vault_data = load_vault_dir(args.input_dir, passphrase)
    print(
        f"[NoPink] 已加载 {len(vault_data['machines'])} 台设备，"
        f"去重后共 {len(vault_data['records'])} 条推文样本。"
    )

    client = LocalLLMClient(
        provider=args.provider,
        model=args.model,
        endpoint=args.endpoint,
    )
    result = extract_keywords(
        vault_data["records"],
        llm_client=client,
        batch_size=args.batch_size,
    )
    result["machines"] = vault_data["machines"]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"[NoPink] 分析完成：保留 {len(result['core_keywords'])} 个核心词，"
        f"剔除 {len(result['excluded_common_words'])} 个常见词 -> {args.output}"
    )


if __name__ == "__main__":
    main()
