const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium, webkit, devices } = require('playwright');

const siteRoot = path.resolve(__dirname, '../web');
const prefix = '/magnitude-lab/';
const money = n => n === null ? 'Withheld' : new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0
}).format(n);
const percent = n => n == null ? '—' : (n * 100).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + '%';
const filterNames = { dataset: 'Dataset', level: 'Geography', metric: 'Statistic', method: 'Release method' };
const methodNames = { raw: 'Reference only', suppress: 'Primary suppression', perturb: 'Perturbation', combined: 'Combined' };
const fixture = name => fs.readFile(path.join(siteRoot, 'data', name), 'utf8').then(JSON.parse);

async function startServer() {
  const contentTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = http.createServer(async (request, res) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(siteRoot, pathname.slice(prefix.length) || 'index.html');
    if (!pathname.startsWith(prefix) || !file.startsWith(siteRoot + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return { base: 'http://127.0.0.1:' + server.address().port + prefix, close: () => new Promise(resolve => server.close(resolve)) };
}

async function openTab(page, name, heading) {
  await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation').locator('[aria-current=page]').innerText(), name);
}

async function setFilters(page, dataset, view) {
  for (const [key, name] of Object.entries(filterNames)) {
    const value = key === 'dataset' ? dataset.id : view[key];
    const select = page.getByRole('combobox', { name, exact: true });
    if (await select.inputValue() !== value) await select.selectOption(value);
  }
}

async function noOverflow(page) {
  const sizes = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
  assert.ok(sizes[1] <= sizes[0] + 1, 'Page overflows horizontally at ' + sizes.join(' -> ') + ': ' + page.url());
}

async function rows(table) {
  return table.locator('tbody tr').evaluateAll(items => items.map(tr =>
    Array.from(tr.cells, td => td.textContent.trim().replace(/\s+/g, ' '))));
}

async function verifyCsv(page, dataset, view) {
  // Chromium limits bursts of downloads from a single origin. Pace this automated sweep.
  await delay(175);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export table', exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), ['magnitude-lab', dataset.id, view.level, view.metric, view.method].join('-') + '.csv');
  const data = await fs.readFile(await download.path(), 'utf8');
  const header = ['dataset','level','metric','method','area_id','area','contributors','top_share','reference_gbp','release_gbp','flagged','status'];
  const parsed = data.trimEnd().split(/\r?\n/).map(line =>
    Array.from(line.matchAll(/"((?:[^"]|"")*)"(?=,|$)/g), match => match[1].replaceAll('""', '"')));
  assert.deepEqual(parsed.shift(), header);
  assert.equal(parsed.length, view.cells.length);
  view.cells.forEach((c, index) => assert.deepEqual(parsed[index], [
    dataset.id, view.level, view.metric, view.method, c.id, c.label, String(c.n), String(c.dominance),
    String(c.raw), c.value === null ? '' : String(c.value), String(c.flag), c.value === null ? 'withheld' : 'published'
  ]));
}

async function checkWorkbench(page, dataset, view) {
  await setFilters(page, dataset, view);
  const audit = page.getByRole('table', { name: 'Cell audit for the current view' });
  const actual = await rows(audit);
  assert.equal(actual.length, view.cells.length);
  for (const [i, c] of view.cells.entries()) {
    assert.deepEqual(actual[i], [c.label + ' ' + c.id, String(c.n), percent(c.dominance), money(c.raw), money(c.value), c.flag ? 'Flagged' : 'Unflagged']);
  }
  if (view.summary.flagged === 0) {
    assert.ok((await page.locator('.metrics').innerText()).includes('No flagged cells in this view'));
  }
  const chosen = view.cells.find(c => c.value === null) || view.cells.at(-1);
  const tile = page.getByRole('group', { name: 'Select an area' }).getByRole('button', { name: 'Inspect ' + chosen.label });
  await tile.click();
  assert.equal(await tile.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.cellread').innerText(), new RegExp(chosen.label));
  assert.ok((await page.locator('.cellread').innerText()).includes(money(chosen.value)));
  await verifyCsv(page, dataset, view);
  await noOverflow(page);
}

async function checkValidation(page, dataset, view, validation) {
  await setFilters(page, dataset, view);
  const matches = rec => rec.dataset === dataset.id && rec.level === view.level && rec.metric === view.metric;
  const expected = validation.results.filter(matches);
  const table = page.getByRole('table', { name: 'Validation across independent populations' });
  const actual = await rows(table);
  assert.equal(actual.length, expected.length);
  for (const result of expected) {
    const cells = actual.find(row => row[0].startsWith(methodNames[result.method]));
    assert.ok(cells, result.method);
    assert.equal(cells[0].includes('Selected'), result.method === view.method,
      'Selected method (' + cells[0] + ') for requested ' + view.method + ' at ' + page.url());
    assert.equal(cells[1], result.released + ' / ' + result.cells);
    assert.equal(cells[2], percent(result.wape));
    assert.equal(cells[3], result.flagged ? result.closeFlagged + ' / ' + result.flagged : 'None flagged');
    assert.deepEqual(cells.slice(-2), [percent(result.neighbourCoverage), percent(result.orderRetention)]);
  }
  const spatial = validation.spatial.results.find(matches);
  const independent = expected.find(row => row.method === 'perturb');
  const flagged = row => row.flagged ? row.closeFlagged + ' / ' + row.flagged : 'None flagged';
  const pairedTable = page.getByRole('table', { name: 'Paired spatial perturbation experiment' });
  assert.deepEqual(await rows(pairedTable), [
    ['Independent draws', independent], ['Region-shared draws', spatial]
  ].map(([label, r]) => [label, percent(r.wape), r.preservedPairs + ' / ' + r.comparablePairs, flagged(r)]));
  const sensitivity = validation.sensitivity.filter(r => matches(r) && r.method === view.method);
  const sweep = page.getByRole('table', { name: 'Perturbation amplitude sweep' });
  if (sensitivity.length) {
    const sweepRows = await rows(sweep);
    assert.equal(sweepRows.length, sensitivity.length);
    for (const r of sensitivity) {
      const row = sweepRows.find(values => values[0] === '±' + percent(r.amplitude));
      assert.equal(row[1], percent(r.wape));
    }
  } else {
    assert.equal(await sweep.count(), 0);
  }
  await noOverflow(page);
}

async function guideExamples(page, interfaces) {
  const cases = page.getByRole('combobox', { name: 'Release profile', exact: true });
  const historic = page.getByRole('table', { name: 'Historic public census counts' });
  assert.deepEqual(await rows(historic), interfaces.counts.map(c => [c.label, c.count.toLocaleString('en-GB')]));
  for (const [profile, example] of Object.entries(interfaces.releaseExamples)) {
    await cases.selectOption(profile);
    const table = page.getByRole('table', { name: 'Synthetic release projection' });
    assert.deepEqual(await rows(table), example.rows.map(r => [r.area, money(r.estimate), r.status]));
  }
  await noOverflow(page);
}

async function navigation(page, base, mobile) {
  await page.goto(base + '#tab=workbench&dataset=earnings&level=district&metric=mean&method=combined&cell=D01');
  const chosen = page.locator('#tile-D01');
  await chosen.waitFor();
  assert.equal(await chosen.getAttribute('aria-pressed'), 'true');
  assert.ok((await page.locator('.cellread').innerText()).includes('Withheld'));

  if (!mobile) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Skip to workspace');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
    const reached = new Set();
    for (let i = 0; i < 65; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement.id);
      reached.add(id);
      if (reached.has('share')) break;
    }
    for (const id of ['export','select-dataset','select-level','select-metric','select-method','tile-D01','share']) {
      assert.ok(reached.has(id), 'Control unreachable by keyboard: ' + id);
    }
    await page.getByRole('combobox', { name: 'Release method' }).focus();
    await page.keyboard.press('r');
    assert.equal(await page.getByRole('combobox', { name: 'Release method' }).inputValue(), 'raw');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'select-method');
    await page.keyboard.press('c');
  }
  const district = page.locator('#tile-D02');
  if (mobile) await district.tap(); else await district.click();
  const shareUrl = page.url();
  if (!mobile) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
    await page.getByRole('button', { name: 'Copy view link' }).click();
    await page.getByText('View link copied.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), shareUrl);
  }
  assert.equal(new URLSearchParams(new URL(shareUrl).hash.slice(1)).get('cell'), 'D02');
  await openTab(page, 'Validation', 'Validation results');
  await page.goBack();
  await page.getByRole('heading', { name: 'Release workbench' }).waitFor();
  assert.equal(page.url(), shareUrl);
  await page.reload();
  await district.waitFor();
  assert.equal(await district.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('combobox', { name: 'Dataset' }).inputValue(), 'earnings');
  assert.equal(await page.getByRole('combobox', { name: 'Release method' }).inputValue(), 'combined');

  const newPage = await page.context().newPage();
  try {
    await newPage.goto(shareUrl);
    await newPage.locator('#tile-D02[aria-pressed=true]').waitFor();
    assert.equal(await newPage.getByRole('combobox', { name: 'Statistic' }).inputValue(), 'mean');
  } finally {
    await newPage.close();
  }
}

async function responsiveWidths(page, base) {
  await page.goto(base + '#tab=workbench&dataset=earnings&level=district&metric=mean&method=suppress');
  await page.getByRole('heading', { name: 'Release workbench' }).waitFor();
  for (const width of [320, 375, 390, 768, 820, 1024, 1440]) {
    await page.setViewportSize({ width, height: 860 });
    await noOverflow(page);
    const clipped = await page.getByRole('group', { name: 'Experiment settings' }).locator('select').evaluateAll(selects =>
      selects.filter(select => {
        const css = getComputedStyle(select);
        const measure = document.createElement('canvas').getContext('2d');
        measure.font = [css.fontWeight, css.fontSize, css.fontFamily].join(' ');
        const available = select.clientWidth - parseFloat(css.paddingRight) - parseFloat(css.paddingLeft);
        return measure.measureText(select.selectedOptions[0].text).width > available + 1;
      }).map(select => select.id));
    assert.deepEqual(clipped, [], 'Clipped filter text at ' + width + 'px');
  }
}

async function testProfile(engine, options, mobile, base, lab, interfaces) {
  const browser = await engine.launch();
  const context = await browser.newContext({ ...options, acceptDownloads: true });
  context.setDefaultTimeout(10000);
  const errors = [];
  context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  let page = await context.newPage();
  const name = mobile ? 'WebKit iPhone 13' : 'Chromium desktop';
  try {
    await navigation(page, base, mobile);
    let count = 0;
    for (const dataset of lab.datasets) {
      for (const view of dataset.views) {
        try {
          await checkWorkbench(page, dataset, view);
        } catch (error) {
          error.message = name + ' workbench ' + (count + 1) + ' of 32 (' + [dataset.id, view.level, view.metric, view.method].join('/') + '): ' + error.message;
          throw error;
        }
        count++;
      }
    }
    await openTab(page, 'Validation', 'Validation results');
    // Start the second bulk sweep from a shared URL in a fresh tab. A single WebKit
    // document limits history mutations during bursts of automated control changes.
    const validationUrl = page.url();
    await page.close();
    page = await context.newPage();
    await page.goto(validationUrl);
    await page.getByRole('heading', { name: 'Validation results' }).waitFor();
    for (const dataset of lab.datasets) {
      for (const view of dataset.views) await checkValidation(page, dataset, view, lab.validation);
    }
    await openTab(page, 'Field guide', 'Field guide');
    await guideExamples(page, interfaces);
    await page.getByRole('link', { name: 'Open turnover scenario' }).click();
    await page.getByRole('heading', { name: 'Release workbench' }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Dataset' }).inputValue(), 'turnover');
    if (!mobile) await responsiveWidths(page, base);
    assert.deepEqual(errors, []);
    console.log(name + ': ' + count + ' workbench configurations, CSV downloads and validation configurations passed.');
  } finally {
    await browser.close();
  }
}

async function main() {
  const lab = await fixture('lab.json');
  const interfaces = await fixture('interfaces.json');
  const host = process.env.BASE_URL ? { base: process.env.BASE_URL, close: () => {} } : await startServer();
  try {
    console.log('Verifying ' + host.base);
    await testProfile(chromium, { viewport: { width: 1440, height: 900 } }, false, host.base, lab, interfaces);
    await testProfile(webkit, devices['iPhone 13'], true, host.base, lab, interfaces);
  } finally {
    await host.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
