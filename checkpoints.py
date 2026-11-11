"""skill-branches: checkpoints. Before a named tool or command runs, ask once for skills not loaded yet."""
import re
import threading
from fnmatch import fnmatchcase
from collections import OrderedDict

SKILL_TOOL = "skill_view"
# Words of a command checkpoint must follow each other inside one simple command.
_SAME_COMMAND = r"[^|;&\n]*?"


def _word(word):
    return r"(?<![\w-])" + re.escape(word) + r"(?![\w-])"


def matches(before, tool_name, args, where=None):
    """True when `before` is the tool's exact name, or its words appear in order in the call's command text.

    `where` narrows the match: every named argument must be a text matching its pattern (`*` wildcards,
    letter case ignored).
    """
    args = args if isinstance(args, dict) else {}
    for name, pattern in (where or {}).items():
        value = args.get(name)
        if not isinstance(value, str) or not fnmatchcase(value.lower(), pattern.lower()):
            return False
    if tool_name == before:
        return True
    command = args.get("command")
    if not isinstance(command, str):
        return False
    return re.search(_SAME_COMMAND.join(_word(w) for w in before.split()), command) is not None


def _key(point):
    return (point["before"], tuple(sorted(point.get("where", {}).items())))


class Gate:
    """Remembers, per session, which skills were requested and which checkpoints already asked.

    A checkpoint asks at most once per session, so a skill that cannot be loaded never causes a loop.
    State lives in memory: after a process restart a checkpoint may ask once more.
    """

    def __init__(self, limit=500):
        self._limit = limit
        self._state = OrderedDict()  # session id -> (loaded skill names, checkpoints that asked)
        self._lock = threading.Lock()

    def sessions(self):
        return list(self._state)

    def _entry(self, session_id):
        entry = self._state.setdefault(session_id, (set(), set()))
        self._state.move_to_end(session_id)
        while len(self._state) > self._limit:
            self._state.popitem(last=False)
        return entry

    def decide(self, points, tool_name, args, session_id):
        """Return the text that replaces the call's result, or None to let the call run."""
        if not session_id or not points:
            return None
        with self._lock:
            if tool_name == SKILL_TOOL:
                name = args.get("name") if isinstance(args, dict) else None
                if isinstance(name, str) and name.strip():
                    self._entry(session_id)[0].add(name.strip())
                return None
            hit = [p for p in points if matches(p["before"], tool_name, args, p.get("where"))]
            if not hit:
                return None
            loaded, asked = self._entry(session_id)
            missing = []
            for point in hit:
                if _key(point) in asked:
                    continue
                asked.add(_key(point))
                missing += [s for s in point["skills"] if s not in loaded and s not in missing]
        if not missing:
            return None
        names = ", ".join(f"'{s}'" for s in missing)
        return (f"This call was not run. Before it, load the skill{'s' if len(missing) > 1 else ''} {names} "
                "with skill_view, then repeat the same call.")
