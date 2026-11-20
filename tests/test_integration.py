import copy
import itertools
import json
import unittest

from integration import cantabular_public as census
from integration.release import ALLOWED, LAB_DATA, RELEASE_PROFILES, get_release_table, tool_specification


class PublicCensusIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads(census.SNAPSHOT.read_text(encoding="utf-8"))

    def test_public_snapshot_pairs_categories_and_counts_in_response_order(self):
        rows = census.province_counts(self.snapshot)
        self.assertEqual([row["code"] for row in rows], ["01", "03", "02", "04"])
        self.assertEqual(rows[1], {"code": "03", "label": "Leinster", "count": 1163123})
        self.assertEqual(sum(row["count"] for row in rows), 4382961)

    def test_reject_partial_or_error_responses(self):
        for payload in ({"data": None}, {"data": self.snapshot["data"], "errors": [{"message": "x"}]}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                census.province_counts(payload)

    def test_reject_dimension_mismatch_instead_of_mispairing_values(self):
        for defect in ("length", "dimension", "duplicate", "invalid_count", "multiple"):
            payload = copy.deepcopy(self.snapshot)
            table = payload["data"]["dataset"]["table"]
            dimension = table["dimensions"][0]
            if defect == "length":
                table["values"].pop()
            elif defect == "dimension":
                dimension["variable"]["name"] = "other"
            elif defect == "duplicate":
                dimension["categories"][1]["code"] = dimension["categories"][0]["code"]
            elif defect == "multiple":
                table["dimensions"].append(dimension)
            else:
                table["values"][0] = True
            with self.subTest(defect=defect), self.assertRaises(ValueError):
                census.province_counts(payload)


class SyntheticReleaseIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.request = {"dataset": "earnings", "level": "district", "metric": "mean", "method": "combined"}

    def test_only_exposes_released_projection_for_every_supported_query(self):
        lab = json.loads(LAB_DATA.read_text(encoding="utf-8"))
        seen_withheld = False
        seen_released = False
        for choices in itertools.product(*ALLOWED.values()):
            arguments = dict(zip(ALLOWED, choices))
            with self.subTest(arguments=arguments):
                profile = RELEASE_PROFILES[arguments["dataset"]]
                if any(arguments[field] != value for field, value in profile.items()):
                    with self.assertRaises(ValueError):
                        get_release_table(arguments)
                    continue
                result = get_release_table(arguments)
                dataset = next(d for d in lab["datasets"] if d["id"] == arguments["dataset"])
                view = next(v for v in dataset["views"] if all(
                    v[key] == arguments[key] for key in ("level", "metric", "method")
                ))
                self.assertEqual(set(result), {
                    "version", "synthetic", "dataset", "geography", "measure", "unit", "policy", "rows"
                })
                self.assertTrue(result["synthetic"])
                self.assertEqual(len(result["rows"]), len(view["cells"]))
                for row, cell in zip(result["rows"], view["cells"]):
                    self.assertEqual(set(row), {"area", "estimate", "status"})
                    self.assertEqual(row["area"], cell["label"])
                    self.assertEqual(row["estimate"], cell["value"])
                    if cell["value"] is None:
                        seen_withheld = True
                        self.assertEqual(row["status"], "withheld")
                    else:
                        seen_released = True
                        self.assertEqual(row["status"], "released")
        self.assertTrue(seen_withheld and seen_released)

    def test_reject_raw_other_research_methods_and_unrecognised_arguments(self):
        for field, value in [("method", "raw"), ("method", "perturb"), ("method", "suppress"),
                             ("metric", "count"), ("dataset", "arbitrary"), ("level", "record"),
                             ("fields", ["n", "raw"]), ("dataset", ["earnings"])]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                get_release_table({**self.request, field: value})
        with self.assertRaises(ValueError):
            get_release_table({"dataset": "earnings"})

    def test_tool_schema_matches_validation(self):
        spec = tool_specification()
        self.assertEqual(spec["name"], "get_release_table")
        self.assertFalse(spec["parameters"]["additionalProperties"])
        self.assertEqual(set(spec["parameters"]["required"]), set(ALLOWED))
        for key, values in ALLOWED.items():
            self.assertEqual(spec["parameters"]["properties"][key]["enum"], list(values))
        allowed_profiles = [
            {field: choice["const"] for field, choice in branch["properties"].items()}
            for branch in spec["parameters"]["oneOf"]
        ]
        self.assertEqual(allowed_profiles, [
            {"dataset": "earnings", "level": "district", "metric": "mean"},
            {"dataset": "turnover", "level": "region", "metric": "sum"},
        ])
