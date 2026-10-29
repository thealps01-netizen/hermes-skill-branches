---
name: setup
description: "Use when setting up or changing skill branches. Guided."
version: 0.3.0
author: Muhammed Enes Alpler
license: MIT
---

# Set up skill branches

Help the user create or change their skill-branches file. The user may not be a developer: ask plain questions, never ask them to edit JSON, and write nothing until they approve.

## What branches are for

Each turn the plugin asks the model to name the branch a message belongs to and load that branch's skills. A branch is a hint for skills the model would otherwise skip. It is not a folder for every skill: a skill whose own description already makes the model load it when it fits needs no branch.

## The file

- Location: `plugin-data/skill-branches/branches.json` inside the Hermes home folder. The plugin's desktop page shows the full path.
- Shape: `{"group": "<label>", "branches": [{"name": "...", "description": "...", "skills": ["..."]}]}`. Other keys are ignored.
- Skill names are the names `skill_view` accepts, including `plugin:skill` names.
- Changes apply from the next new session.

## Steps

1. **Read the current state.** If the file exists, read it and propose changes to it; never replace it wholesale. List the installed skills with `skills_list`.
2. **Ask about the work.** One short question at a time: what kinds of work they do with the assistant, and which skills they have seen skipped. Their answers decide the areas; do not copy anyone else's branches.
3. **Draft a small file.**
   - One level only; no nested branches.
   - Few branches, each one area of work with a one-line description that says where it stops ("Unity and game projects, not other code").
   - In a branch, put the area's own skills that the model tends to skip.
   - A skill that holds rules for a whole kind of work (for example the user's general coding rules) goes into every branch where that kind of work happens, not into one branch only. Otherwise a task that fits one branch loses the rules kept in another.
   - Use only names that `skills_list` returned.
4. **Show the draft and ask for approval.** Show the whole file and one line per branch on why it exists. If a file already exists, show what changes, before and after. Write only after the user approves.
5. **Write and check.**
   - Read the written file back and confirm it is valid JSON and every skill name is installed.
   - Ask the user to open the Skill branches page in the desktop app. It should list each branch and mark no skill as missing.
   - Give the user one test message for a new session, matching one of their branches. The reply should start by naming that branch and loading its skills.
6. **When something is skipped later,** add that skill to the branch where it was needed, with the same draft, approve and write steps. Add a branch or skill only after a real miss, not in advance.
