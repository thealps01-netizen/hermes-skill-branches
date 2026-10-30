"""skill-branches: load the branch tree and render the prompt text."""
import hashlib
import json
import logging
import os
import re
import shutil
import threading
import time
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
            "modified": None, "rev": None, "path": str(path)}
    if not path.is_file():
        return info
    try:
        info["modified"] = path.stat().st_mtime
        raw = path.read_bytes()
        info["rev"] = _rev(raw)
        data = json.loads(raw.decode("utf-8"))
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


# Panel edits. One change per call, refused when the file differs from the copy the page showed
# (`rev`), validated with the same rules as load(), backed up before the write, written atomically.
BACKUPS = 10
NAME_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,31}")
STALE = "The branch file changed since this page loaded. The page now shows the current file; try again."
INVALID = "The branch file is invalid. Fix it before editing it here."
UNKNOWN = "The panel sent a change this version does not know."
BAD_NAME = "A branch name uses lowercase letters, digits and dashes (up to 32), starting with a letter or digit."
NO_DESCRIPTION = "Say when the branch applies; the assistant reads this to pick it."
NO_SKILLS = "Pick at least one skill."
BAD_SKILL = "Each skill appears once, as a one-line name."
WRITE_FAILED = "The branch file could not be written. Nothing was changed."
_lock = threading.Lock()


def _rev(raw):
    return hashlib.sha256(raw).hexdigest()[:16]


def _skill(value):
    return value.strip() if isinstance(value, str) and value.strip() and len(value) <= 200 \
        and not any(ord(c) < 32 for c in value) else None


def _find(items, name):
    name = name.strip() if isinstance(name, str) else ""
    return next((b for b in items if b["name"].strip() == name), None), name


def _name_problem(items, name, keep=None):
    if not isinstance(name, str) or not NAME_RE.fullmatch(name.strip()):
        return BAD_NAME
    if any(b is not keep and b["name"].strip().lower() == name.strip().lower() for b in items):
        return f'A branch named "{name.strip()}" already exists.'
    return None


def _description(value):
    return value.strip() if isinstance(value, str) and value.strip() and len(value.strip()) <= 300 else None


def _apply(data, req):
    items, op = data["branches"], req.get("op")
    if op == "create":
        problem = _name_problem(items, req.get("name"))
        if problem:
            return problem
        desc = _description(req.get("description"))
        if not desc:
            return NO_DESCRIPTION
        skills = req.get("skills")
        if not isinstance(skills, list) or not skills:
            return NO_SKILLS
        names = [_skill(s) for s in skills]
        if None in names or len(set(names)) != len(names):
            return BAD_SKILL
        items.append({"name": req["name"].strip(), "description": desc, "skills": names})
        return None
    if op not in ("add", "remove", "edit", "delete"):
        return UNKNOWN
    branch, name = _find(items, req.get("branch"))
    if branch is None:
        return f'There is no branch "{name}".'
    if op == "delete":
        items.remove(branch)
    elif op == "edit":
        problem = _name_problem(items, req.get("name"), keep=branch)
        if problem:
            return problem
        desc = _description(req.get("description"))
        if not desc:
            return NO_DESCRIPTION
        branch["name"], branch["description"] = req["name"].strip(), desc
    else:
        skill = _skill(req.get("skill"))
        if not skill:
            return BAD_SKILL
        current = [s.strip() for s in branch["skills"]]
        if op == "add" and skill in current:
            return f"{skill} is already on {name}."
        if op == "remove" and skill not in current:
            return f"{skill} is not on {name}."
        branch["skills"] = current + [skill] if op == "add" else [s for s in current if s != skill]
    return None


def _dump(data, newline):
    def value(key, v):
        if key == "branches" and v:
            rows = [f"    {json.dumps(b, ensure_ascii=False)}" for b in v]
            return "[" + newline + ("," + newline).join(rows) + newline + "  ]"
        return json.dumps(v, ensure_ascii=False)
    body = ("," + newline).join(f"  {json.dumps(k, ensure_ascii=False)}: {value(k, v)}" for k, v in data.items())
    return ("{" + newline + body + newline + "}" + newline).encode("utf-8")


def _backup(path, raw):
    folder = path.parent / "backups"
    folder.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S") + f"-{time.time_ns() % 1_000_000_000:09d}"
    shutil.copyfile(path, folder / f"{path.stem}-{stamp}{path.suffix}")
    if (folder / f"{path.stem}-{stamp}{path.suffix}").read_bytes() != raw:
        raise OSError("backup differs")
    for old in sorted(folder.glob(f"{path.stem}-*{path.suffix}"))[:-BACKUPS]:
        old.unlink()


def change(path, req):
    if not isinstance(req, dict):
        return {"ok": False, "problem": UNKNOWN}
    path = Path(path)
    with _lock:
        raw = path.read_bytes() if path.is_file() else None
        if req.get("rev") != (_rev(raw) if raw is not None else None):
            return {"ok": False, "problem": STALE}
        if raw is None:
            data, newline = {"branches": []}, "\n"
        else:
            info = inspect(path)
            if info["state"] != "ok":
                return {"ok": False, "problem": INVALID}
            data = json.loads(raw.decode("utf-8"))
            newline = "\r\n" if b"\r\n" in raw else "\n"
        problem = _apply(data, req)
        if problem:
            return {"ok": False, "problem": problem}
        try:
            if raw is not None:
                _backup(path, raw)
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(path.name + ".tmp")
            tmp.write_bytes(_dump(data, newline))
            os.replace(tmp, path)
        except OSError as exc:
            logger.warning("skill-branches: branch file not written (%s)", type(exc).__name__)
            return {"ok": False, "problem": WRITE_FAILED}
    return {"ok": True, "problem": None}


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
