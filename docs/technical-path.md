# Magnitude Lab · 1.0 technical plan

## Decision and audience

A public work sample for a research scientist delivering a statistical disclosure control project. A reviewer should be able to compare a release policy in a minute, investigate a surprising cell, and reproduce the underlying experiments. Scientific and product decisions are documented in English for the hiring team. The [role](https://iuk-ktp.org.uk/job/research-scientist-ktp-associate-2/) and [Cantabular’s existing magnitude work](https://cantabular.com/blog/protecting-magnitude-tables-with-cantabular) informed the scope.

## Implementation sequence

| Step | Design | Acceptance evidence |
|---|---|---|
| Explore | Map the public company catalogue, customer evidence, methods and comparable products. Identify an evaluation question that extends the company’s public example. | Source inventory, dated company brief and market comparison. |
| Generate | Use a Python standard-library pipeline to construct two fully synthetic positive-valued populations. Include different distributions, sparse areas, a dominant contributor and nested fictional geography. Hold the displayed seed apart from validation seeds. | Deterministic generated JSON, inspectable code and accounting tests. |
| Compare | Compare an unchanged reference, primary suppression, contributor-level multiplicative perturbation and the combination. Exercise totals and means on district and region groupings. | Counts, weights, suppression, nesting, nulls and invariance checks. |
| Evaluate | Measure released coverage, weighted absolute percentage error on released cells, flagged cells within 5% of their synthetic reference, and the ordering of neighbouring places. Examine parameter sensitivity over held-out simulations. | Reproducible experiment results and documented denominators. |
| Deliver | Serve one responsive static application under a GitHub Pages project subpath. Support keyboard navigation, deep links, table downloads and an evidence guide. All numeric outputs come from versioned statistical code. | Desktop and phone browser checks, exported rows compared to data, same link works in a fresh browser. |
| Hand over | Publish a versioned data contract, integration example, operator exercise, project governance, training plan and limitations. | Role-to-evidence map, usage walkthrough, reproducible build and release. |

## Architecture

Python generator → synthetic contributor records in memory → policy + aggregation engine → versioned JSON benchmark → browser workbench / CSV exports. The same artifact can serve a downstream analytical client. Static deployment keeps the demo reproducible without accounts, secrets or service fees. Production integration would require protected infrastructure, approved datasets and disclosure review. No production privacy guarantee follows from these public simulations.

Separate the research fixture (which intentionally includes truth) from any public release integration. The data owner must govern query permissions, repeated and overlapping requests, reference values, secret material, and audit controls in its own environment. The comparison concerns statistical outputs. A production AI response channel could consume an approved subset after release policy and permissions are agreed. The applicant subsequently requested live multi-turn AI in 1.0. The [assistant](assistant.md) operates in the public synthetic analyst workspace and explains its published results. The separate release-only adapter demonstrates the narrower downstream interface.

## Release checks

Run the statistical suite, regenerate data and compare it to the committed artifact, validate the release contract, exercise all main views and exports on desktop and phone viewports, then verify the deployed Pages URL and the versioned GitHub release. Real human usability, stakeholder adoption and deployment inside Cantabular remain future evidence.
