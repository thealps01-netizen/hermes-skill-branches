# AGENTS.md — skill-branches

Native Hermes plugin (hooks only, no UI). `__init__.py` registers one cache-safe system-prompt section
(`skill-branches.tree`, the branch list, rendered once per new session) and one `pre_llm_call` hook (a
one-sentence directive on every turn). `branches.py` loads and validates the branch file and renders
both texts. `README.md` explains behaviour, the file format and limits.

## Setup (fresh checkout)
- Python 3.11+, standard library only. No `pip install`.
- The branch file lives at `<hermes home>/plugin-data/skill-branches/branches.json`; copy
  `branches.example.json` there and edit it. Unit tests do not need it.

## Validation (run all after any change; each must pass)
```bash
PYTHONUTF8=1 python -m unittest discover -s tests
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
- Agent-read text (code, comments, docs) is English.
- A change to the directive or section wording is re-measured with the routing test (README →
  Measurement) before release.

## Ship
Push `main` to `github.com/thealps01-netizen/hermes-skill-branches` (owner's yes first), then install
pinned: `hermes plugins install thealps01-netizen/hermes-skill-branches --force --ref <40-char commit> --enable`.
Bump `version` in `plugin.yaml` for every release. Native hooks load per process: new code runs in
sessions started after the install; `--enable` reloads the running gateway.
