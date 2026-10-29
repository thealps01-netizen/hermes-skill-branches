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
    return {k: v for k, v in info.items() if k != "error"}


@router.get("/tree")
async def tree():
    return tree_payload()
