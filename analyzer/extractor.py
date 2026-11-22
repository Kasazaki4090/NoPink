"""Two-stage Map-Reduce keyword extraction using local AI."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from analyzer.llm_client import LLMClient

PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def _format_batch(records: list[dict[str, Any]]) -> str:
    lines = []
    for idx, rec in enumerate(records, start=1):
        handle = rec.get("handle") or rec.get("displayName") or "unknown"
        text = (rec.get("tweetText") or "").replace("\n", " ").strip()
        lines.append(f"{idx}. [{handle}] {text}")
    return "\n".join(lines)


def extract_keywords(
    records: list[dict[str, Any]],
    llm_client: LLMClient,
    batch_size: int = 30,
) -> dict[str, Any]:
    """Run Stage 1 (batch extraction) and Stage 2 (consolidation & pruning)."""
    non_empty = [r for r in records if (r.get("tweetText") or "").strip()]
    if not non_empty:
        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "totalRecords": len(records),
            "nonEmptyTweets": 0,
            "core_keywords": [],
            "excluded_common_words": [],
        }

    extract_prompt = _load_prompt("keyword_extract.md")
    consolidate_prompt = _load_prompt("keyword_consolidate.md")

    aggregated: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"term": "", "batchHits": 0, "totalCount": 0, "reasons": [], "risks": []}
    )

    for start in range(0, len(non_empty), batch_size):
        batch = non_empty[start : start + batch_size]
        user_msg = f"以下是本批次 {len(batch)} 条推文样本：\n\n{_format_batch(batch)}"
        res = llm_client.chat_json(extract_prompt, user_msg)
        for item in res.get("candidates", []):
            term = str(item.get("term", "")).strip()
            if len(term) < 2:
                continue
            entry = aggregated[term]
            entry["term"] = term
            entry["batchHits"] += 1
            entry["totalCount"] += int(item.get("count", 1) or 1)
            if item.get("reason"):
                entry["reasons"].append(str(item["reason"]))
            if item.get("false_positive_risk"):
                entry["risks"].append(str(item["false_positive_risk"]))

    if not aggregated:
        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "totalRecords": len(records),
            "nonEmptyTweets": len(non_empty),
            "core_keywords": [],
            "excluded_common_words": [],
        }

    candidate_list = sorted(
        aggregated.values(),
        key=lambda x: (x["batchHits"], x["totalCount"]),
        reverse=True,
    )
    consolidate_input = json.dumps(candidate_list, ensure_ascii=False, indent=2)
    final_res = llm_client.chat_json(
        consolidate_prompt,
        f"以下是初步提取的候选词汇总（共 {len(candidate_list)} 个）：\n\n{consolidate_input}",
    )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalRecords": len(records),
        "nonEmptyTweets": len(non_empty),
        "core_keywords": final_res.get("core_keywords", []),
        "excluded_common_words": final_res.get("excluded_common_words", []),
    }
