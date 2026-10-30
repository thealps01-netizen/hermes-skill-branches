# AGENTS.md — skill-branches

Native Hermes plugin with a desktop page that edits the branch file. `__init__.py` registers one cache-safe system-prompt section
(`skill-branches.tree`, the branch list, rendered once per new session) and one `pre_llm_call` hook (a
one-sentence directive on every turn). `branches.py` loads and validates the branch file and renders
both texts; `inspect()` is the one validation, shared by the hook and the page. `dashboard/plugin_api.py`
serves `GET /tree` (that inspection, plus the enabled plugin skills from Hermes' plugin manager) and
`POST /change` (one edit, through `branches.change()`) to `desktop/plugin.js`, the page; the other
skills come from the host SDK.
`skills/setup/SKILL.md` is the bundled guided-setup skill (`skill-branches:setup`), registered in
`__init__.py`; the page's missing-file banner asks the assistant to load it.
`README.md` explains behaviour, the file format and limits.

## Setup (fresh checkout)
- Python 3.11+, standard library only. No `pip install`.
- Node 20+; run `npm ci` once in `tests/` (React and jsdom, pinned to the core desktop app's versions).
- The branch file lives at `<hermes home>/plugin-data/skill-branches/branches.json`; the setup skill
  writes it with the user, or copy `branches.example.json` there and edit it. Unit tests do not need it.

## Validation (run all after any change; each must pass)
```bash
PYTHONUTF8=1 python -m unittest discover -s tests
node tests/render_check.mjs
<core python with FastAPI> tests/api_check.py   # the Python that runs the Hermes gateway
hermes plugins validate "$(cygpath -m "$PWD")"
hermes plugins doctor "$(cygpath -m "$PWD")"
```
`hermes plugins validate` must end with `Validation passed.` and show no new warning.

## Rules
- A chat turn must never fail or wait because of this plugin: every failure returns no text.
- A swallowed failure leaves exactly one `logger.warning` line starting with `skill-branches: `,
  naming the reason and the exception class only; never `str(exc)` or file content.
- The plugin never loads a skill itself and never forces a whole branch into context; it only asks the
  model to choose.
- Nothing from the author's own setup is a default: `branches.example.json`, code, docs and tests use
  neutral names. The owner's tree is data in the plugin data folder, never in the repo.
- The branch file is read as UTF-8; Turkish text must survive.
- A new rule gets a unit test that fails on the old behaviour first.
- Develop only in this checkout. Never edit the installed copy under `<hermes home>/plugins/`.
- Agent-read text (code, comments, docs) is English; the page's copy is English too (the app has no
  other locale) and lives in the `en` bundle.
- The page calls `GET /tree` and `POST /change` only and toggles nothing; it stores nothing (it
  removes the old `seen` key). Every edit opens a popover that previews the branch after the change;
  only its main button posts the change, with the `rev` the page was drawn from.
- `branches.change()` is the only writer: one change per call, refused when `rev` differs from the
  file on disk, validated with the same rules as `inspect()`, a byte-equal backup in `backups/`
  (last 10) before an atomic replace, the file's own line endings and one line per branch kept, and
  every field it does not edit preserved. No backup, no write.
- Only "Set up with the assistant" (missing file) goes through a chat: `host.newChat`, then
  `composer.insertText('new', …)` with a bounded wait; older apps: the open chat box; then the
  clipboard.
- Page styling uses only the app's `--ui-*` tokens and font; one colour per branch, on shapes only;
  no text under 12px; one animation, off under `prefers-reduced-motion`. `render_check.mjs` locks these.
- The setup skill carries only general, measured lessons; never the author's branches or skill names.
- A change to the directive or section wording is re-measured with the routing test (README →
  Measurement) before release.

## Ship
Push `main` to `github.com/thealps01-netizen/hermes-skill-branches` (owner's yes first), then install
pinned: `hermes plugins install thealps01-netizen/hermes-skill-branches --force --ref <40-char commit> --enable`.
Bump `version` in `plugin.yaml` and `dashboard/manifest.json` for every release. The page and its
`/tree` route appear after the desktop app restarts. Native hooks load per process: new code runs in
sessions started after the install; `--enable` reloads the running gateway.
