import json
import tempfile
import unittest
from pathlib import Path

import yaml

from exporter.generator import export_for_feedsieve


class TestExporter(unittest.TestCase):
    def test_export_for_feedsieve_filters_by_risk(self) -> None:
        keywords_data = {
            "core_keywords": [
                {"term": "核心词A", "score": 98, "false_positive_risk": "low", "reason": "r1"},
                {"term": "中风险词B", "score": 70, "false_positive_risk": "medium", "reason": "r2"},
                {"term": "高风险词C", "score": 40, "false_positive_risk": "high", "reason": "r3"},
            ],
            "excluded_common_words": [{"term": "我们", "reason": "代词"}],
        }

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            paths = export_for_feedsieve(keywords_data, out_dir, max_risk="low")

            txt = paths["txt"].read_text(encoding="utf-8")
            self.assertEqual(txt, "核心词A\n")

            pack = yaml.safe_load(paths["yaml"].read_text(encoding="utf-8"))
            self.assertEqual(pack["id"], "nopink-custom")
            self.assertEqual([k["term"] for k in pack["keywords"]], ["核心词A"])

            report = json.loads(paths["report"].read_text(encoding="utf-8"))
            self.assertEqual(report["keptCount"], 1)
            self.assertEqual(report["droppedByRiskCount"], 2)
            self.assertEqual(report["excludedCommonCount"], 1)


if __name__ == "__main__":
    unittest.main()
