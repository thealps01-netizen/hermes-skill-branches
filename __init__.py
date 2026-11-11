"""skill-branches: each turn, ask the model to name a skill branch and load its applicable skills."""
import logging
from pathlib import Path

from . import branches, checkpoints

logger = logging.getLogger(__name__)
SECTION_ID = "skill-branches.tree"
SETUP_SKILL = Path(__file__).resolve().parent / "skills" / "setup" / "SKILL.md"


def _tree_path():
    from plugins.plugin_storage import plugin_data_dir
    return Path(plugin_data_dir("skill-branches")) / "branches.json"


def _section(_info):
    try:
        return branches.render_section(branches.load(_tree_path()) or [])
    except Exception as exc:
        logger.warning("skill-branches: section skipped (%s)", type(exc).__name__)
        return ""


def _pre_llm_call(**_):
    try:
        text = branches.render_directive(branches.load(_tree_path()) or [])
    except Exception as exc:
        logger.warning("skill-branches: directive skipped (%s)", type(exc).__name__)
        return None
    return {"context": text} if text else None


_gate = checkpoints.Gate()


# Fails open: a call is only ever held by a checkpoint from the owner's file, never by an error here.
def _pre_tool_call(tool_name="", args=None, session_id="", **_):
    try:
        message = _gate.decide(branches.load_checkpoints(_tree_path()), tool_name, args, session_id)
    except Exception as exc:
        logger.warning("skill-branches: checkpoint skipped (%s)", type(exc).__name__)
        return None
    if not message:
        return None
    logger.info("skill-branches: checkpoint held one %s call", tool_name)
    return {"action": "block", "message": message}


def _description(path):
    for line in path.read_text(encoding="utf-8").replace("\r\n", "\n").split("\n---\n", 1)[0].splitlines()[1:]:
        key, _, value = line.partition(":")
        if key.strip() == "description":
            return value.strip().strip('"')
    return ""


def register(ctx):
    ctx.register_system_prompt_section(SECTION_ID, _section, position="after_memory", max_chars=4000)
    ctx.register_hook("pre_llm_call", _pre_llm_call)
    ctx.register_hook("pre_tool_call", _pre_tool_call)
    try:  # hosts without plugin skills keep routing; only the guided setup is missing
        ctx.register_skill("setup", SETUP_SKILL, _description(SETUP_SKILL))
    except Exception as exc:
        logger.warning("skill-branches: setup skill not registered (%s)", type(exc).__name__)
