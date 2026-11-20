"""Build the public field-guide examples from the same tested adapters as the CLI."""

import argparse
import json
from pathlib import Path

from integration.cantabular_public import SNAPSHOT, SNAPSHOT_DATE, province_counts
from integration.release import RELEASE_PROFILES, get_release_table

OUTPUT = Path(__file__).resolve().parents[1] / "web" / "data" / "interfaces.json"


def build():
    historical_counts = province_counts(json.loads(SNAPSHOT.read_text(encoding="utf-8")))
    examples = {
        dataset: get_release_table(dict(dataset=dataset, method="combined", **profile))
        for dataset, profile in RELEASE_PROFILES.items()
    }
    return {"snapshotDate": SNAPSHOT_DATE, "counts": historical_counts, "releaseExamples": examples}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = json.dumps(build(), indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != content:
            parser.exit(1, "Regenerate the field-guide examples.\n")
    else:
        OUTPUT.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
