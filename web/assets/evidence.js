/** Grounded analyst explanations for the public synthetic workbench. No network or model calls. */
const repository = "https://github.com/rongsenzhang/magnitude-lab/blob/v1.0.0/";
const methodsSource = { label: "Method definitions and results", url: repository + "docs/methods.md" };
const dataSource = { label: "Versioned experiment data", url: repository + "web/data/lab.json" };
const integrationSource = { label: "Release contract and public integration", url: repository + "docs/integration.md" };

export const intents = [
  { id: "cell", label: "Explain the selected area" },
  { id: "coverage", label: "Explain error and coverage" },
  { id: "policies", label: "Compare the release policies" },
  { id: "spatial", label: "Compare neighbouring areas" },
  { id: "benchmark", label: "Compare this example with validation" },
  { id: "integration", label: "Explain the release interface and limits" },
];

const policy = {
  raw: "Reference only",
  suppress: "Primary suppression",
  perturb: "Perturbation",
  combined: "Combined",
};
const percentages = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });
const percent = value => value == null ? "undefined" : percentages.format(value);

function weightedError(r) {
  return r.wape == null ? "WAPE is undefined because the released reference total is zero"
    : `WAPE is ${percent(r.wape)} on released cells`;
}

function closeFlagged(r, rules) {
  return r.flagged
    ? `${r.closeFlagged} of ${r.flagged} flagged cells were released within ${percent(rules.closeThreshold)} of their synthetic reference`
    : "there were no flagged cells to assess for proximity";
}

function selectedData(context) {
  const { lab, dataset, level, metric, method } = context;
  const population = lab.datasets.find(row => row.id === dataset);
  const matches = row => row.level === level && row.metric === metric;
  const views = population?.views.filter(matches) ?? [];
  const view = views.find(row => row.method === method);
  if (!view) throw new RangeError("Unknown synthetic workbench configuration.");
  const cell = view.cells.find(row => row.id === context.cell)
    ?? view.cells.reduce((a, b) => a.raw > b.raw ? a : b);
  const contains = row => row.dataset === dataset && matches(row);
  const comparisons = lab.validation.results.filter(contains);
  const benchmark = comparisons.find(row => row.method === method);
  const spatial = lab.validation.spatial.results.find(contains);
  const scenario = `${population.name}, ${level} ${metric === "mean" ? "means" : "totals"}`;
  return { lab, population, views, view, cell, benchmark, comparisons, spatial, scenario };
}

function alternativeOutcomes(views, currentMethod, cellId) {
  return views.filter(view => view.method !== currentMethod).map(view => {
    const estimate = view.cells.find(cell => cell.id === cellId).value;
    return `${policy[view.method]} would ${estimate == null ? "withhold" : "publish"} an estimate.`;
  }).join(" ");
}

function areaEvidence({ lab, views, view, cell, scenario }) {
  const rules = lab.rules;
  const small = cell.n < rules.minCount;
  const dominant = cell.dominance > rules.maxDominance;
  const countTest = small ? "below" : "at or above";
  const shareTest = dominant ? "above" : "at or below";
  const outcome = cell.value == null
    ? "withholds this estimate"
    : `publishes ${currency.format(cell.value)}`;
  const screen = cell.flag ? "flagged" : "unflagged";
  return {
    id: "cell", title: `Screening ${cell.label}`,
    summary: `${scenario}. The cell is ${screen} and ${policy[view.method]} ${outcome}.`,
    facts: [
      `The synthetic contributor count is ${cell.n}, ${countTest} the threshold of ${rules.minCount}.`,
      `The largest contributor supplies ${percent(cell.dominance)} of the original total, ${shareTest} the ${percent(rules.maxDominance)} threshold.`,
      alternativeOutcomes(views, view.method, cell.id),
      view.method === "suppress" || view.method === "combined"
        ? "This policy withholds a cell when either threshold is breached."
        : "This policy publishes flagged and unflagged cells. The screen remains visible for research.",
    ],
    sources: [dataSource, methodsSource],
  };
}

function coverageEvidence({ lab, view, scenario }) {
  const s = view.summary;
  return {
    id: "coverage", title: "Error and release coverage",
    summary: `${scenario}. ${policy[view.method]} publishes ${s.released} of ${s.total} cells (${percent(s.releaseRate)}).`,
    facts: [
      `For this synthetic example, ${weightedError(s)}.`,
      "WAPE divides total absolute error by total reference magnitude over released cells. Withheld cells leave both sums.",
      `At the current setting, ${closeFlagged(s, lab.rules)}. This measures aggregate proximity.`,
    ],
    sources: [dataSource, methodsSource],
  };
}

function policyEvidence({ lab, views, scenario }) {
  const facts = Object.entries(policy).map(([id, label]) => {
    const s = views.find(row => row.method === id).summary;
    return `${label} publishes ${s.released}/${s.total} cells. ${weightedError(s)}. In this run, ${closeFlagged(s, lab.rules)}.`;
  });
  return {
    id: "policies", title: "Four release policies",
    summary: `${scenario}, display seed ${lab.displaySeed}. All four policies use the same population. Compare error alongside the number of cells still available.`,
    facts, sources: [dataSource, methodsSource],
  };
}

function pairResult(r) {
  if (!r.neighbourPairs) return "No neighbouring areas have distinct reference values.";
  if (!r.comparablePairs) return `None of the ${r.neighbourPairs} eligible neighbouring pairs has both estimates released.`;
  return `${r.comparablePairs} of ${r.neighbourPairs} eligible pairs can be compared. ${r.preservedPairs} of ${r.comparablePairs} keep their original order.`;
}

function spatialEvidence({ lab, view, comparisons, spatial, scenario }) {
  const independent = comparisons.find(row => row.method === "perturb");
  const design = lab.validation.spatial;
  const result = r => `${weightedError(r)}. ${pairResult(r)}`;
  return {
    id: "spatial", title: "Geographic comparisons",
    summary: `${scenario}. In the displayed ${policy[view.method]} example, ${pairResult(view.summary)}`,
    facts: [
      `Across ${independent.runs} synthetic runs at ±${percent(design.amplitude)}, independent contributor draws give these results. ${result(independent)}`,
      `With a ${percent(design.shareProbability)} chance of using each contributor’s region-wide draw, ${result(spatial)}`,
      "The paired experiment releases every area in both designs. Each pair contains adjacent places with different original estimates.",
    ],
    sources: [dataSource, methodsSource],
  };
}

function benchmarkEvidence({ lab, view, benchmark, scenario }) {
  const s = view.summary;
  return {
    id: "benchmark", title: "Displayed example and pooled validation",
    summary: `${scenario}, ${policy[view.method]}. Display seed ${lab.displaySeed} is separate from the ${benchmark.runs} validation runs.`,
    facts: [
      `In the displayed example, ${s.released}/${s.total} cells released. ${weightedError(s)}. In this run, ${closeFlagged(s, lab.rules)}.`,
      `In pooled validation, ${benchmark.released}/${benchmark.cells} cells released. ${weightedError(benchmark)}. Across the runs, ${closeFlagged(benchmark, lab.rules)}.`,
      `For ${policy[view.method]} across the validation runs, ${pairResult(benchmark)}`,
      "Population values and adjustment draws vary across runs. Pooled WAPE adds errors and reference magnitudes across released cells before division.",
    ],
    sources: [dataSource, methodsSource],
  };
}

function integrationEvidence({ view, population, scenario }) {
  const isProfile = view.method === "combined" && (
    (population.id === "earnings" && view.level === "district" && view.metric === "mean") ||
    (population.id === "turnover" && view.level === "region" && view.metric === "sum")
  );
  return {
    id: "integration", title: "Research and release interfaces",
    summary: `${scenario}, ${policy[view.method]}. ${isProfile
      ? "This selection matches a fixed synthetic release profile."
      : "This selection sits outside the two fixed synthetic release profiles."}`,
    facts: [
      "The synthetic analyst workbench can inspect reference values, counts, concentration and screening flags. These cards describe public fictional data.",
      "The Python release tool accepts two combined-policy profiles covering district mean earnings and regional turnover totals. Each result row has area, estimate and status. A withheld estimate is null.",
      "The separate Cantabular adapter reads a public historical frequency table. Applying magnitude methods inside a partner deployment requires its data, controls and approval.",
      "These experiments measure utility, coverage and aggregate proximity. They do not establish privacy for confidential data.",
    ],
    sources: [integrationSource, methodsSource],
  };
}

const builders = {
  cell: areaEvidence,
  coverage: coverageEvidence,
  policies: policyEvidence,
  spatial: spatialEvidence,
  benchmark: benchmarkEvidence,
  integration: integrationEvidence,
};

function buildCard(id, data) {
  const card = builders[id](data);
  const { population, view, cell } = data;
  const tab = id === "spatial" || id === "benchmark" ? "validation" : "workbench";
  const params = new URLSearchParams({
    tab, dataset: population.id, level: view.level, metric: view.metric, method: view.method, cell: cell.id,
  });
  const viewSource = { label: tab === "validation" ? "Open these validation results" : "Open this workbench view",
    url: `https://rongsenzhang.github.io/magnitude-lab/#${params}` };
  return { ...card, sources: [...card.sources, viewSource] };
}

/** Return one bounded evidence card for the requested intent and synthetic view. */
export function evidenceFor(intent, context) {
  if (!Object.hasOwn(builders, intent)) throw new RangeError("Unknown research question.");
  return buildCard(intent, selectedData(context));
}

/** Supply the same six evidence cards to local and model-assisted explanations. */
export function evidencePack(context) {
  const data = selectedData(context);
  return Object.fromEntries(intents.map(({id}) => [id, buildCard(id, data)]));
}
