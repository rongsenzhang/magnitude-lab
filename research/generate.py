"""Build reproducible, fictional magnitude-table experiments with the Python standard library."""

import argparse
import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from math import fsum
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "web" / "data" / "lab.json"
DISPLAY_SEED = 2718
VALIDATION_SEEDS = tuple(range(1001, 1033))
AMPLITUDES = (10, 25, 40)
DEFAULT_AMPLITUDE = 25
METHODS = ("raw", "suppress", "perturb", "combined")
METRICS = ("mean", "sum")
LEVELS = ("district", "region")
MIN_COUNT = 8
CLOSE_PERCENT = 5
NAMES = (
    "Mossbank", "Alder Vale", "Rowan Point", "East Fen",
    "Birch Quay", "Willow End", "Fern Hill", "Reed Vale",
    "South Beck", "Oak Strand", "Hazel Port", "Ash Field",
)
REGIONS = ("North West", "North East", "South West", "South East")
SIZES = {
    "earnings": (5, 36, 23, 19, 25, 50, 30, 17, 7, 22, 34, 14),
    "turnover": (6, 16, 11, 23, 8, 32, 21, 11, 5, 15, 29, 9),
}
DATASETS = {
    "earnings": (
        "Household earnings",
        "Synthetic annual household earnings with local pay differences and two sparsely populated districts.",
    ),
    "turnover": (
        "Business turnover",
        "Synthetic annual firm turnover with a long upper tail and two districts containing a dominant business.",
    ),
}


@dataclass(frozen=True)
class Record:
    district: int
    pounds: int
    draw: int  # [-10000, 10000], shared across every view of this contributor


def draw_int(upper_bound, *keys):
    """A stable public pseudo-random integer from a domain-separated namespace."""
    payload = "|".join(str(key) for key in keys).encode("ascii")
    digest = hashlib.sha256(payload).digest()
    return (int.from_bytes(digest[:8], "big") * upper_bound) >> 64


def describe_area(district, level):
    x, y = district % 4, district // 4
    rx, ry = x // 2, int(y == 2)
    region_index = 2 * ry + rx
    region = REGIONS[region_index]
    if level == "district":
        return f"D{district + 1:02}", NAMES[district], region, x, y
    return f"R{region_index + 1:02}", region, region, rx, ry


def generate_records(dataset, seed):
    records = []
    for district, base_size in enumerate(SIZES[dataset]):
        key = ("population", dataset, seed, district)
        size = base_size + draw_int(5, *key, "size") - 2
        values = []
        for person in range(size):
            if dataset == "earnings":
                location = (district % 4) * 1800 + (district // 4) * 1300
                earnings = 18000 + location + draw_int(31000, *key, person, "pay")
                if draw_int(100, *key, person, "bonus") < 7:
                    earnings += 32000 + draw_int(62000, *key, person, "bonus-size")
                values.append(earnings)
            else:
                turnover = 30000 + draw_int(150000, *key, person, "base")
                band = draw_int(100, *key, person, "band")
                multiplier = 12 if band < 6 else 3 if band < 25 else 1
                values.append(turnover * multiplier)
        if dataset == "turnover" and district in (2, 10):
            # Create known dominance stress cases with a 2/3 or 3/4 largest share.
            values[0] = (2 if district == 2 else 3) * sum(values[1:])
        for person, value in enumerate(values):
            noise = draw_int(20001, "adjustment", dataset, seed, district, person) - 10000
            records.append(Record(district, value, noise))
    return records


def region_shared_records(dataset, seed, records):
    """Assign a shared region draw to half the contributors in expectation."""
    regional_draws = {}
    for region in REGIONS:
        regional_draws[region] = draw_int(20001, "spatial-adjustment", dataset, seed, region) - 10000
    members = []
    for index, record in enumerate(records):
        region = describe_area(record.district, "region")[2]
        shares = draw_int(2, "spatial-assignment", dataset, seed, index) == 0
        draw = regional_draws[region] if shares else record.draw
        members.append(Record(record.district, record.pounds, draw))
    return members


def adjusted_pence(record, amplitude):
    """Nearest penny, half up, on positive GBP values, with bounded relative noise."""
    scaled = record.pounds * 100 * (1_000_000 + amplitude * record.draw)
    return (scaled + 500_000) // 1_000_000


def grouped(records, level, amplitude):
    groups = defaultdict(list)
    for record in records:
        groups[describe_area(record.district, level)].append(record)
    result = []
    for (area_id, label, region, x, y), members in sorted(groups.items()):
        total = sum(row.pounds for row in members)
        largest = max(row.pounds for row in members)
        result.append({
            "id": area_id, "label": label, "region": region, "x": x, "y": y,
            "n": len(members), "dominance": largest / total,
            "flag": len(members) < MIN_COUNT or 2 * largest > total,
            "rawSum": total,
            "adjustedSum": sum(adjusted_pence(row, amplitude) for row in members) / 100,
        })
    return result


def make_cells(groups, metric, method):
    cells = []
    for group in groups:
        divisor = group["n"] if metric == "mean" else 1
        raw = group["rawSum"] / divisor
        adjusted = group["adjustedSum"] / divisor
        published = adjusted if method in ("perturb", "combined") else raw
        if method in ("suppress", "combined") and group["flag"]:
            published = None
        cells.append({
            k: group[k] for k in ("id", "label", "region", "x", "y", "n", "dominance", "flag")
        })
        cells[-1].update(raw=raw, value=published)
    return cells


def ratio(numerator, denominator):
    return numerator / denominator if denominator else None


def counts(cells):
    released = [cell for cell in cells if cell["value"] is not None]
    # Relative threshold uses a tiny tolerance for binary division of mean values.
    close = sum(cell["flag"] and
                abs(cell["value"] - cell["raw"]) <= cell["raw"] * CLOSE_PERCENT / 100 + 1e-9
                for cell in released)
    by_position = {(c["x"], c["y"]): c for c in cells}
    neighbours = comparable = preserved = 0
    for (x, y), left in by_position.items():
        for position in ((x + 1, y), (x, y + 1)):
            right = by_position.get(position)
            if right is None or left["raw"] == right["raw"]:
                continue
            neighbours += 1
            if left["value"] is None or right["value"] is None:
                continue
            comparable += 1
            if (left["raw"] - right["raw"]) * (left["value"] - right["value"]) > 0:
                preserved += 1
    return {
        "total": len(cells), "released": len(released), "flagged": sum(c["flag"] for c in cells),
        "closeFlagged": close, "neighbourPairs": neighbours, "comparablePairs": comparable,
        "preservedPairs": preserved,
        "absoluteError": fsum(abs(c["value"] - c["raw"]) for c in released),
        "referenceMass": fsum(c["raw"] for c in released),
    }


def summary(values):
    return {
        **{k: v for k, v in values.items() if k not in ("absoluteError", "referenceMass")},
        "wape": ratio(values["absoluteError"], values["referenceMass"]),
        "releaseRate": ratio(values["released"], values["total"]),
        "closeFlaggedRate": ratio(values["closeFlagged"], values["flagged"]),
        "neighbourCoverage": ratio(values["comparablePairs"], values["neighbourPairs"]),
        "orderRetention": ratio(values["preservedPairs"], values["comparablePairs"]),
    }


def make_views(records, amplitude, methods=METHODS):
    for level in LEVELS:
        groups = grouped(records, level, amplitude)
        for metric in METRICS:
            for method in methods:
                cells = make_cells(groups, metric, method)
                yield {
                    "level": level, "metric": metric, "method": method, "cells": cells,
                }


def pooled_rows(samples, include_amplitude=False):
    pooled = []
    for (dataset, level, metric, method, amplitude), scenarios in sorted(samples.items()):
        totals = {}
        for key in scenarios[0]:
            reducer = fsum if key in ("absoluteError", "referenceMass") else sum
            totals[key] = reducer(row[key] for row in scenarios)
        per_seed_wape = [summary(row)["wape"] for row in scenarios if row["referenceMass"]]
        row = {"dataset": dataset, "level": level, "metric": metric, "method": method,
               "runs": len(scenarios), **summary(totals)}
        row["cells"] = row.pop("total")
        row["runWapeRange"] = ([min(per_seed_wape), median(per_seed_wape), max(per_seed_wape)]
                               if per_seed_wape else None)
        if include_amplitude:
            row["amplitude"] = amplitude / 100
        pooled.append(row)
    return pooled


def validate():
    main = defaultdict(list)
    sweep = defaultdict(list)
    spatial = defaultdict(list)
    for dataset in DATASETS:
        for seed in VALIDATION_SEEDS:
            records = generate_records(dataset, seed)
            shared = region_shared_records(dataset, seed, records)
            for view in make_views(shared, DEFAULT_AMPLITUDE, ("perturb",)):
                index = (dataset, view["level"], view["metric"], "regionShared", DEFAULT_AMPLITUDE)
                spatial[index].append(counts(view["cells"]))
            for amplitude in AMPLITUDES:
                methods = METHODS if amplitude == DEFAULT_AMPLITUDE else ("perturb", "combined")
                for view in make_views(records, amplitude, methods):
                    index = (dataset, view["level"], view["metric"], view["method"], amplitude)
                    row = counts(view["cells"])
                    if amplitude == DEFAULT_AMPLITUDE:
                        main[index].append(row)
                    if view["method"] in ("perturb", "combined"):
                        sweep[index].append(row)
    return {
        "seeds": list(VALIDATION_SEEDS), "geography": "district and region",
        "note": "Pooled ratios across 32 independently seeded synthetic populations per scenario. "
                "Close flagged counts are an aggregate proximity diagnostic, never a disclosure probability.",
        "results": pooled_rows(main), "sensitivity": pooled_rows(sweep, include_amplitude=True),
        "spatial": {
            "shareProbability": 0.5, "amplitude": DEFAULT_AMPLITUDE / 100,
            "description": "Paired spatial experiment. Half the contributors in expectation receive "
                           "a perturbation draw shared within their synthetic region.",
            "results": pooled_rows(spatial),
        },
    }


def build():
    datasets = []
    for dataset, (name, description) in DATASETS.items():
        records = generate_records(dataset, DISPLAY_SEED)
        views = list(make_views(records, DEFAULT_AMPLITUDE))
        for view in views:
            view["summary"] = summary(counts(view["cells"]))
        datasets.append({"id": dataset, "name": name, "unit": "GBP", "description": description,
                         "records": len(records), "views": views})
    return {
        "version": "1.0.0", "displaySeed": DISPLAY_SEED, "datasets": datasets,
        "rules": {"minCount": MIN_COUNT, "maxDominance": 0.5, "closeThreshold": CLOSE_PERCENT / 100,
                  "defaultAmplitude": DEFAULT_AMPLITUDE / 100},
        "validation": validate(),
    }


def serialize(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true", help="Verify the committed data without writing.")
    args = parser.parse_args()
    content = serialize(build())
    if args.check:
        if not args.output.is_file() or args.output.read_text(encoding="utf-8") != content:
            raise SystemExit("Experiment output differs. Run python3 research/generate.py.")
        print("Committed experiment matches the reproducible build.")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content, encoding="utf-8")
    print(f"Wrote {args.output.name}")


if __name__ == "__main__":
    main()
