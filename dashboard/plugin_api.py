import importlib.util
import logging
import threading
from pathlib import Path

from fastapi import APIRouter, Body

logger = logging.getLogger(__name__)
router = APIRouter()
_SOURCE = Path(__file__).resolve().parents[1] / "branches.py"
_loaded = None  # (the file's modification time, the module read from it)
# Each read of branches.py brings its own write lock, so reads and changes are serialised here.
_lock = threading.RLock()


# The host imports this file once per process. A plugin update replaces branches.py under it, so the
# module is read again when the file changes; otherwise the page shows the old version's answers.
def _branches():
    global _loaded
    with _lock:
        stamp = _SOURCE.stat().st_mtime_ns
        if _loaded is None or _loaded[0] != stamp:
            spec = importlib.util.spec_from_file_location("skill_branches_panel_branches", _SOURCE)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            _loaded = (stamp, module)
        return _loaded[1]


def _tree_path():
    from plugins.plugin_storage import plugin_data_dir
    return Path(plugin_data_dir("skill-branches")) / "branches.json"


def tree_payload(path=None):
    try:
        info = _branches().inspect(path or _tree_path())
    except Exception as exc:
        logger.warning("skill-branches: panel could not check the branch file (%s)", type(exc).__name__)
        info = {"state": "invalid", "problem": "The branch file could not be checked.", "group": "",
                "branches": [], "checkpoints": [], "checkpoint_problems": [], "ignored": [], "modified": None, "path": str(path or "")}
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


def change_payload(req, path=None):
    try:
        with _lock:
            return _branches().change(path or _tree_path(), req)
    except Exception as exc:
        logger.warning("skill-branches: panel change failed (%s)", type(exc).__name__)
        return {"ok": False, "problem": "The change could not be saved. Nothing was changed."}


@router.post("/change")
def change(req: dict = Body(...)):
    return change_payload(req)
