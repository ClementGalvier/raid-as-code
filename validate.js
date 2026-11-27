#!/usr/bin/env node
// Validates every RAID entry under ./raid.
//
// Checks:
//   - each file parses as YAML and is a mapping
//   - required fields: id, title, type, status, owner, plus a date field
//       risks / issues    -> raised_date
//       actions           -> raised_date or due_date
//       decisions         -> raised_date or decision_date
//   - every id is unique across the whole /raid folder
//
// Exits 1 and prints every problem found; exits 0 when all files are valid.
//
// Usage: node validate.js [raidDir]   (defaults to ./raid next to this script)

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { z } = require('zod');

const RAID_DIR = path.resolve(process.argv[2] || path.join(__dirname, 'raid'));
const YAML_EXT = new Set(['.yaml', '.yml']);

// Subfolder name -> category. Matches "risks", "risks-raid", "risk", etc.
const CATEGORIES = [
  { key: 'risk', match: /^risks?\b/i, dateFields: ['raised_date'] },
  { key: 'issue', match: /^issues?\b/i, dateFields: ['raised_date'] },
  { key: 'action', match: /^actions?\b/i, dateFields: ['raised_date', 'due_date'] },
  { key: 'decision', match: /^decisions?\b/i, dateFields: ['raised_date', 'decision_date'] },
];

const requiredString = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z.string().min(1, 'must not be empty'),
);
// js-yaml turns unquoted 2026-09-15 into a Date; quoted dates stay strings.
const dateValue = z.union([
  z.date(),
  z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'must be a date (YYYY-MM-DD)'),
]);

const baseShape = {
  id: z.preprocess((v) => (typeof v === 'number' ? String(v) : v), requiredString),
  title: requiredString,
  type: requiredString,
  status: requiredString,
  owner: requiredString,
};

function schemaFor(category) {
  const dateShape = Object.fromEntries(
    category.dateFields.map((f) => [f, dateValue.nullish()]),
  );
  return z.object({ ...baseShape, ...dateShape }).passthrough();
}

// Kept outside the zod object: zod skips refinements once any field fails,
// which would hide a missing date whenever another field is also missing.
function missingDate(category, data) {
  return !category.dateFields.some((f) => data[f] != null && data[f] !== '');
}

function describeIssue(issue, data) {
  const field = issue.path.join('.') || '(root)';
  const value = issue.path.reduce((o, k) => (o == null ? o : o[k]), data);
  if (value === undefined || value === null) return `missing required field '${field}'`;
  return `invalid '${field}': ${issue.message}`;
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(full) : [full];
  });
}

function main() {
  if (!fs.existsSync(RAID_DIR)) {
    console.error(`RAID folder not found: ${RAID_DIR}`);
    process.exit(2);
  }

  const problems = new Map(); // relPath -> string[]
  const addProblem = (file, msg) => {
    if (!problems.has(file)) problems.set(file, []);
    problems.get(file).push(msg);
  };
  const idIndex = new Map(); // id -> relPath[]
  let checked = 0;

  for (const sub of fs.readdirSync(RAID_DIR, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    const category = CATEGORIES.find((c) => c.match.test(sub.name));
    const files = listFiles(path.join(RAID_DIR, sub.name));

    for (const file of files) {
      const rel = path.relative(path.dirname(RAID_DIR), file).split(path.sep).join('/');
      const ext = path.extname(file).toLowerCase();

      if (!YAML_EXT.has(ext)) {
        // Extension-less files are probably entries saved without ".yaml": flag them.
        if (ext === '') addProblem(rel, 'file has no .yaml/.yml extension');
        else continue; // ignore READMEs and other non-YAML files
      }
      if (!category) {
        addProblem(rel, `unknown RAID folder '${sub.name}' (expected risks, actions, issues or decisions)`);
        continue;
      }

      checked++;
      let data;
      try {
        data = yaml.load(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        addProblem(rel, `YAML parse error: ${err.reason || err.message}`);
        continue;
      }
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        addProblem(rel, 'file is empty or not a YAML mapping');
        continue;
      }

      const result = schemaFor(category).safeParse(data);
      if (!result.success) {
        for (const issue of result.error.issues) addProblem(rel, describeIssue(issue, data));
      }
      if (missingDate(category, data)) {
        addProblem(rel, `missing required date field '${category.dateFields.join("' or '")}'`);
      }

      const id = data.id == null ? '' : String(data.id).trim();
      if (id) {
        if (!idIndex.has(id)) idIndex.set(id, []);
        idIndex.get(id).push(rel);
      }
    }
  }

  for (const [id, files] of idIndex) {
    if (files.length < 2) continue;
    for (const f of files) {
      const others = files.filter((o) => o !== f);
      addProblem(f, `duplicate id '${id}' (also in: ${others.join(', ')})`);
    }
  }

  if (problems.size === 0) {
    console.log(`RAID validation passed: ${checked} file(s) checked, no problems.`);
    return;
  }

  console.error(`RAID validation failed: ${problems.size} file(s) with problems (${checked} checked)\n`);
  for (const [file, msgs] of [...problems].sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`✖ ${file}`);
    for (const m of msgs) console.error(`    - ${m}`);
  }
  process.exit(1);
}

main();
