# How the experiment works

Magnitude Lab studies one release decision. When a statistical service publishes local totals or means, how much can we change the values and still support comparisons between areas? Two synthetic populations let a reviewer inspect the contributions behind the measurements, rerun the experiments and compare different publication rules.

Cantabular documents magnitude tables, dominance, perturbation and disclosure rules on its public site. Its own implementation also includes cell keys and winsorisation. This independent experiment uses a simpler, explicitly specified contributor adjustment. Its results describe the implementation in this repository. [Cantabular's magnitude-table research](https://cantabular.com/blog/protecting-magnitude-tables-with-cantabular)

## Study design

| Choice | Specification |
|---|---|
| Unit | One fictional household for earnings or one fictional firm for turnover. One positive annual GBP amount per unit. |
| Geography | Twelve fictional districts in a four-column, three-row grid. The top two rows form the northern regions and the last row forms the southern regions. The first two columns form the western regions. Every region contains a connected block of districts. |
| Earnings population | District base counts range from 5 to 50. A draw of −2 to +2 varies each count. Base pay is £18,000 plus a district offset and a uniform integer draw from £0 to £30,999. A 7% chance of an additional £32,000–£93,999 gives the distribution an upper tail. |
| Turnover population | District base counts range from 5 to 32, with the same range of count variation. Each amount starts between £30,000 and £179,999. A multiplier of 12 is applied to 6% of draws and a multiplier of 3 to a further 19%. In two districts the first business is assigned two or three times the other businesses' total to create known dominance cases. |
| Evaluation | Two metrics (sum and unweighted mean), two geographic levels, four publication rules. The live example uses seed 2718. A separate set of 32 seeds, 1001–1032, varies both the population and the adjustment draws. The same synthetic population and draws are reused across all methods within each seed. |
| Data provenance | The generator uses keyed inputs to a public SHA-256 mapping, with separate strings for population and adjustment draws. No personal records, real locations, survey weights or confidential keys enter the experiment. The distributions are designed stress cases and carry no claim to national representativeness. |

The spatial comparison uses the immediate horizontal and vertical neighbours at the **selected level**. Twelve districts supply up to 17 unique edges per seed. Four regions supply up to four edges. District figures are aggregated using the records assigned to each region. Means are weighted by contributor counts when rolling up district results. This experiment tests spatial aggregation and the survival of local contrasts on a fictional grid. A second experiment varies the spatial dependence of the adjustments. Real boundaries and irregular adjacencies would require separate experiments.

## Rules and implementation

1. **Raw reference** releases the unadjusted synthetic sum or mean for each cell. This supplies a common reference point.
2. **Suppression** withholds the cell if it contains fewer than eight contributors or one contributor supplies more than half the original total. A cell with exactly eight contributors and exactly 50% concentration passes both rules. Decisions are recalculated at the selected geographic level.
3. **Perturbation** assigns each contributor a reproducible integer draw in [−10,000, 10,000]. For draw `u` and proportional amplitude `a`, the adjusted amount is `amount × (1 + a × u / 10,000)`, rounded to the nearest penny, half up. The default amplitude is 0.25. Summing the same adjusted contributions across requests gives repeatable sums and consistency across the district-to-region hierarchy. The mean uses the original synthetic count.
4. **Combined** applies the same suppression criterion to original amounts and publishes the adjusted sum or mean for each surviving cell.

The 8, 50%, 5% and ±25% settings below are explicit experimental choices. They have not been calibrated for any organisation or approved for statistical publication.

## Reading the metrics

| Metric | Definition and interpretation |
|---|---|
| Release rate | Released cells divided by all cells. A withheld result is represented as JSON `null` and excluded from numerical error metrics. |
| WAPE | Sum of absolute differences between released and raw values divided by the sum of raw values **over the released cells**. WAPE weights larger raw values more heavily. It can improve when difficult cells disappear, so read it with release rate. |
| Close flagged | Number of flagged cells released within an inclusive ±5% of their original aggregate. The rate divides this count by all flagged cells, including withheld cells. It measures aggregate proximity under this rule. It does not estimate an individual's probability of disclosure. |
| Neighbour coverage | Share of adjacent pairs with different raw values for which both values remain available. This measures which local comparisons a user could still make. |
| Order retention | Among those comparable pairs, share retaining the original sign of the difference. A tie after perturbation counts as a lost distinction. Ties in the original are excluded from the candidate pairs. |

Unavailable ratios use `null` when their denominator is zero. The output contains both counts and rates. Validation pools the underlying numerators and denominators separately across seeds before taking each ratio. Cells, measures, geographic levels and repeated seeds are dependent within an experimental design. The seed-wise minimum, median and maximum WAPE in the JSON describe simulated variation only.

## Results across 32 seeds

These are two of the four dataset–metric combinations, selected for their interpretation as average household earnings and total business turnover. The released JSON includes every metric, method and level. All rates below use the definitions above. Default perturbation amplitude is ±25%.

| District result | Released | WAPE | Close flagged / all flagged | Neighbour orders retained / comparable / eligible |
|---|---:|---:|---:|---:|
| Household mean, raw | 384/384 | 0.00% | 48/48 | 544/544/544 |
| Household mean, suppression | 336/384 | 0.00% | 0/48 | 448/448/544 |
| Household mean, perturbation | 384/384 | 3.03% | 25/48 | 483/544/544 |
| Household mean, combined | 336/384 | 2.67% | 0/48 | 395/448/544 |
| Firm total, raw | 384/384 | 0.00% | 163/163 | 544/544/544 |
| Firm total, suppression | 221/384 | 0.00% | 0/163 | 188/188/544 |
| Firm total, perturbation | 384/384 | 6.91% | 53/163 | 524/544/544 |
| Firm total, combined | 221/384 | 4.09% | 0/163 | 187/188/544 |

For district turnover, adding suppression to perturbation reduced release coverage to 57.6%. The surviving neighbouring pairs mostly retained their order (187 of 188), but only 188 of 544 candidate comparisons remained possible. A user comparing a network of adjacent areas would therefore experience a much larger loss than the order-retention percentage alone suggests.

Aggregation affected the scenarios differently. At region level no earnings cell met the flag criteria across the 32 seeds. In turnover, 32 of 128 region cells were still flagged. Coarser geography improved average release coverage under the combined rule, from 221/384 districts (57.6%) to 96/128 regions (75%). Some high-concentration cases persisted.

### Sensitivity to adjustment strength

The same populations and noise draws were rerun at three amplitudes. These are district-level, perturbation-only results across 32 seeds.

| Amplitude | Earnings mean WAPE | Earnings close flagged | Turnover sum WAPE | Turnover close flagged |
|---|---:|---:|---:|---:|
| ±10% | 1.21% | 45/48 | 2.76% | 133/163 |
| ±25% | 3.03% | 25/48 | 6.91% | 53/163 |
| ±40% | 4.84% | 14/48 | 11.06% | 26/163 |

Increasing amplitude reduced proximity to the originals for flagged cells and increased aggregate error. In the scenario with concentrated firm turnover, ±25% perturbation produced a per-seed district sum WAPE spanning 2.46% to 10.66%, with a median of 7.27%. The release decision requires a stated use case and a risk criterion beyond this proximity measure.

### Spatial perturbation experiment

Can the same marginal perturbation amplitude produce different geographic patterns if contributors in the same area share a source of variation? A paired experiment gives every contributor a 50% chance of using a draw shared by its region. The remainder keep their original independent draw. Each regional draw has the same discrete uniform range as a contributor draw. The dataset, amplitude (±25%), populations, means, sums and suppression-free release rate are held fixed. Because many contributions within a region can move together, their adjustments can cancel less when aggregating them.

| Population and level | WAPE, independent / region-shared | Neighbour orders retained, independent / region-shared |
|---|---:|---:|
| Household mean, district | 3.03% / 6.33% | 483 / 467 of 544 |
| Household mean, region | 1.81% / 6.05% | 114 / 93 of 128 |
| Firm total, district | 6.91% / 8.52% | 524 / 526 of 544 |
| Firm total, region | 5.39% / 7.90% | 120 / 121 of 128 |

The shared component more than tripled WAPE for regional mean earnings in these simulations. For firm totals WAPE also rose, but neighbour ordering changed little. Thus a preserved ordering can coexist with appreciably less accurate magnitudes. This extra experimental method appears in `validation.spatial.results` alongside its assignment probability and amplitude. The four publication rules in the workbench use independent contributor draws for their perturbed outputs.

## Interpretation and scope of evidence

- Every cell's raw aggregate, count and dominance share is visible for synthetic inspection. Such diagnostics belong in a restricted evaluation environment when working with sensitive data.
- Fixed adjustments keep repeated requests consistent. Exact synthetic counts, linked tables and overlapping geographic levels can still reveal relationships. Primary suppression alone leaves complementary cells and totals to consider. The benchmark provides neither a formal privacy guarantee nor a test of protection for all linked queries.
- A flag identifies a shape of a cell that merits review. Small cells with harmless public values may be flagged, while unflagged cells can carry other disclosure risks. Aggregate closeness can be useful to analysts as well as relevant to a risk review.
- The [public census adapter](integration.md) was verified against a live Cantabular endpoint. Operational magnitude policies and deployment in a partner instance await partner validation. A follow-on study would establish the data owner's threat model and release rules, agree protected environments and decision criteria, and validate any adapter against a licensed test deployment.
- Local mean and total comparisons cover two analytical uses. Survey-weighted estimates, medians, signed or zero-valued amounts, multiple contributions per entity and changing populations fall outside this experiment.

## Reproduce and inspect

From the repository root, use Python 3.9 or later with its standard library.

```sh
python3 research/generate.py --check
python3 -m unittest discover -s tests -p "test_science.py" -v
```

To regenerate the full experiment, run `python3 research/generate.py`. To write an independent copy, run `python3 research/generate.py --output lab-copy.json`. The default build writes the browser fixture. Both the source and its committed output are public. [Generator](../research/generate.py) · [Statistical tests](../tests/test_science.py) · [All cell values and pooled results](../web/data/lab.json)
