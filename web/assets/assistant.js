import { evidenceFor, intents } from './evidence.js';

const panel = document.getElementById('assistant-panel');
const storageKey = 'magnitude-lab:assistant:1';
const questionLimit = 700;
const defaults = { dataset: 'turnover', level: 'district', metric: 'sum', method: 'perturb' };
const labels = {
  dataset: { turnover: 'Business turnover', earnings: 'Household earnings' },
  level: { district: 'District', region: 'Region' },
  metric: { sum: 'Annual total', mean: 'Annual mean' },
  method: { raw: 'Reference only', suppress: 'Primary suppression', perturb: 'Perturbation', combined: 'Combined' }
};
const sourceHosts = new Set(['cantabular.com', 'docs.cantabular.com', 'www.nisra.gov.uk',
  'www.ons.gov.uk', 'iuk-ktp.org.uk', 'hr.apps.qub.ac.uk', 'www.qub.ac.uk']);

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function button(text, className) {
  const node = element('button', className, text);
  node.type = 'button';
  return node;
}

function sourceUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (url.hostname === 'github.com' && url.pathname.startsWith('/rongsenzhang/magnitude-lab/')) return url.href;
    if (url.hostname === 'rongsenzhang.github.io' && url.pathname.startsWith('/magnitude-lab/')) return url.href;
    return sourceHosts.has(url.hostname) ? url.href : null;
  } catch { return null; }
}

function links(sources) {
  const group = element('ul', 'assistant-sources');
  group.setAttribute('aria-label', 'Sources');
  for (const item of Array.isArray(sources) ? sources.slice(0, 8) : []) {
    const url = sourceUrl(item?.url);
    if (!url || typeof item.label !== 'string') continue;
    const link = element('a', '', item.label.slice(0, 160));
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const entry = element('li');
    entry.append(link);
    group.append(entry);
  }
  return group;
}

function chatUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || (local && url.protocol === 'http:'))) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/chat') ? path : path + '/chat';
    return url.href;
  } catch { return null; }
}

function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (!Array.isArray(saved)) return [];
    return saved.filter(turn => typeof turn?.question === 'string' && typeof turn?.answer === 'string'
      && typeof turn?.view === 'string' && Array.isArray(turn?.citations)).slice(-12);
  } catch { return []; }
}

function save(turns) {
  try {
    if (turns.length) sessionStorage.setItem(storageKey, JSON.stringify(turns));
    else sessionStorage.removeItem(storageKey);
  } catch { /* The current conversation also works with session storage disabled. */ }
}

function pastMessages(turns) {
  const messages = [];
  let chars = 0;
  for (const turn of [...turns].reverse().slice(0, 3)) {
    const user = { role: 'user', content: ('View: ' + turn.view + '\n' + turn.question).slice(0, 2000) };
    const assistant = { role: 'assistant', content: turn.answer.slice(0, 2000) };
    chars += user.content.length + assistant.content.length;
    if (chars > 7800) break;
    messages.unshift(user, assistant);
  }
  return messages;
}

function contextNow(lab) {
  const params = new URLSearchParams(location.hash.slice(1));
  const context = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = document.querySelector('[data-select="' + key + '"]')?.value ?? params.get(key);
    context[key] = Object.hasOwn(labels[key], value) ? value : fallback;
  }
  const activeCell = document.querySelector('.tile[aria-pressed="true"]')?.dataset.cell;
  const requested = activeCell || params.get('cell');
  const view = lab.datasets.find(d => d.id === context.dataset).views.find(v =>
    v.level === context.level && v.metric === context.metric && v.method === context.method);
  const selected = view.cells.find(c => c.id === requested) || view.cells.reduce((a, b) => a.raw > b.raw ? a : b);
  context.cell = selected.id;
  const viewText = Object.keys(defaults).map(key => labels[key][context[key]]).concat(selected.label + ' (' + selected.id + ')').join(' · ');
  return { context, viewText };
}

async function loadJson(file) {
  const response = await fetch(new URL(file, document.baseURI), { credentials: 'omit' });
  if (!response.ok) throw new Error('Resource unavailable');
  return response.json();
}

async function mount() {
  if (!panel) return;
  const [configResult, labResult] = await Promise.allSettled([loadJson('./assistant-config.json'), loadJson('./data/lab.json')]);
  const endpoint = configResult.status === 'fulfilled' ? chatUrl(configResult.value?.endpoint) : null;
  const lab = labResult.status === 'fulfilled' ? labResult.value : null;
  const live = Boolean(endpoint && lab);
  const session = live ? restore() : [];
  let pending = null;
  let busy = false;
  let intent = 'cell';

  const launcher = button(live ? 'Ask the research assistant' : 'Explore research evidence', 'assistant-launcher');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'assistant-window');
  launcher.setAttribute('aria-haspopup', 'dialog');
  const windowEl = element('dialog', 'assistant-dialog');
  windowEl.id = 'assistant-window';
  windowEl.setAttribute('aria-labelledby', 'assistant-heading');
  const heading = element('h2', '', live ? 'Research assistant' : 'Research evidence');
  heading.id = 'assistant-heading';
  const close = button('Close', 'assistant-close');
  close.setAttribute('aria-label', 'Close research panel');
  const header = element('div', 'assistant-head');
  header.append(heading, close);
  const contextLabel = element('p', 'assistant-context');
  const body = element('div', 'assistant-body');
  const transcript = element('div', 'assistant-transcript');
  transcript.setAttribute('role', 'log');
  transcript.setAttribute('aria-label', 'Conversation');
  transcript.setAttribute('aria-live', 'polite');
  const indication = element('p', 'assistant-status');
  indication.setAttribute('role', 'status');
  const form = element('form', 'assistant-form');
  const question = element('textarea');
  question.id = 'assistant-question';
  question.maxLength = questionLimit;
  question.rows = 2;
  const questionLabel = element('label', '', 'Your question');
  questionLabel.htmlFor = question.id;
  const submit = element('button', 'assistant-send', 'Send');
  submit.type = 'submit';
  const clear = button('Clear chat', 'assistant-clear');
  const note = element('p', 'assistant-note', 'OpenAI receives your question, recent conversation and current public demo view. This tab keeps the conversation for the session.');
  const controls = element('div', 'assistant-controls');
  controls.append(clear, submit);
  form.append(questionLabel, question, controls);
  const suggestions = element('div', 'assistant-suggestions');
  suggestions.setAttribute('role', 'group');
  const preview = element('div', 'assistant-evidence');
  panel.append(launcher, windowEl);
  windowEl.append(header, contextLabel, body, indication);

  function current() { return contextNow(lab); }

  function appendTurn(turn) {
    const item = element('article', 'assistant-turn');
    item.append(element('strong', '', 'You'), element('p', 'assistant-text', turn.question),
      element('small', 'assistant-stamp', turn.view), element('strong', '', 'Research assistant'),
      element('p', 'assistant-text', turn.answer), links(turn.citations));
    transcript.append(item);
  }

  function refreshContext() {
    if (!lab || !windowEl.open) return;
    const { context, viewText } = current();
    contextLabel.textContent = 'Current view · ' + viewText;
    if (live) return;
    const card = evidenceFor(intent, { lab, ...context });
    const list = element('ul', 'assistant-facts');
    for (const fact of card.facts) list.append(element('li', '', fact));
    preview.replaceChildren(element('h3', '', card.title), element('p', '', card.summary), list, links(card.sources));
    for (const choice of suggestions.querySelectorAll('button')) choice.setAttribute('aria-pressed', String(choice.dataset.intent === intent));
  }

  function syncControls() {
    submit.disabled = busy || !question.value.trim();
    question.readOnly = busy;
    clear.disabled = busy || !session.length;
    transcript.setAttribute('aria-busy', String(busy));
  }

  if (live) {
    for (const turn of session) appendTurn(turn);
    suggestions.setAttribute('aria-label', 'Suggested questions');
    for (const prompt of ['Why is this area flagged or unflagged?', 'How does this compare with validation?']) {
      const choice = button(prompt, 'assistant-suggestion');
      choice.addEventListener('click', () => {
        if (busy) return;
        question.value = prompt;
        syncControls();
        question.focus();
      });
      suggestions.append(choice);
    }
    body.append(suggestions, transcript);
    windowEl.append(form, note);
    question.addEventListener('input', syncControls);
    clear.addEventListener('click', () => {
      session.length = 0;
      save(session);
      transcript.replaceChildren();
      question.value = '';
      indication.textContent = 'Conversation cleared.';
      syncControls();
      question.focus();
    });
    syncControls();
  } else {
    const state = lab ? 'Live AI activation is pending. Explore the recorded evidence for the selected view.'
      : 'The evidence dataset could not be loaded. Reload the page to try again.';
    body.append(element('p', 'assistant-note', state));
    if (lab) {
      suggestions.setAttribute('aria-label', 'Evidence topics');
      for (const topic of intents) {
        const choice = button(topic.label, 'assistant-suggestion');
        choice.dataset.intent = topic.id;
        choice.addEventListener('click', () => { intent = topic.id; refreshContext(); });
        suggestions.append(choice);
      }
      body.append(suggestions, preview);
    }
  }

  function closePanel() {
    windowEl.close();
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }
  close.addEventListener('click', closePanel);
  launcher.addEventListener('click', () => {
    if (windowEl.open) { closePanel(); return; }
    windowEl.show();
    launcher.setAttribute('aria-expanded', 'true');
    refreshContext();
    close.focus();
  });
  windowEl.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closePanel(); }
  });
  // The workbench renders controls and selected cells synchronously after hash or history changes.
  const app = document.getElementById('app');
  if (app) new MutationObserver(refreshContext).observe(app, { childList: true, subtree: true });
  window.addEventListener('hashchange', refreshContext);
  window.addEventListener('popstate', refreshContext);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = question.value.trim();
    if (!live || busy || !message || message.length > questionLimit) return;
    const { context, viewText } = current();
    busy = true;
    indication.textContent = 'Researching your question…';
    syncControls();
    pending = new AbortController();
    const timeout = setTimeout(() => pending?.abort(), 55000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' }, signal: pending.signal,
        body: JSON.stringify({ question: message, history: pastMessages(session), context })
      });
      if (!response.ok) {
        const messages = { 400: 'Check your question and current view, then try again.',
          403: 'This site is not authorised to use the live assistant.', 413: 'Shorten your question and try again.',
          422: 'The available evidence did not support an answer. Try a more specific question about this view.',
          429: 'The public demo has reached its usage limit. Please try again later.',
          502: 'The assistant could not produce an answer from the evidence. Please try again.',
          503: 'The live assistant is temporarily unavailable.', 504: 'The assistant timed out. Please try again.' };
        throw new Error(messages[response.status] || 'The assistant is unavailable. Please try again.');
      }
      const result = await response.json().catch(() => null);
      if (typeof result?.answer !== 'string' || !result.answer.trim() || !Array.isArray(result.citations)) {
        throw new Error('The service returned an incomplete answer. Please try again.');
      }
      const turn = { question: message, view: viewText, answer: result.answer.trim().slice(0, 2500), citations: result.citations.slice(0, 8) };
      session.push(turn);
      if (session.length > 12) session.shift();
      save(session);
      if (transcript.childElementCount >= 12) transcript.firstElementChild.remove();
      appendTurn(turn);
      question.value = '';
      indication.textContent = 'Answer received.';
      body.scrollTop = body.scrollHeight;
    } catch (error) {
      if (error.name === 'AbortError') indication.textContent = 'The assistant timed out. Your question is ready to retry.';
      else if (error instanceof TypeError) indication.textContent = 'Could not reach the live assistant. Your question is ready to retry.';
      else indication.textContent = error.message;
    } finally {
      clearTimeout(timeout);
      pending = null;
      busy = false;
      syncControls();
    }
  });
}
mount();
