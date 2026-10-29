"""skill-branches: load the branch tree and render the prompt text."""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


TOP_KEYS = ("group", "branches")
BRANCH_KEYS = ("name", "description", "skills")


def _branch_problem(branch):
    if not isinstance(branch, dict):
        return "must be an object with name, description and skills."
    if not (isinstance(branch.get("name"), str) and branch["name"].strip()):
        return '"name" must be a non-empty text.'
    if not isinstance(branch.get("description"), str):
        return '"description" must be a text.'
    if not (isinstance(branch.get("skills"), list)
            and all(isinstance(s, str) and s.strip() for s in branch["skills"])):
        return '"skills" must be a list of skill names.'
    return None


def _label(index, branch):
    name = branch.get("name") if isinstance(branch, dict) else None
    return f'Branch {index} ("{name.strip()}")' if isinstance(name, str) and name.strip() else f"Branch {index}"


def _check(data):
    if not isinstance(data, dict) or not isinstance(data.get("branches"), list):
        return 'The file must have a "branches" list.'
    for i, branch in enumerate(data["branches"], 1):
        problem = _branch_problem(branch)
        if problem:
            return f"{_label(i, branch)}: {problem}"
    return None


def inspect(path):
    path = Path(path)
    info = {"state": "missing", "problem": None, "error": None, "group": "", "branches": [], "ignored": [],
            "modified": None, "path": str(path)}
    if not path.is_file():
        return info
    try:
        info["modified"] = path.stat().st_mtime
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return dict(info, state="invalid", error=type(exc).__name__,
                    problem=f"Not valid JSON at line {exc.lineno}, column {exc.colno}.")
    except (OSError, UnicodeDecodeError) as exc:
        return dict(info, state="invalid", error=type(exc).__name__, problem="The file could not be read as UTF-8 text.")
    problem = _check(data)
    if problem:
        return dict(info, state="invalid", error="ValueError", problem=problem)
    items = data["branches"]
    ignored = [f'"{k}"' for k in data if k not in TOP_KEYS]
    ignored += [f'Branch "{b["name"].strip()}": "{k}"' for b in items for k in b if k not in BRANCH_KEYS]
    group = data.get("group")
    return dict(info, state="ok", group=group.strip() if isinstance(group, str) else "", ignored=ignored,
                branches=[{"name": b["name"].strip(), "description": b["description"].strip(),
                           "skills": [s.strip() for s in b["skills"]]} for b in items])


def load(path):
    info = inspect(path)
    if info["state"] == "invalid":
        logger.warning("skill-branches: branch file is invalid and was ignored (%s)", info["error"])
        return None
    return info["branches"] if info["state"] == "ok" else None


def render_section(branch_list):
    if not branch_list:
        return ""
    lines = [f"- {b['name']}: {b['description']} Skills: {', '.join(b['skills'])}" for b in branch_list]
    return "Skill branches\n" + "\n".join(lines)


def render_directive(branch_list):
    if not branch_list:
        return ""
    names = ", ".join(b["name"] for b in branch_list)
    return ("Skill branches: before your first tool call, name the branch this message belongs to "
            f"({names}) or 'none'. If one fits, load with skill_view the skills of that branch "
            "that apply to this task; the 'Skill branches' section lists them.")
