"""skill-branches: checkpoints. Before a named tool or command runs, ask once for skills not loaded yet."""
import json
import re
import threading
from fnmatch import fnmatchcase
from collections import OrderedDict

SKILL_TOOL = "skill_view"
# Arguments that carry shell or script text: a terminal call's command, a script tool's code.
COMMAND_ARGS = ("command", "code")
# Words of a command checkpoint must follow each other inside one simple command.
_SEPARATOR = re.compile(r"[|;&\n]")


def _word(word):
    return re.compile(r"(?<![\w-])" + re.escape(word) + r"(?![\w-])")


# One pass per piece: a pattern with gaps between the words backtracks for seconds on a long line.
def _in_order(words, text):
    for piece in _SEPARATOR.split(text):
        end = 0
        for word in words:
            found = word.search(piece, end)
            if not found:
                break
            end = found.end()
        else:
            return True
    return False


def matches(before, tool_name, args, where=None):
    """True when the call is the one `before` names.

    One word names a tool and matches that tool only. Two or more words name a command and match
    when they appear in that order inside one simple command of the call's command or script text.
    `where` narrows the match: every named argument must be a text matching its pattern (`*` wildcards,
    letter case ignored).
    """
    args = args if isinstance(args, dict) else {}
    for name, pattern in (where or {}).items():
        value = args.get(name)
        if not isinstance(value, str) or not fnmatchcase(value.lower(), pattern.lower()):
            return False
    words = before.split()
    if len(words) < 2:
        return tool_name == before
    words = [_word(w) for w in words]
    return any(isinstance(args.get(a), str) and _in_order(words, args[a]) for a in COMMAND_ARGS)


def loaded_names(args, result):
    """Names a finished skill load counts under: the name asked for and the name the host returned.

    Empty when the load failed or its result cannot be read.
    """
    try:
        data = json.loads(result)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, dict) or data.get("success") is not True:
        return []
    asked = args.get("name") if isinstance(args, dict) else None
    names = [n.strip() for n in (asked, data.get("name")) if isinstance(n, str) and n.strip()]
    return list(dict.fromkeys(names))


def _key(point):
    return (point["before"], tuple(sorted(point.get("where", {}).items())), tuple(point["skills"]))


class Gate:
    """Remembers, per session, which skills were loaded and which checkpoints already asked.

    A checkpoint asks at most once per session, so a skill that cannot be loaded never causes a loop.
    forget() starts a session over: after a compaction the loaded skills are no longer in the model's context.
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

    def loaded(self, session_id, names):
        names = [n for n in names if isinstance(n, str) and n]
        if session_id and names:
            with self._lock:
                self._entry(session_id)[0].update(names)

    def forget(self, session_id):
        with self._lock:
            self._state.pop(session_id, None)

    def decide(self, points, tool_name, args, session_id):
        """Return the text that replaces the call's result, or None to let the call run."""
        if not session_id or not points or tool_name == SKILL_TOOL:
            return None
        hit = [p for p in points if matches(p["before"], tool_name, args, p.get("where"))]
        if not hit:
            return None
        with self._lock:
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
