"""Independent invariants for the synthetic statistical experiment and its browser contract."""

import itertools
import json
import math
import unittest

from research import generate as lab


def one_cell(x, raw, value, flagged=True):
    return {"raw": raw, "value": value, "flag": flagged, "x": x, "y": 0}


class MethodsTests(unittest.TestCase):
    def test_reproducible_population_and_independent_datasets(self):
        for dataset in lab.DATASETS:
            population = lab.generate_records(dataset, 15)
            self.assertEqual(population, lab.generate_records(dataset, 15))
            self.assertNotEqual(population, lab.generate_records(dataset, 16))
            self.assertTrue(all(r.pounds > 0 for r in population))
            self.assertTrue(all(-10000 <= r.draw <= 10000 for r in population))
        self.assertNotEqual(lab.generate_records("earnings", 15), lab.generate_records("turnover", 15))

    def test_spatial_method_preserves_inputs_and_introduces_shared_values(self):
        population = lab.generate_records("earnings", 71)
        shared = lab.region_shared_records("earnings", 71, population)
        self.assertEqual([(r.district, r.pounds) for r in population],
                         [(r.district, r.pounds) for r in shared])
        for region in lab.REGIONS:
            changes = {after.draw for before, after in zip(population, shared)
                       if before.draw != after.draw and lab.describe_area(before.district, "region")[2] == region}
            self.assertEqual(len(changes), 1)
        self.assertEqual(shared, lab.region_shared_records("earnings", 71, population))

    def test_threshold_boundaries_and_adjustment(self):
        samples = ([7, 1, 1, 1, 1, 1, 1, 1], [8, 1, 1, 1, 1, 1, 1, 1], [1] * 7)
        for pounds, expected_flag in zip(samples, (False, True, True)):
            group = lab.grouped([lab.Record(0, x, 10000) for x in pounds], "district", 25)[0]
            self.assertEqual(group["flag"], expected_flag)
            for method in lab.METHODS:
                cell = lab.make_cells([group], "sum", method)[0]
                expected = sum(pounds) * (1.25 if method in ("perturb", "combined") else 1)
                if expected_flag and method in ("suppress", "combined"):
                    self.assertIsNone(cell["value"])
                else:
                    self.assertEqual(cell["value"], expected)
            self.assertEqual(lab.make_cells([group], "mean", "raw")[0]["value"], sum(pounds) / len(pounds))
        self.assertEqual(lab.adjusted_pence(lab.Record(0, 5, -10000), 25), 375)
        self.assertEqual(lab.adjusted_pence(lab.Record(0, 5, 10000), 25), 625)
        self.assertEqual(lab.adjusted_pence(lab.Record(0, 1, 200), 25), 101)

    def test_suppression_is_missing_and_error_is_weighted_over_releases(self):
        items = [one_cell(0, 100, 95), one_cell(1, 900, 990), one_cell(2, 2000, None)]
        seen = lab.summary(lab.counts(items))
        self.assertEqual(seen["wape"], 95 / 1000)
        self.assertEqual(seen["releaseRate"], 2 / 3)
        self.assertEqual(seen["closeFlagged"], 1)
        self.assertEqual(seen["closeFlaggedRate"], 1 / 3)
        self.assertEqual(seen["neighbourCoverage"], 1 / 2)

    def test_missing_denominators_ties_and_direction_reversal(self):
        for cells in ([], [one_cell(0, 7, None, False)]):
            seen = lab.summary(lab.counts(cells))
            for k in ("wape", "closeFlaggedRate", "orderRetention", "neighbourCoverage"):
                self.assertIsNone(seen[k])
        items = [one_cell(0, 100, 105), one_cell(1, 103, 104), one_cell(2, 103, 104)]
        seen = lab.summary(lab.counts(items))
        self.assertEqual((seen["neighbourPairs"], seen["preservedPairs"]), (1, 0))
        items = [one_cell(0, 100, 105), one_cell(1, 103, 105)]
        self.assertEqual(lab.summary(lab.counts(items))["orderRetention"], 0)

    def test_consistent_sums_weighted_means_and_geography(self):
        for dataset in lab.DATASETS:
            rows = lab.generate_records(dataset, 71)
            for amplitude in lab.AMPLITUDES:
                districts = lab.grouped(rows, "district", amplitude)
                regions = lab.grouped(rows, "region", amplitude)
                for region in regions:
                    parts = [d for d in districts if d["region"] == region["label"]]
                    self.assertEqual(region["n"], sum(p["n"] for p in parts))
                    for method in ("raw", "perturb"):
                        means = lab.make_cells(parts, "mean", method)
                        totals = lab.make_cells(parts, "sum", method)
                        total = lab.make_cells([region], "sum", method)[0]["value"]
                        self.assertAlmostEqual(total, math.fsum(c["value"] for c in totals), places=6)
                        mean = lab.make_cells([region], "mean", method)[0]["value"]
                        weighted = math.fsum(c["value"] * c["n"] for c in means) / region["n"]
                        self.assertAlmostEqual(mean, weighted, places=6)
                    positions = {(cell["x"], cell["y"]) for cell in parts}
                    seen = set()
                    frontier = [next(iter(positions))]
                    while frontier:
                        x, y = frontier.pop()
                        if (x, y) not in seen:
                            seen.add((x, y))
                            frontier += [pos for pos in ((x+1,y),(x-1,y),(x,y+1),(x,y-1))
                                         if pos in positions and pos not in seen]
                    self.assertEqual(seen, positions)


class OutputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(lab.OUTPUT.read_text(encoding="utf-8"))

    def test_built_file_matches_generator(self):
        self.assertEqual(lab.serialize(lab.build()), lab.OUTPUT.read_text(encoding="utf-8"))

    def test_browser_contract(self):
        j = self.data
        self.assertEqual(j["version"], "1.0.0")
        self.assertEqual({d["id"] for d in j["datasets"]}, {"earnings", "turnover"})
        for dataset in j["datasets"]:
            self.assertEqual(dataset["unit"], "GBP")
            expected = set(itertools.product(lab.LEVELS, lab.METRICS, lab.METHODS))
            observed = [(v["level"], v["metric"], v["method"]) for v in dataset["views"]]
            self.assertCountEqual(observed, expected)
            for view in dataset["views"]:
                cells = view["cells"]
                self.assertEqual(len(cells), 12 if view["level"] == "district" else 4)
                self.assertEqual(len(cells), len({(c["x"], c["y"]) for c in cells}))
                self.assertEqual(dataset["records"], sum(c["n"] for c in cells))
                for c in cells:
                    self.assertTrue(0 < c["dominance"] <= 1 and c["raw"] > 0)
                    withheld = view["method"] in ("suppress", "combined") and c["flag"]
                    self.assertEqual(c["value"] is None, withheld)
                self.assertEqual(view["summary"], lab.summary(lab.counts(cells)))

    def test_pooled_counts_and_sensitivity(self):
        validation = self.data["validation"]
        self.assertNotIn(self.data["displaySeed"], validation["seeds"])
        self.assertEqual(len(set(validation["seeds"])), 32)
        self.assertEqual(len(validation["results"]), 32)
        self.assertEqual(len(validation["sensitivity"]), 48)
        self.assertEqual(len(validation["spatial"]["results"]), 8)
        self.assertTrue(all(row["cells"] == row["released"] for row in validation["spatial"]["results"]))
        keys = ("dataset", "level", "metric", "method")
        results = {tuple(row[k] for k in keys): row for row in validation["results"]}
        for row in validation["results"]:
            self.assertEqual(row["runs"], 32)
            self.assertEqual(row["cells"], (12 if row["level"] == "district" else 4) * row["runs"])
            self.assertEqual(row["releaseRate"], row["released"] / row["cells"])
        for row in validation["sensitivity"]:
            if row["amplitude"] == 0.25:
                self.assertEqual({k: v for k, v in row.items() if k != "amplitude"},
                                 results[tuple(row[k] for k in keys)])
        reference = results["turnover", "district", "sum", "perturb"]
        self.assertEqual((reference["released"], reference["flagged"], reference["closeFlagged"]),
                         (384, 163, 53))
        self.assertAlmostEqual(reference["wape"], .06911, places=5)


if __name__ == "__main__":
    unittest.main()
