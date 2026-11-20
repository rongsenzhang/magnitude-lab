# Project delivery and operator handover

Magnitude Lab 1.0 is an independent work sample for a 24-month knowledge transfer project. A statistical reviewer can reproduce the figures below. A partner could use the training exercise and proposed pilot to decide whether the approach belongs in its own release workflow. The milestones, owners and spending examples describe a possible collaboration. [Queen’s candidate information, pp. 1–2](https://hr.apps.qub.ac.uk/jobs/job_desc/26_113757.pdf?ts=20261111154523) · [KTP project description](https://iuk-ktp.org.uk/job/research-scientist-ktp-associate-2/)

## Evidence for the six project stages

| KTP stage | Evidence available in 1.0 | Next decision with the partners |
| --- | --- | --- |
| 1. Review the field | Company product, customer and API review, competitor comparison and published alternatives. [Company review](company-review.md) · [market comparison](market.md) | Company and academic supervisors agree priority uses and establish the current baseline. |
| 2. Assess risk and utility | Defined flag, coverage, released-cell error and geographic ordering metrics, with denominators. [Definitions](methods.md) | The data owner defines disclosure scenarios, acceptable risks and statistical quality requirements. |
| 3. Develop perturbation methods, including spatial work | Contributor perturbation, primary suppression and combined treatment. A separate experiment compares independent and region-shared adjustments. [Implementation](../research/generate.py) | The statistical team selects credible alternatives and real geographic hierarchies for testing. |
| 4. Validate across data and uses | Household means and business totals across two synthetic distributions, two geographic levels and 32 held-out seeds per scenario. [Results](../web/data/lab.json) · [scientific checks](../tests/test_science.py) | Replicate inside an approved environment with a partner dataset and its analytical tasks. |
| 5. Implement and integrate | Responsive research workbench, read-only adapter tested against a public Cantabular historic count table, and two release-only synthetic profiles for downstream clients. [Integration evidence](integration.md) · [grounded assistant](assistant.md) | The engineering lead tests the magnitude method against a licensed test instance and its release configuration. |
| 6. Evaluate benefits and transfer | Measured coverage and utility below, reproducible tests and an operator exercise. | Observe decision time, independent use and follow-up support in a partner pilot. Agree an owner for maintenance. |

## Steering brief from the benchmark

**Decision for a statistical lead.** Would a regional turnover table remain useful if a concentrated region were withheld and the remaining estimates perturbed?

In the displayed population, the combined policy releases three of four regions. South East contains 37 businesses, but one contributes **70.63%** of its turnover. The example threshold is 50%. The three released estimates have **2.54%** weighted absolute percentage error (WAPE). An operator should mark South East as *withheld* in downstream reports. Treating its missing estimate as zero would make the region appear to have no economic activity. [Policy and metric definitions](methods.md) · [display seed 2718 and validation results](../web/data/lab.json)

Across the held-out runs the same rule releases **96 of 128** regional estimates and withholds **32**. Released-cell WAPE is **2.77%**. Of 128 neighbouring-region comparisons, 64 have two released values and 62 of those retain their original ordering. Half of the geographical comparisons are therefore unavailable to a user trying to compare every area. The observed coverage and errors support taking this example to a methods review. The business case still needs a target use, a custodian's release decision and evidence from real operators. [Benchmark results](../web/data/lab.json)

## Operator exercise and follow-up

1. In **Workbench**, select **Business turnover → Region → Annual total → Combined**. Ask a colleague which area should appear blank in a publication and why the number of businesses alone would lead to the wrong conclusion.
2. **Check the answer.** South East is withheld because one contributor dominates the total. Three other regions have estimates. The region contains more than the minimum of eight contributors. A defensible decision note records the dominant share, the release rule and the effect on comparisons.
3. In **Validation**, keep that selection. Ask how to explain 62 preserved orders to a reader. A complete answer gives both denominators, **62/64 comparable pairs** and **64/128 pairs available**. Ask the colleague to state separately the cost of withholding and the accuracy of estimates they can still use.
4. **Independent check.** Give the colleague a new case, household earnings by district, mean, combined policy. On the displayed seed they should report 10 of 12 published. Mossbank and South Beck each have five contributors and are withheld. Have the colleague repeat the exercise after a week. Record the incorrect step, update the guidance and repeat that step with a fresh user. [Source values and flags](../web/data/lab.json)

## First six months of a proposed partner pilot

Owners below are roles for discussion. The associate would maintain a rolling three-to-six-month plan and review dates with both supervisors as dependencies change.

| Window | Lead and collaborators | Deliverable and decision gate |
| --- | --- | --- |
| Weeks 1–4 | Associate, company product owner, academic supervisor | Agree the target publication, two operator tasks, baseline workflow, permitted data and decision owners. The custodian must approve data access before real records enter testing. |
| Weeks 5–8 | Associate and disclosure specialist | Agree comparison methods, risk conditions, metrics, linked-table scenarios and acceptance thresholds. Capture the decision before running the pilot. |
| Weeks 9–12 | Associate and academic supervisor | Repeat candidate methods on authorised data inside the partner environment. Examine sparse and dominant areas. The statistical lead decides whether to revise methods or proceed. |
| Months 4–5 | Company engineering lead, associate, data owner | Exercise the release contract in a test instance, including withheld cells and reference-data separation. An operator runs the training exercise. Review defects and the ability to reproduce a release. |
| Month 6 | Steering group, product owner and associate | Review the benefit measures, spend, risks and unresolved statistical questions. Decide whether to extend, revise or stop the pilot. Record the rationale and assign maintenance or further research. |

### Resources and development

An illustrative first-six-month request could reserve **£450** for specialist training, **£600** for travel, **£250** for facilitated operator materials and **£200** contingency, totalling **£1,500**. The associate would obtain quotes, confirm the eligible budget for each item, seek committee approval and track commitments against receipts. The advertised **£4,000** personal development allocation covers the whole 24-month role. The sample figures are planning assumptions. The repository provides no invoices or timesheets to establish actual contractor charges, partner labour or total delivery cost. [Candidate information](https://hr.apps.qub.ac.uk/jobs/job_desc/26_113757.pdf?ts=20261111154523)

The personal development plan would reserve time for the two required one-week management courses in England. Agree dates, travel and costs with supervisors before booking. Apply the first module to the project schedule and the second to an evidence-led steering presentation. A disclosure specialist could review one methods comparison and an engineer could review one release contract as observable development outcomes.

## Benefits and risk register for a pilot

| Question or risk | What to record | Proposed owner and response |
| --- | --- | --- |
| Does a reviewer reach a sound decision faster? | Give operators matched publication tasks using their current workflow and the pilot. Alternate task order. Record minutes from the brief to a written release/refer decision, correctness against a pre-agreed rubric, and repeat attempts. Report paired median differences, range and participant count. | Product owner and training lead. Treat time saved as a benefit only alongside acceptable decision quality. |
| Does additional coverage serve the intended use? | For each method and geography, report released/eligible cells, withheld/eligible cells, comparable/eligible neighbour pairs and error on released values. Break out sparse and dominant groups. | Statistical lead. Set acceptable coverage and error with the data owner. Record examples where an apparent gain changes the user's conclusion. |
| Can people use the workflow after training? | Count eligible operators invited, trained, completing an unaided task, and returning at four weeks. Log support minutes and reasons for abandonment. | Training lead. Revise the troublesome step, repeat the observation and retain the original denominator. |
| Could related releases expose a withheld figure? | Review which totals, means and geographical levels can be combined across time or tools. Record release combinations and the custodian's decisions privately. | Disclosure lead. Keep research truth restricted and approve the full set of release profiles in the operating environment. |
| Will the integration and project remain maintainable? | Track contract errors, requests that should be declined, time to reproduce results, training commitments and planned versus actual spend. | Engineering lead and associate. Re-run the acceptance checks on version changes and escalate schedule or cost variances to the steering group. |

## Coverage of the ten associate duties

| Duty in the candidate information | Portfolio evidence or proposed working practice |
| --- | --- |
| 1. Coordinate the plan and look ahead | The six-month plan above names owners and decisions. Maintain a weekly work log and refresh dependencies at each gate. |
| 2. Schedule mandatory and specialist training | The development plan reserves the England modules and links further training to reviewable work. Supervisors would approve dates. |
| 3. Manage daily resources, time and budget | Track planned effort, actual days and forecast completion beside the cost ledger. Review exceptions with the company lead. |
| 4. Obtain spending approval and manage personal development | The illustrative request separates costs by purpose. Record proposer, budget owner, approval, committed amount and actual amount for each item. |
| 5. Build company and university relationships | Agree one research supervisor and one product owner, a standing joint review, and shared records of unresolved questions. |
| 6. Liaise daily, train staff and supervise where required | Use a short company check-in and the operator exercise above. A placement student could reproduce an agreed benchmark under supervision. |
| 7. Contribute to meetings and present progress | The steering brief gives a decision question, measured results and next evidence required. Use the workbench for an external, synthetic-data walkthrough. |
| 8. Deliver additional work agreed by the groups | Record each change request, its intended benefit, effort and impact on the critical path. The relevant committee records approval before replanning. |
| 9. Establish contacts for future collaboration | Agree targeted questions with the supervisors before approaching other associates, statistics producers, academic teams or Innovate UK. Track permission, purpose, owner and outcome. |
| 10. Represent the programme | Prepare an accessible public explanation of a KTP use case. Obtain partner clearance for names, findings and attribution before representing the programme externally. |

The application still needs the candidate’s own evidence of qualifications, past responsibilities, teamwork, travel, on-site availability and career intentions. Stakeholder participation, committee approval, formal KTP representation, participant learning, savings and business adoption remain prospective. [Official duties and selection criteria](https://hr.apps.qub.ac.uk/jobs/job_desc/26_113757.pdf?ts=20261111154523)
