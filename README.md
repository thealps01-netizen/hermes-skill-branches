# skill-branches

A native Hermes plugin that helps the model load the right skills. Models often skip a matching skill
on simple tasks: a coding-rules skill is ignored for "fix this bug" because the model can do the fix
without it. Rewording the skill's description did not fix that in our measurement; asking the model,
on every turn, to name the area of the request first did.

## What it does

- **Once per session:** adds a "Skill branches" section to the system prompt, one line per branch:
  name, one-line description, skill names.
- **Every turn:** adds one sentence asking the model to name the branch the message belongs to (or
  `none`) before its first tool call, then load with `skill_view` the skills of that branch that apply.
- It never loads a skill itself; the model picks within the branch.
- **Desktop page:** a "Skill branches" row in the app's sidebar opens a read-only view: the branches
  and their skills, every other installed skill as a seed grouped by folder (a plugin's skills in a
  folder named after the plugin), a tile map of all of them, and search over names and descriptions. It warns when the branch file is invalid (routing
  is off), missing, or has fields routing ignores (such as nested branches), marks branch skills
  that are not installed, and lists skills that arrived since the branch file last changed.
- **Adding skills by hand:** each branch ends with "Add a skill to <branch>", and each seed row has
  "Add to a branch" (shown on hover or keyboard focus). Both put a request into the chat box; you
  send it, the assistant shows the change before and after, and writes it only after you approve.
  The page itself never writes a file.
- **Guided setup:** ships one skill, `skill-branches:setup`. When the branch file is missing the
  page offers "Set up with the assistant", which puts a request to load it into the chat box. The
  assistant lists your installed skills, asks what work you do, shows a draft file with a reason per
  branch, and writes it only after you approve; then it checks the file and gives you a test message.
  In any chat you can also ask the assistant to set up or change your skill branches.

## Branch file

`<hermes home>/plugin-data/skill-branches/branches.json`. The setup skill writes it with you; the
format, for reading or hand-editing:

```json
{"group": "Example", "branches": [
  {"name": "code", "description": "Any change to non-game source code.", "skills": ["example-coding-rules"]}
]}
```

- Missing file: the plugin adds nothing. Invalid file: adds nothing and logs one warning.
- One level only: a branch holds skill names, not other branches. A `branches` list in place of
  `skills` makes the file invalid; one beside `skills` is ignored. The desktop page shows both.
  Research on tool routing found an extra selection level hurts at this size (each level is a
  chance to pick wrong with no way back), so nesting is worth re-measuring only past about 20–30
  branches or when branch descriptions overlap.
- Chats do not check skill names against installed skills: a wrong name makes `skill_view` answer
  "not found" and the model moves on. The desktop page marks such names as not installed.
- The section is frozen when a session starts (Hermes keeps the system prompt stable for caching);
  file edits reach new sessions. The per-turn sentence re-reads the file every turn.

## Limits

- The model can still ignore the instruction; the rate is what the measurement below reports.
- Per-turn cost: the directive is about 250 characters, injected into every user turn, uncached.
- The app's skill list has no plugin skills (`plugin:skill` names), so the page asks Hermes' plugin
  manager for them (`list_plugin_skill_metadata`, the source the chat's skill index uses). That is
  an internal Hermes API: if it changes, the page logs one warning and shows only the app's list,
  and a plugin skill on a branch then shows as not installed. Chats are not affected.
- The setup skill's one-line entry joins the skill index of every session (about 20 tokens); its
  body loads only when setup is asked for. On a Hermes without plugin skills, routing still works
  and only guided setup is missing (one warning in the log).

## Measurement

20 one-shot sessions, no skill pinned through `skills.auto_load`, Claude Opus, 2026-10-29. Ten code
requests (fix, feature, script, tests, new app) should load the coding-rules skill; ten non-code
requests (game engine change, weekly plan, explaining code, a concept question, a Word document)
should not.

| Setup | Code requests loading it | Non-code requests leaving it out |
|---|---|---|
| Description reworded, no plugin | 2/10 | 10/10 |
| This plugin | 10/10 | 10/10 |

Short sessions with no skill load used about 2,200 more input tokens with the plugin (129,172 →
131,338 for the same two-call request). Multi-turn sessions were not measured.
