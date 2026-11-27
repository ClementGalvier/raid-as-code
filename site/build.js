#!/usr/bin/env node
// Builds the static RAID dashboard: reads every YAML entry under ../raid and
// writes site/dist/index.html (+ styles.css). Plain HTML/CSS, no framework.
//
// Usage: node site/build.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const RAID_DIR = path.join(ROOT, 'raid');
const OUT_DIR = path.join(__dirname, 'dist');

// Display order and folder matching (same rules as validate.js).
const GROUPS = [
  { key: 'risk', label: 'Risks', match: /^risks?\b/i },
  { key: 'action', label: 'Actions', match: /^actions?\b/i },
  { key: 'issue', label: 'Issues', match: /^issues?\b/i },
  { key: 'decision', label: 'Decisions', match: /^decisions?\b/i },
];

// Status -> badge colour. Anything not listed gets the neutral grey badge.
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

const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function loadEntries() {
  const groups = new Map(GROUPS.map((g) => [g.key, []]));
  for (const sub of fs.readdirSync(RAID_DIR, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    const group = GROUPS.find((g) => g.match.test(sub.name));
    if (!group) continue;
    const dir = path.join(RAID_DIR, sub.name);
    for (const name of fs.readdirSync(dir)) {
      if (!/\.ya?ml$/i.test(name)) continue;
      const data = yaml.load(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (data && typeof data === 'object') groups.get(group.key).push(data);
    }
  }
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  }
  return groups;
}

function renderRow(e) {
  const status = String(e.status ?? 'unknown').trim();
  const tone = STATUS_TONE[status.toLowerCase()] || 'grey';
  return `
          <tr class="row">
            <td class="col-status"><span class="badge badge--${tone}">${escapeHtml(status)}</span></td>
            <td class="col-title">${escapeHtml(e.title)}</td>
            <td class="col-owner">${escapeHtml(e.owner)}</td>
            <td class="col-id">${escapeHtml(e.id)}</td>
          </tr>`;
}

function renderGroup(group, entries) {
  const body = entries.length
    ? entries.map(renderRow).join('')
    : `
          <tr class="row row--empty"><td colspan="4">No ${group.label.toLowerCase()} recorded.</td></tr>`;
  return `
      <section class="group" aria-labelledby="h-${group.key}">
        <h2 id="h-${group.key}" class="group__title">${group.label} <span class="group__count">${entries.length}</span></h2>
        <table class="raid-table">
          <colgroup><col class="c-status" /><col class="c-title" /><col class="c-owner" /><col class="c-id" /></colgroup>
          <thead>
            <tr>${['Status', 'Title', 'Owner', 'ID'].map((h) => `<th scope="col"><span class="visually-hidden">${h}</span></th>`).join('')}</tr>
          </thead>
          <tbody>${body}
          </tbody>
        </table>
      </section>`;
}

function renderPage(groups) {
  const built = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RAID Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="page">
      <header class="page__header">
        <h1>RAID Dashboard</h1>
        <p class="page__meta">Built ${built} UTC from /raid</p>
      </header>
${GROUPS.map((g) => renderGroup(g, groups.get(g.key))).join('\n')}
    </main>
  </body>
</html>
`;
}

function main() {
  const groups = loadEntries();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderPage(groups));
  fs.copyFileSync(path.join(__dirname, 'styles.css'), path.join(OUT_DIR, 'styles.css'));
  const total = [...groups.values()].reduce((n, l) => n + l.length, 0);
  console.log(`Built ${path.relative(ROOT, path.join(OUT_DIR, 'index.html'))} with ${total} entries.`);
}

main();
