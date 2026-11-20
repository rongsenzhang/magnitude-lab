import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The browser loads this file as an ES module. Import its exact source the same way
// on Node releases that otherwise classify .js files in this package as CommonJS.
const source = await readFile(new URL("../web/assets/evidence.js", import.meta.url));
const { evidenceFor, evidencePack, intents } = await import(
  "data:text/javascript;base64," + source.toString("base64")
);
const lab = JSON.parse(await readFile(new URL("../web/data/lab.json", import.meta.url), "utf8"));
const defaults = { lab, dataset: "turnover", level: "district", metric: "sum", method: "perturb" };
const plain = card => [card.title, card.summary, ...card.facts].join(" ");
const profile = { ...defaults, level: "region", method: "combined", cell: "R04" };

test("selected synthetic cell cites dominance, count and withheld outcome", () => {
  const text = plain(evidenceFor("cell", profile));
  assert.match(text, /South East/);
  assert.match(text, /flagged and Combined withholds/);
  assert.match(text, /contributor count is 37, at or above/);
  assert.match(text, /70.63%.*above the 50% threshold/);
  assert.doesNotMatch(text, /£|undefined/);
  assert.match(text, /Reference only would publish an estimate/);
  assert.match(text, /Primary suppression would withhold an estimate/);
  assert.match(text, /Perturbation would publish an estimate/);
});

test("a flagged area can be published when the selected policy permits it", () => {
  for (const method of ["raw", "perturb", "suppress", "combined"]) {
    const card = evidenceFor("cell", { ...profile, method });
    if (["raw", "perturb"].includes(method)) {
      assert.match(card.summary, /flagged and .+ publishes £[1-9]/);
      assert.match(card.facts.at(-1), /publishes flagged and unflagged/);
    } else {
      assert.match(card.summary, /withholds this estimate/);
    }
  }
  const chosen = plain(evidenceFor("cell", { ...profile, cell: "R01" }));
  assert.match(chosen, /North West/);
  assert.match(chosen, /unflagged and Combined publishes/);
  assert.doesNotMatch(chosen, /South East/);
  assert.match(chosen, /Primary suppression would publish an estimate/);
});

test("research card distinguishes a sparse cell from a dominant one", () => {
  const card = evidenceFor("cell", { ...defaults, dataset: "earnings", method: "suppress", cell: "D01" });
  assert.match(card.summary, /withholds/);
  assert.match(card.facts[0], /below the threshold/);
  assert.match(card.facts[1], /at or below the 50% threshold/);
});

test("policy comparisons match released counts and proximity on identical populations", () => {
  const card = evidenceFor("policies", profile);
  assert.equal(card.facts.length, 4);
  assert.match(card.facts[0], /Reference only publishes 4\/4.*1 of 1 flagged/);
  assert.match(card.facts[1], /Primary suppression publishes 3\/4.*0 of 1 flagged/);
  assert.match(card.facts[2], /Perturbation publishes 4\/4.*0 of 1 flagged/);
  assert.match(card.facts[3], /Combined publishes 3\/4.*0 of 1 flagged/);
});

test("validation separates display-seed numbers from the aligned pooled result", () => {
  const card = evidenceFor("benchmark", defaults);
  assert.match(card.summary, /2718.*32 validation runs/);
  assert.match(card.facts[0], /12\/12 cells released.*9.54%.*1 of 4 flagged/);
  assert.match(card.facts[1], /384\/384 cells released.*6.91%.*53 of 163 flagged/);
});

test("pooled neighbour coverage and retained order follow the chosen policy", () => {
  const chosen = evidenceFor("benchmark", profile);
  assert.match(chosen.facts[2], /Combined.*64 of 128 eligible.*62 of 64 keep/);
  const other = evidenceFor("benchmark", { ...profile, method: "perturb" });
  assert.match(other.facts[2], /Perturbation.*128 of 128 eligible.*120 of 128 keep/);
});

test("public citations select the data, release policy and resolved area", () => {
  for (const cell of ["R04", null, "invalid"]) {
    const args = { ...profile, cell };
    const resolved = cell === "R04" ? cell : lab.datasets.find(d => d.id === "turnover").views
      .find(v => v.level === "region" && v.metric === "sum" && v.method === "combined")
      .cells.reduce((a, b) => a.raw > b.raw ? a : b).id;
    for (const { id } of intents) {
      const card = evidenceFor(id, args);
      const url = new URL(card.sources.at(-1).url);
      assert.equal(url.origin, "https://rongsenzhang.github.io");
      assert.equal(url.pathname, "/magnitude-lab/");
      assert.deepEqual(Object.fromEntries(new URLSearchParams(url.hash.slice(1))), {
        tab: ["benchmark", "spatial"].includes(id) ? "validation" : "workbench",
        dataset: "turnover", level: "region", metric: "sum", method: "combined", cell: resolved,
      });
    }
  }
});

test("spatial result is independent of selected policy while the single-seed result follows it", () => {
  const args = { ...defaults, dataset: "earnings", level: "region", metric: "mean" };
  const perturb = evidenceFor("spatial", args);
  const combined = evidenceFor("spatial", { ...args, method: "combined" });
  assert.match(perturb.facts[0], /1.81%.*114 of 128/);
  assert.match(perturb.facts[1], /50%.*6.05%.*93 of 128/);
  assert.deepEqual(combined.facts, perturb.facts);
  assert.match(combined.summary, /displayed Combined example/);
});

test("undefined denominators and missing estimates retain their meaning", () => {
  const regional = { ...defaults, dataset: "earnings", level: "region" };
  assert.match(plain(evidenceFor("coverage", regional)), /no flagged cells to assess/);
  const data = structuredClone(lab);
  const turnover = data.datasets.find(d => d.id === "turnover");
  const v = turnover.views.find(v => v.level === "district" && v.metric === "sum" && v.method === "perturb");
  Object.assign(v.summary, { released: 0, releaseRate: 0, wape: null, comparablePairs: 0,
    preservedPairs: 0, neighbourPairs: 17 });
  const context = { ...defaults, lab: data };
  assert.match(plain(evidenceFor("coverage", context)), /0 of 12.*WAPE is undefined/);
  assert.match(plain(evidenceFor("spatial", context)), /None of the 17 eligible/);
  v.summary.neighbourPairs = 0;
  assert.match(plain(evidenceFor("spatial", context)), /No neighbouring areas have distinct/);
});

test("integration card labels both fixed profiles, confines detailed diagnostics to research", () => {
  const allowed = [profile, { ...defaults, dataset: "earnings", metric: "mean", method: "combined" }];
  for (const args of allowed) {
    const card = evidenceFor("integration", args);
    assert.match(card.summary, /matches a fixed synthetic release profile/);
    assert.match(plain(card), /Python release tool.*area, estimate and status.*withheld estimate is null/);
  }
  assert.match(evidenceFor("integration", defaults).summary, /outside the two fixed/);
});

test("all 32 views return a bounded, sourced and deterministic common evidence pack", () => {
  assert.equal(intents.length, 6);
  for (const dataset of lab.datasets) {
    for (const { level, metric, method } of dataset.views) {
      const context = { lab, dataset: dataset.id, level, metric, method };
      const cards = evidencePack(context);
      assert.deepEqual(Object.keys(cards), intents.map(i => i.id));
      const modelPacket = Object.values(cards).map(({id, title, summary, facts}) => ({id, title, summary, facts}));
      assert.ok(JSON.stringify(modelPacket).length < 8600);
      assert.ok(JSON.stringify(cards).length < 8600);
      for (const { id } of intents) {
        const card = cards[id];
        assert.deepEqual(card, evidenceFor(id, context));
        assert.ok(card.facts.length >= 1 && card.facts.length <= 4);
        assert.ok(plain(card).length < 1300);
        assert.ok(card.sources.length >= 2 && card.sources.slice(0, -1).every(src =>
          src.label && src.url.startsWith("https://github.com/rongsenzhang/magnitude-lab/blob/v1.0.0/")));
        assert.doesNotMatch(plain(card), /(?:NaN|Infinity|\[object Object\])/);
      }
    }
  }
  assert.throws(() => evidenceFor("__proto__", defaults), RangeError);
  assert.throws(() => evidenceFor("coverage", { ...defaults, metric: "median" }), RangeError);
});
