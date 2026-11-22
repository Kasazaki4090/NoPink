import unittest

from analyzer.extractor import extract_keywords
from analyzer.llm_client import extract_json_block


class MockLLMClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def chat_json(self, system_prompt: str, user_prompt: str) -> dict:
        self.calls.append((system_prompt, user_prompt))
        if "本批次" in user_prompt:
            return {
                "candidates": [
                    {
                        "term": "遥遥领先",
                        "count": 2,
                        "reason": "高频口号",
                        "false_positive_risk": "low",
                    },
                    {
                        "term": "因为",
                        "count": 5,
                        "reason": "连接词",
                        "false_positive_risk": "high",
                    },
                ]
            }
        return {
            "core_keywords": [
                {
                    "term": "遥遥领先",
                    "score": 95,
                    "false_positive_risk": "low",
                    "reason": "高频特征话术",
                }
            ],
            "excluded_common_words": [
                {"term": "因为", "reason": "日常连接词"}
            ],
        }


class TestExtractor(unittest.TestCase):
    def test_extract_json_block_handles_think_and_fences(self) -> None:
        raw = '<think>reasoning...</think>\n```json\n{"ok": true, "items": [1, 2]}\n```'
        parsed = extract_json_block(raw)
        self.assertTrue(parsed["ok"])
        self.assertEqual(parsed["items"], [1, 2])

    def test_two_stage_extract_keywords(self) -> None:
        records = [
            {"id": "1", "handle": "@u1", "tweetText": "这波遥遥领先"},
            {"id": "2", "handle": "@u2", "tweetText": "因为所以遥遥领先"},
        ]
        client = MockLLMClient()
        res = extract_keywords(records, client, batch_size=2)
        self.assertEqual(len(client.calls), 2)
        self.assertEqual(res["nonEmptyTweets"], 2)
        self.assertEqual(len(res["core_keywords"]), 1)
        self.assertEqual(res["core_keywords"][0]["term"], "遥遥领先")
        self.assertEqual(res["excluded_common_words"][0]["term"], "因为")


if __name__ == "__main__":
    unittest.main()
