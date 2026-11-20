"""Return a released synthetic table for a downstream client or tool-calling assistant."""

import argparse
import json
import math
from pathlib import Path


LAB_DATA = Path(__file__).resolve().parents[1] / "web" / "data" / "lab.json"
DATA_VERSION = "1.0.0"
RELEASE_PROFILES = {
    "earnings": {"level": "district", "metric": "mean"},
    "turnover": {"level": "region", "metric": "sum"},
}
ALLOWED = {
    "dataset": tuple(RELEASE_PROFILES),
    "level": ("district", "region"),
    "metric": ("mean", "sum"),
    "method": ("combined",),
}


def tool_specification():
    permitted_profiles = []
    for dataset, profile in RELEASE_PROFILES.items():
        selections = {"dataset": dataset, **profile}
        properties = {field: {"const": value} for field, value in selections.items()}
        permitted_profiles.append({"properties": properties})
    return {
        "name": "get_release_table",
        "description": (
            "Retrieve the combined-policy synthetic estimates for one geography and measure. "
            "Read a null estimate as withheld. All places and amounts are fictional."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                field: {"type": "string", "enum": list(values)}
                for field, values in ALLOWED.items()
            },
            "required": list(ALLOWED),
            "additionalProperties": False,
            "oneOf": permitted_profiles,
        },
    }


def get_release_table(arguments):
    """Validate a tool call and project only released fields from the pinned local artifact."""
    if not isinstance(arguments, dict) or set(arguments) != set(ALLOWED):
        raise ValueError("Supply exactly dataset, level, metric and method.")
    for field, allowed_values in ALLOWED.items():
        if arguments[field] not in allowed_values:
            raise ValueError(f"Unsupported {field}.")
    profile = RELEASE_PROFILES[arguments["dataset"]]
    if any(arguments[field] != value for field, value in profile.items()):
        raise ValueError("This combination is outside the two public release profiles.")

    lab = json.loads(LAB_DATA.read_text(encoding="utf-8"))
    if lab["version"] != DATA_VERSION:
        raise ValueError("Unsupported lab artifact version.")
    dataset = next((item for item in lab["datasets"] if item["id"] == arguments["dataset"]), None)
    if dataset is None or dataset["unit"] != "GBP":
        raise ValueError("The selected synthetic dataset is unavailable.")

    for view in dataset["views"]:
        if all(view[field] == arguments[field] for field in ("level", "metric", "method")):
            break
    else:
        raise ValueError("The selected release is unavailable.")

    rows = []
    for cell in view["cells"]:
        value = cell["value"]
        if value is not None and (type(value) not in (float, int) or not math.isfinite(value)):
            raise ValueError("The release contains an invalid estimate.")
        rows.append({
            "area": cell["label"],
            "estimate": value,
            "status": "withheld" if value is None else "released",
        })

    return {
        "version": DATA_VERSION,
        "synthetic": True,
        "dataset": dataset["name"],
        "geography": arguments["level"],
        "measure": arguments["metric"],
        "unit": dataset["unit"],
        "policy": "combined",
        "rows": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--schema", action="store_true", help="Print the tool definition.")
    group.add_argument("--request", metavar="JSON", help="Make a structured release request.")
    args = parser.parse_args()
    try:
        result = tool_specification() if args.schema else get_release_table(json.loads(args.request))
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(1, f"Release request declined: {exc}\n")
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
