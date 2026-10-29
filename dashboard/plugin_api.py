import importlib.util
import logging
import sys
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()
_MODULE = "skill_branches_panel_branches"


def _branches():
    if _MODULE not in sys.modules:
        spec = importlib.util.spec_from_file_location(_MODULE, Path(__file__).resolve().parents[1] / "branches.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sys.modules[_MODULE] = module
    return sys.modules[_MODULE]


def _tree_path():
    from plugins.plugin_storage import plugin_data_dir
    return Path(plugin_data_dir("skill-branches")) / "branches.json"


def tree_payload(path=None):
    try:
        info = _branches().inspect(path or _tree_path())
    except Exception as exc:
        logger.warning("skill-branches: panel could not check the branch file (%s)", type(exc).__name__)
        info = {"state": "invalid", "problem": "The branch file could not be checked.", "group": "",
                "branches": [], "ignored": [], "modified": None, "path": str(path or "")}
    payload = {k: v for k, v in info.items() if k != "error"}
    payload["plugin_skills"] = _plugin_skills()
    return payload


def _plugin_skills():
    try:
        from hermes_cli.config import load_config
        from hermes_cli.plugins import discover_plugins, get_plugin_manager
        from hermes_cli.skills_config import get_disabled_skills
        discover_plugins()
        disabled = get_disabled_skills(load_config())
        rows = get_plugin_manager().list_plugin_skill_metadata()
    except Exception as exc:
        logger.warning("skill-branches: panel could not list plugin skills (%s)", type(exc).__name__)
        return []
    names = [(str(r.get("name") or ""), str(r.get("description") or "")) for r in rows]
    return [{"name": n, "description": d, "category": n.split(":", 1)[0]}
            for n, d in names if ":" in n and n not in disabled]


@router.get("/tree")
async def tree():
    return tree_payload()
