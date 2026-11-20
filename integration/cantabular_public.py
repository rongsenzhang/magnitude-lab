"""Read a published one-dimensional count table from Cantabular's Irish census demo."""

import argparse
import json
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ENDPOINT = "https://api.ireland-census-preview.cantabular.com/graphql"
SNAPSHOT = Path(__file__).with_name("ireland_1911_provinces.json")
SNAPSHOT_DATE = "2026-11-20"
DATASET = "Ireland-1911-preview"
VERSION = "v1.0.0"
QUERY = """
query PublishedProvinceCounts {
  dataset(name: "Ireland-1911-preview", version: "v1.0.0") {
    table(variables: ["province"]) {
      dimensions { variable { name } categories { code label } }
      values
    }
  }
}
"""


def province_counts(payload):
    """Pair each estimate with its returned category, preserving row-major order."""
    if not isinstance(payload, dict) or payload.get("errors"):
        raise ValueError("The public API returned an error.")
    try:
        table = payload["data"]["dataset"]["table"]
        dimensions = table["dimensions"]
        if not isinstance(dimensions, list) or len(dimensions) != 1:
            raise ValueError("Expected one province dimension.")
        dimension = dimensions[0]
        if dimension["variable"]["name"] != "province":
            raise ValueError("Unexpected dimension in the count table.")
        categories, values = dimension["categories"], table["values"]
        if (not isinstance(categories, list) or not isinstance(values, list)
                or not categories or len(categories) != len(values)):
            raise ValueError("The category and value arrays must correspond.")

        rows = []
        seen = set()
        for category, count in zip(categories, values):
            code, label = category["code"], category["label"]
            if not isinstance(code, str) or not code or code in seen:
                raise ValueError("The response includes a missing or duplicate category code.")
            if not isinstance(label, str) or not label or type(count) is not int or count < 0:
                raise ValueError("Expected a category label and a published non-negative count.")
            seen.add(code)
            rows.append({"code": code, "label": label, "count": count})
        return rows
    except (KeyError, TypeError) as exc:
        raise ValueError("The response does not match the census count contract.") from exc


def fetch_live():
    request = Request(
        ENDPOINT + "?" + urlencode({"query": QUERY}),
        headers={"Accept": "application/json", "User-Agent": "MagnitudeLab/1.0"},
    )
    with urlopen(request, timeout=12) as response:
        payload = response.read(65537)
    if len(payload) > 65536:
        raise ValueError("Response exceeds the expected size of the public table.")
    return json.loads(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Query the advertised public demo once.")
    args = parser.parse_args()
    try:
        data = fetch_live() if args.live else json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        result = {
            "source": "live" if args.live else "snapshot from " + SNAPSHOT_DATE,
            "endpoint": ENDPOINT,
            "dataset": DATASET,
            "version": VERSION,
            "unit": "people",
            "rows": province_counts(data),
        }
    except (OSError, URLError, ValueError) as exc:
        parser.exit(1, f"Census example unavailable: {exc}\n")
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
