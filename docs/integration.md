# Two read-only integration examples

Both examples run from the repository root with Python 3.9 or newer and its standard library. One reads a public Cantabular **frequency** table. The other returns treated synthetic **magnitude** estimates from Magnitude Lab. Only the historical example calls an external service, and only when explicitly run with `--live`.

## Read a published Cantabular table

```sh
python3 -m integration.cantabular_public
python3 -m integration.cantabular_public --live
```

The first command uses a snapshot. The second executes one HTTPS GET against the public Irish census preview endpoint advertised by Cantabular. On 20 November 2026, a request for the `province` breakdown of `Ireland-1911-preview`, version `v1.0.0`, returned four aggregate counts. For example, category `03` (Leinster) returned **1,163,123 people**. The service describes this historical dataset as a preview. [Company announcement and public API](https://cantabular.com/blog/republishing-the-historic-1911-irish-census-as-an-interactive-dataset) · [GraphQL explorer](https://api.ireland-census-preview.cantabular.com/graphql)

The published walkthrough illustrates a query with only a dataset name. The live service also required a version argument when tested. The command pins that version and associates each estimate with its category using the order returned by the server. It checks for GraphQL errors even on HTTP 200, validates the single dimension, verifies category and value counts, and preserves category codes as strings. Invalid responses stop the operation. Automation tests use the recorded response, so reproducing the checks is independent of the public endpoint. [Cantabular API walkthrough](https://cantabular.com/blog/using-the-cantabular-api-to-query-structured-data-and-custom-metadata) · [GraphQL response documentation](https://docs.cantabular.com/latest/extended-api-guide/graphql.html) · [recorded response](../integration/ireland_1911_provinces.json)

This is evidence of client-side interoperability with one public historic dataset. Running or validating the project's own magnitude policies inside Cantabular would require a partner instance, its approved release configuration and agreed acceptance tests.

## Serve synthetic estimates to an assistant or another analytical client

```sh
python3 -m integration.release --schema
python3 -m integration.release --request '{"dataset":"earnings","level":"district","metric":"mean","method":"combined"}'
```

The first command emits a JSON tool description with enumerated arguments. A host can call the same function directly. A reviewer can run it without a model, a network connection, an account or a key.

```python
from integration.release import get_release_table

table = get_release_table({
    "dataset": "turnover",
    "level": "region",
    "metric": "sum",
    "method": "combined",
})
```

The two available profiles each fix one measure, one geographic resolution and one policy per population. They illustrate an export contract for fictional populations. Approval of an actual statistical release rests with the data owner. Offering both a sum and its mean could reveal the contributing count. Offering a parent total together with all but one of its parts could reveal a withheld value by subtraction.

| Dataset | Geography | Measure | Method |
| --- | --- | --- | --- |
| `earnings` | `district` | `mean` | `combined` |
| `turnover` | `region` | `sum` | `combined` |

The adapter reads the committed synthetic artifact, pins its version and selects the requested table. Its output includes the dataset, unit, measure, geography, policy and version. Each row carries the `area`, `estimate` and `status` fields. A withheld cell has `estimate: null`. Preserve that state when presenting an answer. A value of zero would give it a different statistical meaning. Unknown arguments, source paths, research-only policies and combinations outside the two profiles are rejected. [Implementation](../integration/release.py) · [integration tests](../tests/test_integration.py)

**Deployment boundary.** The entire GitHub repository contains synthetic research material, including the reference values used to score the methods. The release tool demonstrates field selection for one client. Publishing a different file, exposing a count through related aggregates, or comparing overlapping queries are concerns for a deployment with confidential data. Such a deployment needs a secure server-side data boundary and a data owner's decision about permissible measures, geography, queries and outputs. The live historical API check is independent of these synthetic results.

## Reproduce the checks

```sh
python3 -m unittest discover -s tests -p 'test_integration.py' -v
```

The checks exercise every permitted synthetic query, compare rows to the corresponding policy output, verify withheld values, and check the exact fields exposed. They also exercise category ordering, versioned fixture content and error handling in the historic count adapter.
