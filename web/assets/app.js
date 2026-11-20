const root = document.querySelector("#app");
const repository = "https://github.com/rongsenzhang/magnitude-lab";
const docs = repository + "/blob/v1.0.0/docs/";
const labels = {
  tab: { workbench: "Workbench", validation: "Validation", guide: "Field guide" },
  dataset: { turnover: "Business turnover", earnings: "Household earnings" },
  level: { district: "District", region: "Region" },
  metric: { sum: "Annual total", mean: "Annual mean" },
  method: {
    raw: "Reference only",
    suppress: "Primary suppression",
    perturb: "Perturbation",
    combined: "Combined",
  },
};
const defaults = {
  tab: "workbench",
  dataset: "turnover",
  level: "district",
  metric: "sum",
  method: "perturb",
};
const glyphs = {
  download: '<path d="M12 3v11m-4-4 4 4 4-4M5 15v4h14v-4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  delta: '<path d="M2 13h5l3-7 4 12 3-5h5"/>',
  flag: '<path d="M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  link: '<path d="M10 14l4-4m-6 2-2 2a3 3 0 0 0 4 5l4-4m2-3 2-2a3 3 0 0 0-4-5l-4 4"/>',
};
function icon(name) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    glyphs[name] +
    "</svg>"
  );
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const pct = (value) =>
  value == null ? "—" : (value * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "%";
const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
  maximumFractionDigits: 1,
});
const flaggedResult = (row) =>
  row.flagged ? row.closeFlagged + " / " + row.flagged : "None flagged";
const money = (value) => (value == null ? "Withheld" : pounds.format(value));
const short = (value) => (value == null ? "Withheld" : compact.format(value));
let lab;
let interfaces;
let exampleProfile = "turnover";
let state;
let selected;
let noticeTimer;
function readState() {
  const query = new URLSearchParams(location.hash.slice(1));
  state = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      const choice = query.get(key);
      return [key, Object.hasOwn(labels[key], choice) ? choice : fallback];
    }),
  );
  selected = query.get("cell");
}
function hash(changes = {}, cell = selected) {
  const params = new URLSearchParams({ ...state, ...changes });
  if (cell) params.set("cell", cell);
  return "#" + params.toString();
}
function navigate(changes, cell = selected) {
  history.pushState(null, "", hash(changes, cell));
  readState();
  render();
}
function notify(message) {
  const node = document.querySelector("#notice");
  node.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    node.textContent = "";
  }, 3500);
}
function getSelection() {
  const dataset = lab.datasets.find((item) => item.id === state.dataset);
  const view = dataset.views.find((item) =>
    ["level", "metric", "method"].every((key) => item[key] === state[key]),
  );
  return { dataset, view };
}
function filters() {
  const fields = {
    dataset: "Dataset",
    level: "Geography",
    metric: "Statistic",
    method: "Release method",
  };
  const controls = Object.entries(fields).map(([key, title]) => {
    const options = Object.entries(labels[key]).map(
      ([id, text]) =>
        `<option value="${id}"${state[key] === id ? " selected" : ""}>${text}</option>`,
    );
    return `<label><span>${title}</span>
      <select id="select-${key}" data-select="${key}">${options.join("")}</select>
    </label>`;
  });
  return `<div class="filters" role="group" aria-label="Experiment settings">${controls.join("")}</div>`;
}

function mast(title, line, section, action = "") {
  return `<div class="mast">
    <div><div class="eyebrow">${section}</div><h1>${title}</h1><p>${line}</p></div>
    ${action}
  </div>`;
}

function metric(title, value, suffix, line, glyph, colour = "") {
  return `<div class="metric">
    <div class="metricHead"><span>${title}</span><span class="statIcon ${colour}">${icon(glyph)}</span></div>
    <div class="number">${value} <small>${suffix}</small></div>
    <p>${line}</p>
  </div>`;
}

const methods = {
  raw: "Shows the original synthetic aggregates as a benchmark.",
  suppress:
    "Withholds a cell with fewer than eight contributors or a top contributor share above 50%. Other values are unchanged.",
  perturb:
    "Applies a fixed contributor-level multiplier within ±25% before aggregation. This keeps totals consistent across the two geographic levels.",
  combined:
    "Applies the same contributor perturbation and withholds cells flagged by the primary suppression rule.",
};

function selectButton(cell, type, body, tone = "") {
  const id = escape(cell.id);
  const tile = type === "tile";
  const placement = tile ? ` style="grid-column:${cell.x + 1};grid-row:${cell.y + 1}"` : "";
  const description = `Inspect ${escape(cell.label)}, release ${money(cell.value)}, reference ${money(cell.raw)}`;
  return `<button type="button" id="${type}-${id}" class="${tile ? `${type} ${tone}` : type}"
    data-cell="${id}" aria-label="${description}" aria-pressed="${selected === cell.id}"${placement}>${body}</button>`;
}

function comparison(view) {
  const ordered = [...view.cells].sort((a, b) => b.raw - a.raw);
  const shown = ordered.slice(0, 6);
  const largest = Math.max(1, ...shown.flatMap((cell) => [cell.raw, cell.value ?? 0])) * 1.02;
  const step = 10 ** Math.floor(Math.log10(largest)) / 2;
  const maximum = Math.ceil(largest / step) * step;
  const scope =
    shown.length < ordered.length
      ? "Six largest areas by reference value."
      : "All areas, ordered by reference value.";

  const rows = shown.map((cell) => {
    const bar =
      cell.value == null
        ? ""
        : `<span class="bar" style="width:${(100 * cell.value) / maximum}%"></span>`;
    const point = `<span class="point" style="left:${(100 * cell.raw) / maximum}%"></span>`;
    return selectButton(
      cell,
      "chartRow",
      `<span class="label">${escape(cell.label)}</span>
      <span class="track">${bar}${point}</span><span class="v">${short(cell.value)}</span>`,
    );
  });

  return `<section class="panel">
    <div class="panelhead"><div><h2>Area comparison</h2><p>${scope} Select an area to inspect it.</p></div></div>
    <div class="legend">
      <span class="key"><i class="sw"></i>Release value</span>
      <span class="key"><i class="sw ref"></i>Synthetic reference</span>
    </div>
    <div class="chart">
      ${rows.join("")}
      <div class="chartAxis" aria-hidden="true">
        <span></span><span><b>£0</b><b>${short(maximum / 2)}</b><b>${short(maximum)}</b></span><span></span>
      </div>
    </div>
    <details><summary>How to read this comparison</summary>
      <p>The purple bar and outlined dot share a zero-based scale. Values at right show the release, rounded for display. A withheld value has no bar. The full table includes every area.</p>
    </details>
  </section>`;
}

function spatial(view) {
  const values = view.cells.map((cell) => cell.value).filter((value) => value != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const columns = Math.max(...view.cells.map((cell) => cell.x)) + 1;
  const current = view.cells.find((cell) => cell.id === selected) || view.cells[0];
  const group = current.region === current.label ? "Region" : escape(current.region);
  const tiles = view.cells.map((cell) => {
    let tone = "withheld";
    if (cell.value != null) {
      const band =
        max === min ? 2 : Math.min(4, Math.floor((5 * (cell.value - min)) / (max - min)));
      tone = `tone${band}`;
    }
    return selectButton(
      cell,
      "tile",
      `<span>${escape(cell.id)}</span><small>${escape(cell.label)}</small>`,
      tone,
    );
  });
  const scale = [0, 1, 2, 3, 4].map((i) => `<i class="tone${i}"></i>`).join("");

  return `<section class="panel">
    <div class="panelhead"><div><h2>Spatial view</h2><p>Fictional neighbouring areas · ${labels.level[state.level]} grid</p></div></div>
    <div class="map" role="group" aria-label="Select an area" style="grid-template-columns:repeat(${columns}, minmax(0,1fr))">${tiles.join("")}</div>
    <div class="legend">
      <span class="key">Low <span class="scale" aria-hidden="true">${scale}</span> High</span>
      <span class="key"><i class="sw hold"></i>Withheld</span>
    </div>
    <div class="cellread" aria-live="polite">
      <div><strong>${escape(current.label)}</strong><p>${group} · ${escape(current.id)}</p></div>
      <div><strong>${money(current.value)}</strong><p>Reference ${money(current.raw)}</p></div>
    </div>
    <p class="sub">${current.n} contributors · largest share ${pct(current.dominance)} · ${current.flag ? "flagged for review" : "unflagged"}</p>
    <p class="sub">Grid colours are scaled within this view.</p>
  </section>`;
}

function table(headers, rows, caption) {
  const headings = headers.map(
    (heading, column) => `<th scope="col"${column ? ' class="num"' : ""}>${heading}</th>`,
  );
  const body = rows.map(([label, ...values]) => {
    const cells = values.map((value) => `<td class="num">${value}</td>`);
    return `<tr><th scope="row">${label}</th>${cells.join("")}</tr>`;
  });
  const description = escape(caption);
  return `<div class="tabwrap" tabindex="0" aria-label="${description}">
    <table><caption>${description}</caption><thead><tr>${headings.join("")}</tr></thead><tbody>${body.join("")}</tbody></table>
  </div>`;
}

function workbench() {
  const { dataset, view } = getSelection();
  if (!view.cells.some((cell) => cell.id === selected)) {
    selected = view.cells.reduce((a, b) => (a.raw > b.raw ? a : b)).id;
  }
  const s = view.summary;
  const rows = view.cells.map((cell) => [
    `${escape(cell.label)} <span class="muted">${escape(cell.id)}</span>`,
    cell.n,
    pct(cell.dominance),
    money(cell.raw),
    money(cell.value),
    `<span class="chip ${cell.flag ? "flag" : ""}">${cell.flag ? "Flagged" : "Unflagged"}</span>`,
  ]);
  const exportButton = `<button class="primary" id="export">${icon("download")}Export table</button>`;
  const header = mast(
    "Release workbench",
    "Compare privacy rules for synthetic earnings and turnover across districts and regions.",
    "Statistical disclosure control",
    exportButton,
  );
  const flags = metric(
    "Flagged and close",
    s.flagged ? s.closeFlagged : "—",
    s.flagged ? `/ ${s.flagged}` : "",
    s.flagged ? "Within 5% of the reference" : "No flagged cells in this view",
    "flag",
    "amber",
  );
  const audit = table(
    ["Area", "Contributors", "Top share", "Reference", "Release", "Screen"],
    rows,
    "Cell audit for the current view",
  );

  return `${header}${filters()}
    <div class="metrics">
      ${metric("Published cells", s.released, `/ ${s.total}`, "Areas with a release value", "grid")}
      ${metric("Weighted error", pct(s.wape), "", "On published cells only", "delta", "teal")}
      ${flags}
    </div>
    <div class="board">${comparison(view)}${spatial(view)}</div>
    <section class="panel">
      <div class="panelhead">
        <div><h2>Cell audit</h2><p>${escape(dataset.name)} · ${dataset.records} synthetic contributors · ${labels.metric[state.metric]} in GBP</p></div>
        <button id="share">${icon("link")}Copy view link</button>
      </div>
      ${audit}
      <details><summary>Policy and interpretation</summary>
        <p>${methods[state.method]} A cell is flagged when its original count is below eight or its largest contributor exceeds half of its total. The closeness count is a diagnostic on synthetic truth. A zero count does not establish disclosure safety.</p>
      </details>
    </section>`;
}

function spatialStudy(match) {
  const independent = lab.validation.results.find((row) => match(row) && row.method === "perturb");
  const shared = lab.validation.spatial.results.find(match);
  const makeRow = (name, r) => [
    name,
    pct(r.wape),
    `${r.preservedPairs} / ${r.comparablePairs}`,
    flaggedResult(r),
  ];
  const rows = [makeRow("Independent draws", independent), makeRow("Region-shared draws", shared)];
  const headers = [
    "Adjustment design",
    "Weighted error",
    "Orders kept / comparable",
    "Close / flagged",
  ];
  return `<section class="panel">
    <div class="panelhead"><div><h2>Spatial dependence experiment</h2>
      <p>Hold the amplitude at ±25% and vary how neighbouring contributors move together.</p>
    </div></div>
    ${table(headers, rows, "Paired spatial perturbation experiment")}
    <p class="aftertable">In the second design each contributor has a 50% chance of sharing its region’s draw. Compare how the two designs affect local order and absolute error for the selected population and geography. Both designs publish all cells.</p>
  </section>`;
}

function validation() {
  const match = (row) =>
    row.dataset === state.dataset && row.level === state.level && row.metric === state.metric;
  const study = lab.validation;
  const methodOrder = Object.keys(labels.method);
  const results = study.results
    .filter(match)
    .sort((a, b) => methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method));
  const current = results.find((row) => row.method === state.method);
  const rows = results.map((row) => [
    labels.method[row.method] +
      (row.method === state.method ? ' <span class="chip">Selected</span>' : ""),
    `${row.released} / ${row.cells}`,
    pct(row.wape),
    flaggedResult(row),
    pct(row.neighbourCoverage),
    pct(row.orderRetention),
  ]);
  const policyHeaders = [
    "Policy",
    "Published / all",
    "Weighted error",
    "Close / flagged",
    "Pair coverage",
    "Order kept",
  ];
  const bounds = study.sensitivity
    .filter((row) => match(row) && row.method === state.method)
    .sort((a, b) => a.amplitude - b.amplitude)
    .map((row) => [
      `±${pct(row.amplitude)}`,
      pct(row.wape),
      flaggedResult(row),
      pct(row.orderRetention),
    ]);
  const sensitivity = bounds.length
    ? table(
        ["Bound", "Weighted error", "Close / flagged", "Order kept"],
        bounds,
        "Perturbation amplitude sweep",
      )
    : "<p>This policy has no perturbation parameter. Select Perturbation or Combined to inspect the sweep.</p>";
  const header = mast(
    "Validation results",
    "Compare release policies across independent synthetic populations and examine how the conclusions change.",
    "Empirical validation",
  );

  return `${header}${filters()}
    <div class="metrics">
      ${metric("Held-out runs", current.runs, "", "Independent seeds per scenario", "grid")}
      ${metric("Pooled error", pct(current.wape), "", "Weighted over released cells", "delta", "teal")}
      ${metric("Neighbour order kept", pct(current.orderRetention), "", "Among comparable adjacent pairs", "flag", "amber")}
    </div>
    <section class="panel">
      <div class="panelhead"><div><h2>Policy comparison</h2>
        <p>${labels.dataset[state.dataset]} · ${labels.level[state.level]} · ${labels.metric[state.metric]}</p>
      </div></div>
      ${table(policyHeaders, rows, "Validation across independent populations")}
      <details open><summary>Reading the denominators</summary>
        <p>Weighted error is total absolute error divided by total reference magnitude over released cells. Withholding difficult cells changes that denominator. Close / flagged counts published flagged cells within 5% of their reference, out of all flagged cells. Pair coverage is the share of unequal neighbouring reference pairs with both values published. Order kept is measured only on those comparable pairs. A dash means there is no eligible denominator.</p>
      </details>
    </section>
    <section class="panel">
      <div class="panelhead"><div><h2>Perturbation sensitivity</h2><p>Compare the same populations and noise draws at three multiplier bounds.</p></div></div>
      ${sensitivity}
      <details><summary>Reproduce the experiment</summary>
        <p>Display seed ${lab.displaySeed}. Validation seeds ${study.seeds[0]}–${study.seeds.at(-1)}. Both populations and the contributor adjustments vary across seeds. The <a href="${docs}methods.md">methods and results</a> describe data generation, calibration limits and the reproduction command.</p>
      </details>
    </section>
    ${spatialStudy(match)}`;
}

function resource(path, title) {
  return `<a class="resource" href="${docs}${path}">${title}</a>`;
}

function interfaceExamples() {
  const example = interfaces.releaseExamples[exampleProfile];
  const snapshot = interfaces.counts.map((row) => [
    escape(row.label),
    row.count.toLocaleString("en-GB"),
  ]);
  const examples = example.rows.map((row) => [
    escape(row.area),
    money(row.estimate),
    escape(row.status),
  ]);
  return `<section class="panel">
    <h2>Connected public table</h2>
    <p>The version-pinned Cantabular GraphQL adapter read four province counts from the public 1911 Irish census preview. This recorded response is dated ${escape(interfaces.snapshotDate)}.</p>
    ${table(["Province", "People"], snapshot, "Historic public census counts")}
    <p><a href="${docs}integration.md">Repeat the live read-only query</a></p>
  </section>
  <section class="panel">
    <h2>Downstream release preview</h2>
    <p>Choose a fixed synthetic release profile to see the fields an analytical client or assistant would receive.</p>
    <label class="profile"><span>Release profile</span>
      <select id="profile">
        <option value="turnover" ${exampleProfile === "turnover" ? "selected" : ""}>Regional turnover totals</option>
        <option value="earnings" ${exampleProfile === "earnings" ? "selected" : ""}>District mean earnings</option>
      </select>
    </label>
    ${table(["Area", "Estimate", "Status"], examples, "Synthetic release projection")}
    <p>Withheld values stay empty in the machine-readable output. The research reference stays in the workbench.</p>
    <a class="resource" href="./data/interfaces.json">Download interface examples (JSON)</a>
  </section>`;
}

function guide() {
  const header = mast(
    "Field guide",
    "Follow a research question from the first table to the evidence behind a release decision.",
    "Operator handover",
  );
  return `${header}<div class="guidegrid">
    <section class="panel">
      <h2>Try a release decision</h2>
      <p>Should a statistics producer publish turnover totals for every district?</p>
      <ol>
        <li>Open the turnover scenario and identify the largest change in the area comparison.</li>
        <li>Select <strong>Combined</strong>. Inspect which cells disappear and how the error denominator changes.</li>
        <li>Switch to <strong>Region</strong>. Check whether combining districts changes the number flagged.</li>
        <li>Open <strong>Validation</strong>. Compare the single example to the pooled results and neighbouring-area order.</li>
      </ol>
      <a class="action soft" data-preset href="${hash({ ...defaults, tab: "workbench" }, null)}">Open turnover scenario</a>
    </section>
    <section class="panel">
      <h2>What this measures</h2>
      <p>Two synthetic populations, four policies and two geographic levels let you compare the cost of releasing totals and means. Each cell is screened for small counts and dominance.</p>
      <p>Reference values are deliberately visible to the researcher. Primary suppression alone can leave related totals informative. Perturbation has no formal privacy budget here. These simulations support method comparison; a data owner would need a separate disclosure review before any real release.</p>
      ${resource("methods.md", "Mathematics and empirical results")}
      ${resource("integration.md", "Release interface and integration check")}
    </section>
    <section class="panel">
      <h2>Company and market</h2>
      <p>The research question was selected against published product capabilities, deployed services and the role specification.</p>
      ${resource("company-review.md", "Cantabular business and technology review")}
      ${resource("company-pages.csv", "Public website inventory")}
      ${resource("market.md", "Commercial and public-sector alternatives")}
    </section>
    <section class="panel">
      <h2>Delivery and handover</h2>
      <p>Inspect the operator exercise, acceptance criteria, management responsibilities and the boundary between measured results and a proposed pilot.</p>
      ${resource("technical-path.md", "Technical path and architecture")}
      ${resource("delivery.md", "Role coverage, pilot plan and training")}
      <a class="resource" href="${repository}">Source and reproduction instructions</a>
    </section>
    ${interfaceExamples()}
  </div>`;
}

function download() {
  const { view } = getSelection();
  const columns = [
    "dataset",
    "level",
    "metric",
    "method",
    "area_id",
    "area",
    "contributors",
    "top_share",
    "reference_gbp",
    "release_gbp",
    "flagged",
    "status",
  ];
  const rows = view.cells.map((c) => [
    state.dataset,
    state.level,
    state.metric,
    state.method,
    c.id,
    c.label,
    c.n,
    c.dominance,
    c.raw,
    c.value,
    c.flag,
    c.value === null ? "withheld" : "published",
  ]);
  const quote = (x) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
  const csv = [columns, ...rows].map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download =
    ["magnitude-lab", state.dataset, state.level, state.metric, state.method].join("-") + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("Research table exported.");
}
function render() {
  if (!lab) return;
  const remembered = document.activeElement?.id;
  root.innerHTML =
    state.tab === "guide" ? guide() : state.tab === "validation" ? validation() : workbench();
  root.setAttribute("aria-busy", "false");
  document.title = labels.tab[state.tab] + " · Magnitude Lab";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === state.tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
    a.setAttribute("href", hash({ tab: a.dataset.nav }));
  });
  if (remembered && document.getElementById(remembered))
    document.getElementById(remembered).focus({ preventScroll: true });
}
root.addEventListener("change", (event) => {
  if (event.target.id === "profile") {
    exampleProfile = event.target.value;
    render();
    return;
  }
  const key = event.target.dataset.select;
  if (key) {
    navigate({ [key]: event.target.value }, key === "level" ? null : selected);
    notify(
      "Showing " +
        labels.dataset[state.dataset] +
        ", " +
        labels.level[state.level].toLowerCase() +
        ", " +
        labels.method[state.method].toLowerCase() +
        ".",
    );
  }
});
root.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.cell) {
    navigate({}, button.dataset.cell);
    return;
  }
  if (button.id === "export") {
    download();
    return;
  }
  if (button.id === "share") {
    const url = new URL(location.href);
    url.hash = hash();
    try {
      await navigator.clipboard.writeText(url.href);
      notify("View link copied.");
    } catch {
      window.prompt("Copy this view link", url.href);
    }
  }
});
function loadLocation() {
  readState();
  render();
}
window.addEventListener("hashchange", loadLocation);
window.addEventListener("popstate", loadLocation);
document.querySelector("nav").addEventListener("click", () => {
  window.scrollTo(0, 0);
});
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#main").focus();
});
try {
  const examples = await fetch("./data/interfaces.json");
  if (!examples.ok) throw new Error("Interface examples unavailable");
  interfaces = await examples.json();
  const response = await fetch("./data/lab.json");
  if (!response.ok) throw new Error("Data request failed");
  lab = await response.json();
  loadLocation();
} catch {
  root.setAttribute("aria-busy", "false");
  root.innerHTML =
    '<section class="error"><h1>Data unavailable</h1><p>Reload to retry, or open the versioned research data on GitHub.</p><a href="' +
    repository +
    '/tree/v1.0.0/web/data">Research data</a></section>';
}
