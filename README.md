# RAID-as-Code

A Risk/Action/Issue/Decision log stored as version-controlled, schema-validated
files instead of a spreadsheet — built to explore treating project governance
like code.

## Why

Spreadsheet RAID logs have no enforced structure, no audit trail, and no way
to catch a missing owner or deadline before it becomes a real problem. Here,
every entry is a YAML file; every change is a Git commit; every pull request
is automatically checked.

## How it works

- `raid/{risks-raid,actions-raid,issues-raid,decisions-raid}/` — one YAML file per entry
- `validate.js` — checks every entry has required fields (id, title, status,
  owner, date) and that no id is duplicated
- `.github/workflows/validate.yml` — runs validation on every push and pull
  request; a broken entry fails the check before it can merge
- `site/build.js` — reads the validated entries and generates a static
  dashboard (`site/dist/index.html`)

## Adding an entry

Create a new YAML file in the right folder following the existing schema,
commit, and push. Validation runs automatically.

## Live dashboard

https://clementgalvier.github.io/raid-as-code/

## Stack

Node.js, Zod, js-yaml, GitHub Actions, plain HTML/CSS. Designed in Figma.