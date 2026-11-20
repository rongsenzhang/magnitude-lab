// Explicit, billable smoke test against the public site. CI uses mocked transport instead.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const lab = require("../web/data/lab.json");

const base = "https://rongsenzhang.github.io/magnitude-lab/";
const selection = { tab: "workbench", dataset: "turnover", level: "region",
  metric: "sum", method: "combined", cell: "R04" };

async function ask(page, message, previousMessages) {
  await page.getByRole("textbox", { name: "Your question" }).fill(message);
  const posted = page.waitForRequest(request =>
    request.method() === "POST" && new URL(request.url()).pathname === "/chat", {timeout: 30000});
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const request = (await posted).postDataJSON();
  assert.equal(request.history.length, previousMessages);
  assert.equal(request.context.cell, selection.cell);
  await page.waitForFunction(() => document.querySelector(".assistant-transcript")?.getAttribute("aria-busy") === "false",
    undefined, {timeout: 40000});
  const status = await page.locator(".assistant-status").innerText();
  assert.equal(status, "Answer received.", status);
  const article = page.getByRole("log").locator("article").nth(previousMessages / 2);
  const payload = {answer: await article.locator("p.assistant-text").last().innerText()};
  assert.ok(await article.getByRole("link").count() >= 1);
  console.log(payload.answer);
  return payload;
}

async function run() {
  if (!process.argv.includes("--live")) {
    throw new Error("Pass --live to make two real, billable requests to the public assistant.");
  }
  const dataset = lab.datasets.find(d => d.id === selection.dataset);
  const view = dataset.views.find(v => ["level", "metric", "method"].every(k => v[k] === selection[k]));
  const cell = view.cells.find(c => c.id === selection.cell);
  assert.equal(cell.value, null);
  const share = (100 * cell.dominance).toFixed(2);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: {width: 1380, height: 940} });
    page.setDefaultTimeout(45000);
    page.on("response", response => { if (new URL(response.url()).pathname === "/chat") console.log("Chat response:", response.status()); });
    await page.goto(base + "#" + new URLSearchParams(selection));
    await page.getByRole("button", { name: "Ask the research assistant" }).click();
    const first = await ask(page, "Why is the selected region withheld? Quote the largest contributor’s percentage.", 0);
    assert.ok(first.answer.includes(share), "The answer did not include the measured top share.");
    const second = await ask(page, "请接着用中文回答：该地区有多少家企业？仅凭企业数量，会触发刚才的隐藏规则吗？请列出数量门槛，数字用阿拉伯数字。", 2);
    assert.match(second.answer, /[\u3400-\u9fff]/);
    assert.ok(second.answer.includes(String(cell.n)) && second.answer.includes(String(lab.rules.minCount)));
    if (process.argv.includes("--screenshot")) await page.screenshot({ path: "docs/assistant-workbench.png" });
    console.log("Two public model calls returned grounded answers and visible citations.");
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
