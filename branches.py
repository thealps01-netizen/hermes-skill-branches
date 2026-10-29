"""skill-branches: load the branch tree and render the prompt text."""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _valid(branch):
    return (isinstance(branch, dict)
            and isinstance(branch.get("name"), str) and branch["name"].strip()
            and isinstance(branch.get("description"), str)
            and isinstance(branch.get("skills"), list)
            and all(isinstance(s, str) and s.strip() for s in branch["skills"]))


def load(path):
    path = Path(path)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        items = data.get("branches") if isinstance(data, dict) else None
        if not isinstance(items, list) or not all(_valid(b) for b in items):
            raise ValueError("unexpected shape")
    except Exception as exc:
        logger.warning("skill-branches: branch file is invalid and was ignored (%s)", type(exc).__name__)
        return None
    return [{"name": b["name"].strip(), "description": b["description"].strip(),
             "skills": [s.strip() for s in b["skills"]]} for b in items]


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
