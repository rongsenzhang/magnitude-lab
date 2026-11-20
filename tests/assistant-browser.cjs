const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit, devices } = require('playwright');

const prefix = '/magnitude-lab/';
const site = path.resolve(__dirname, '../web');
const trialAnswer = 'This synthetic area has a withheld estimate.';
const source = { id: 'methods', label: 'Method definitions', url: 'https://github.com/rongsenzhang/magnitude-lab/blob/v1.0.0/docs/methods.md' };

async function startHost() {
  const types = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css' };
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(site, pathname.slice(prefix.length) || 'index.html');
    if (!pathname.startsWith(prefix) || !file.startsWith(site + path.sep)) return res.writeHead(404).end();
    try {
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return { base: 'http://127.0.0.1:' + server.address().port + prefix, close: () => new Promise(resolve => server.close(resolve)) };
}

async function startPanel(page, base, configured) {
  // Intercept configuration and transport even on a deployed site. CI never bills a provider.
  await page.route('**/assistant-config.json', route => route.fulfill({ json: { endpoint: configured ? new URL('test-api', base).href : '' } }));
  await page.goto(base + '#tab=workbench&dataset=earnings&level=district&metric=mean&method=combined&cell=D01');
  await page.getByRole('heading', { name: 'Release workbench' }).waitFor();
  const toggle = page.getByRole('button', { name: configured ? 'Ask the research assistant' : 'Explore research evidence' });
  await toggle.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await page.locator('[aria-controls=assistant-window]').getAttribute('aria-expanded'), 'true');
  return dialog;
}

async function preview(page, base) {
  const dialog = await startPanel(page, base, false);
  await dialog.getByText(/live ai activation is pending/i).waitFor();
  await dialog.getByRole('heading', { name: 'Screening Mossbank' }).waitFor();
  assert.equal(await dialog.getByRole('textbox').count(), 0);
  await dialog.getByRole('button', { name: 'Compare neighbouring areas' }).click();
  assert.match(await dialog.locator('.assistant-evidence').innerText(), /independent/i);
  await dialog.getByRole('button', { name: 'Explain the selected area' }).click();
  await dialog.getByRole('button', { name: 'Close research panel' }).click();
  await page.locator('#tile-D02').click();
  await page.getByRole('button', { name: 'Explore research evidence' }).click();
  await dialog.getByRole('heading', { name: 'Screening Alder Vale' }).waitFor();
  assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]), [390, 390]);
}

async function liveContract(page, base) {
  const payloads = [];
  let failure = null;
  await page.route('**/test-api/chat', async route => {
    assert.equal(route.request().method(), 'POST');
    payloads.push(route.request().postDataJSON());
    if (failure) return route.fulfill({ status: failure.status, json: { code: failure.code, error: 'Test error' } });
    await route.fulfill({ json: { answer: trialAnswer + ' <script>example</script>',
      citations: [source, { id: 'bad', label: 'Untrusted link', url: 'javascript:alert(1)' }] } });
  });

  const dialog = await startPanel(page, base, true);
  const composer = dialog.getByRole('textbox', { name: 'Your question' });
  const send = dialog.getByRole('button', { name: 'Send', exact: true });
  assert.ok(await send.isDisabled());
  assert.equal(await composer.getAttribute('maxlength'), '700');
  await composer.fill('Why is this value withheld?');
  await send.click();
  await dialog.getByText(trialAnswer + ' <script>example</script>', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('link', { name: source.label }).getAttribute('href'), source.url);
  assert.equal(await dialog.getByRole('link', { name: 'Untrusted link' }).count(), 0);
  assert.equal(await dialog.locator('script').count(), 0);
  assert.deepEqual(payloads[0], { question: 'Why is this value withheld?', history: [],
    context: { dataset: 'earnings', level: 'district', metric: 'mean', method: 'combined', cell: 'D01' } });

  await dialog.getByRole('button', { name: 'Close research panel' }).click();
  await page.getByRole('combobox', { name: 'Geography' }).selectOption('region');
  await page.locator('#tile-R02').click();
  await page.getByRole('button', { name: 'Ask the research assistant' }).click();
  await dialog.getByText(/Current view.*R02/).waitFor();
  await composer.fill('How does the regional result compare?');
  await send.click();
  await dialog.locator('.assistant-turn').nth(1).waitFor();
  assert.equal(payloads[1].history.length, 2);
  assert.equal(payloads[1].history[0].role, 'user');
  assert.match(payloads[1].history[0].content, /Mossbank \(D01\).*\nWhy is this value withheld\?/);
  assert.deepEqual(payloads[1].history[1], { role: 'assistant', content: trialAnswer + ' <script>example</script>' });
  assert.equal(payloads[1].context.level, 'region');
  assert.equal(payloads[1].context.cell, 'R02');

  await page.reload();
  await page.getByRole('button', { name: 'Ask the research assistant' }).click();
  assert.equal(await dialog.locator('.assistant-turn').count(), 2);
  failure = { status: 429, code: 'quota_exhausted' };
  await composer.fill('Compare the methods.');
  await send.click();
  await dialog.getByRole('status').filter({ hasText: 'usage limit' }).waitFor();
  assert.equal(await composer.inputValue(), 'Compare the methods.');
  assert.equal(await dialog.locator('.assistant-turn').count(), 2);
  assert.ok(await send.isEnabled());
  const recorded = dialog.getByRole('region', { name: 'Recorded workbench evidence' });
  await recorded.getByRole('heading', { name: 'Screening North East' }).waitFor();
  for (const [code, message] of [
    ['ungrounded_answer', 'could not be verified'],
    ['model_unavailable', 'OpenAI service is temporarily unavailable']
  ]) {
    failure = { status: 502, code };
    const callsBefore = payloads.length;
    await send.click();
    await dialog.getByRole('status').filter({ hasText: message }).waitFor();
    assert.equal(await composer.inputValue(), 'Compare the methods.');
    assert.equal(await dialog.locator('.assistant-turn').count(), 2);
    assert.equal(payloads.length, callsBefore + 1);
    assert.equal(payloads.at(-1).history.length, 4);
    assert.match(await recorded.innerText(), /North East \(R02\)/);
    assert.equal(await recorded.getByRole('link', { name: 'Method definitions and results' }).getAttribute('href'), source.url);
  }
  failure = null;
  await send.click();
  await dialog.locator('.assistant-turn').nth(2).waitFor();
  assert.ok(await recorded.isHidden());
  assert.equal(payloads.at(-1).history.length, 4);
  await dialog.getByRole('button', { name: 'Clear chat' }).click();
  assert.equal(await dialog.locator('.assistant-turn').count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('magnitude-lab:assistant:1')), null);
  await dialog.getByRole('button', { name: 'Close research panel' }).focus();
  await page.keyboard.press('Escape');
  assert.ok(await dialog.isHidden());
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-expanded')), 'false');
}

async function run() {
  const host = process.env.ASSISTANT_BASE_URL ? { base: process.env.ASSISTANT_BASE_URL, close() {} } : await startHost();
  try {
    const desktop = await chromium.launch();
    try {
      const page = await desktop.newPage({ viewport: { width: 1440, height: 900 } });
      await liveContract(page, host.base);
    } finally { await desktop.close(); }
    const mobile = await webkit.launch();
    try {
      const page = await mobile.newPage(devices['iPhone 13']);
      await preview(page, host.base);
    } finally { await mobile.close(); }
    console.log('Desktop two-turn transport, storage, context changes, source filtering, error recovery and mobile deterministic preview passed.');
  } finally { await host.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
