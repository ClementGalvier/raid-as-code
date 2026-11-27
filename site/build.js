#!/usr/bin/env node
// Builds the static RAID dashboard: reads every YAML entry under ../raid and
// writes site/dist/index.html (+ styles.css). Plain HTML/CSS plus a small
// inline script for the search, status filter and type tabs. No framework.
//
// Usage: node site/build.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const RAID_DIR = path.join(ROOT, 'raid');
const OUT_DIR = path.join(__dirname, 'dist');

// Where "New item" sends people: GitHub's "create file" page in /raid.
const NEW_ITEM_URL = 'https://github.com/ClementGalvier/raid-as-code/new/main/raid';

// Display order and folder matching (same rules as validate.js).
const GROUPS = [
  { key: 'risk', label: 'Risks', letter: 'R', question: 'What could impact delivery?', match: /^risks?\b/i },
  { key: 'action', label: 'Actions', letter: 'A', question: 'What needs doing, and by whom?', match: /^actions?\b/i },
  { key: 'issue', label: 'Issues', letter: 'I', question: 'What needs solving now?', match: /^issues?\b/i },
  { key: 'decision', label: 'Decisions', letter: 'D', question: 'What have we agreed, and why?', match: /^decisions?\b/i },
];

// Status -> colour. Anything not listed is grey (and not counted as green/amber/red).
const STATUS_TONE = {
  open: 'red',
  accepted: 'amber',
  'in-progress': 'amber',
  pending: 'amber',
  mitigated: 'green',
  closed: 'green',
  resolved: 'green',
  done: 'green',
};
const KNOWN_STATUSES = ['open', 'accepted', 'mitigated', 'closed'];

const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const pad2 = (n) => String(n).padStart(2, '0');
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function loadEntries() {
  const entries = [];
  for (const sub of fs.readdirSync(RAID_DIR, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    const group = GROUPS.find((g) => g.match.test(sub.name));
    if (!group) continue;
    const dir = path.join(RAID_DIR, sub.name);
    for (const name of fs.readdirSync(dir)) {
      if (!/\.ya?ml$/i.test(name)) continue;
      const data = yaml.load(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (!data || typeof data !== 'object') continue;
      const status = String(data.status ?? 'unknown').trim().toLowerCase();
      entries.push({
        group: group.key,
        id: String(data.id ?? ''),
        title: String(data.title ?? ''),
        owner: String(data.owner ?? ''),
        status,
        tone: STATUS_TONE[status] || 'grey',
      });
    }
  }
  const order = (e) => GROUPS.findIndex((g) => g.key === e.group);
  entries.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return entries;
}

// ---------- page sections ----------

function renderSidebar(total) {
  return `
    <aside class="sidebar">
      <a class="brand" href="#top"><span class="brand__mark">R</span><span class="brand__name">raid</span></a>

      <nav class="nav" aria-label="Main">
        <p class="nav__label">Project workspace</p>
        <a class="nav__item is-active" href="#top" aria-current="page">Overview <span class="nav__count">${pad2(total)}</span></a>
        <a class="nav__item" href="#register">RAID register</a>
        <span class="nav__item is-disabled" aria-disabled="true">Projects</span>
        <span class="nav__item is-disabled" aria-disabled="true">Reports</span>

        <hr class="nav__rule" />

        <p class="nav__label">Workspace</p>
        <span class="nav__item is-disabled" aria-disabled="true">Team members</span>
        <span class="nav__item is-disabled" aria-disabled="true">Settings</span>
      </nav>

      <div class="sidebar__note">
        <p class="sidebar__note-title">Clarity, not complexity.</p>
        <p>Keep risks and decisions in one shared view.</p>
      </div>

      <div class="sidebar__footer">
        <span class="avatar" aria-hidden="true">PM</span>
        <span><strong>Project workspace</strong><br /><small>Project management</small></span>
      </div>
    </aside>`;
}

function renderStats(entries) {
  const count = (tone) => entries.filter((e) => e.tone === tone).length;
  const cards = [
    { tone: 'brand', label: 'Total items', value: entries.length, note: 'Across your RAID register' },
    { tone: 'green', label: 'Green status', value: count('green'), note: 'Items marked green' },
    { tone: 'amber', label: 'Amber status', value: count('amber'), note: 'Items marked amber' },
    { tone: 'red', label: 'Red status', value: count('red'), note: 'Items marked red' },
  ];
  return `
        <section class="stats" aria-label="Summary">${cards
          .map(
            (c) => `
          <article class="card stat">
            <p class="stat__label">${c.label}</p>
            <span class="stat__dot stat__dot--${c.tone}" aria-hidden="true"></span>
            <p class="stat__value">${pad2(c.value)}</p>
            <p class="stat__note">${c.note}</p>
          </article>`,
          )
          .join('')}
        </section>`;
}

function renderRow(e) {
  return `
              <tr class="row" data-group="${e.group}" data-status="${escapeHtml(e.status)}">
                <td class="col-id"><span class="tone-bar tone-bar--${e.tone}" aria-hidden="true"></span>${escapeHtml(e.id)}</td>
                <td class="col-title">${escapeHtml(e.title)}</td>
                <td class="col-status"><span class="badge badge--${e.tone}">${escapeHtml(capitalise(e.status))}</span></td>
                <td class="col-owner">${escapeHtml(e.owner)}</td>
              </tr>`;
}

function renderRegister(entries, builtAt) {
  const statuses = [...new Set([...KNOWN_STATUSES, ...entries.map((e) => e.status)])];
  const tabs = [{ key: 'all', label: 'All items' }, ...GROUPS];
  return `
        <section class="card register" id="register" aria-labelledby="register-title">
          <div class="register__head">
            <div>
              <h2 id="register-title" class="register__title">RAID register <span class="pill">${entries.length} item${entries.length === 1 ? '' : 's'}</span></h2>
              <p class="muted">Track and manage every project consideration.</p>
            </div>
            <div class="register__controls">
              <label class="visually-hidden" for="search">Search</label>
              <input id="search" class="input" type="search" placeholder="Search items" autocomplete="off" />
              <label class="visually-hidden" for="status-filter">Filter by status</label>
              <select id="status-filter" class="input select">
                <option value="">Filter by status</option>${statuses
                  .map((s) => `
                <option value="${escapeHtml(s)}">${escapeHtml(capitalise(s))}</option>`)
                  .join('')}
              </select>
            </div>
          </div>

          <div class="tabs" role="tablist" aria-label="Item type">${tabs
            .map(
              (t, i) => `
            <button class="tab" role="tab" type="button" data-group="${t.key}" aria-selected="${i === 0}" aria-controls="register-table">${t.label}</button>`,
            )
            .join('')}
          </div>

          <div class="table-wrap">
            <table class="table" id="register-table">
              <thead>
                <tr><th scope="col" class="col-id">ID</th><th scope="col" class="col-title">Title</th><th scope="col" class="col-status">Status</th><th scope="col" class="col-owner">Owner</th></tr>
              </thead>
              <tbody>${entries.map(renderRow).join('')}
                <tr class="row row--empty" hidden><td colspan="4">No items match these filters.</td></tr>
              </tbody>
            </table>
          </div>

          <div class="register__foot">
            <p id="showing" aria-live="polite">Showing all ${entries.length} items</p>
            <p>Your shared source of project clarity · Built ${builtAt} UTC</p>
          </div>
        </section>`;
}

function renderFramework() {
  return `
        <section class="framework" aria-labelledby="framework-title">
          <h2 id="framework-title">A framework for moving forward</h2>
          <p class="muted">Four perspectives. One complete picture.</p>
          <div class="framework__grid">${GROUPS.map(
            (g) => `
            <article class="card framework__card">
              <h3><span class="letter" aria-hidden="true">${g.letter}</span>${g.label}</h3>
              <p class="muted">${g.question}</p>
            </article>`,
          ).join('')}
          </div>
        </section>`;
}

// Search, status filter and tabs. Every row is in the HTML, so without JS the
// page still shows the full register.
const SCRIPT = `
  (function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.row[data-group]'));
    var empty = document.querySelector('.row--empty');
    var search = document.getElementById('search');
    var status = document.getElementById('status-filter');
    var showing = document.getElementById('showing');
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    var group = 'all';

    function apply() {
      var q = search.value.trim().toLowerCase();
      var s = status.value;
      var shown = 0;
      rows.forEach(function (r) {
        var ok = (group === 'all' || r.dataset.group === group) &&
                 (!s || r.dataset.status === s) &&
                 (!q || r.textContent.toLowerCase().indexOf(q) !== -1);
        r.hidden = !ok;
        if (ok) shown++;
      });
      empty.hidden = shown !== 0;
      showing.textContent = shown === rows.length
        ? 'Showing all ' + rows.length + ' items'
        : 'Showing ' + shown + ' of ' + rows.length + ' items';
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        group = t.dataset.group;
        tabs.forEach(function (o) { o.setAttribute('aria-selected', String(o === t)); });
        apply();
      });
    });
    search.addEventListener('input', apply);
    status.addEventListener('change', apply);
  })();`;

function renderPage(entries) {
  const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RAID Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body id="top">
    <div class="layout">${renderSidebar(entries.length)}

      <div class="main">
        <header class="topbar">
          <nav class="crumbs" aria-label="Breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>Overview</strong></nav>
          <p class="topbar__types">${GROUPS.map((g) => g.label).join(' · ')}</p>
        </header>

        <main class="content">
          <div class="page-head">
            <div>
              <h1>RAID Dashboard</h1>
              <p class="muted">A clear view of what matters. Keep your project moving forward.</p>
            </div>
            <a class="button" href="${NEW_ITEM_URL}" target="_blank" rel="noopener">+ New item</a>
          </div>
${renderStats(entries)}
${renderRegister(entries, builtAt)}
${renderFramework()}
        </main>
      </div>
    </div>
    <script>${SCRIPT}
    </script>
  </body>
</html>
`;
}

function main() {
  const entries = loadEntries();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderPage(entries));
  fs.copyFileSync(path.join(__dirname, 'styles.css'), path.join(OUT_DIR, 'styles.css'));
  console.log(`Built ${path.relative(ROOT, path.join(OUT_DIR, 'index.html'))} with ${entries.length} entries.`);
}

main();
