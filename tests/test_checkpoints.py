"""Unit tests for checkpoints. Run from the repo root: PYTHONUTF8=1 python -m unittest discover -s tests"""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import branches  # noqa: E402
import checkpoints  # noqa: E402

BRANCHES = [{"name": "alpha", "description": "First area.", "skills": ["skill-a"]}]
POINTS = [
    {"before": "send_helper", "skills": ["brief-rules"]},
    {"before": "vcs save", "skills": ["message-rules", "review-rules"]},
]
TREE = {"branches": BRANCHES, "checkpoints": POINTS}


def _write(tmp, data):
    p = Path(tmp) / "branches.json"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return p


def _inspect(data):
    with tempfile.TemporaryDirectory() as tmp:
        return branches.inspect(_write(tmp, data))


class FileTests(unittest.TestCase):
    def test_checkpoints_are_read_and_not_reported_as_ignored(self):
        got = _inspect(TREE)
        self.assertEqual(got["state"], "ok")
        self.assertEqual(got["checkpoints"], POINTS)
        self.assertEqual(got["ignored"], [])

    def test_a_file_without_checkpoints_has_none(self):
        got = _inspect({"branches": BRANCHES})
        self.assertEqual((got["state"], got["checkpoints"]), ("ok", []))

    def test_names_are_trimmed(self):
        got = _inspect({"branches": BRANCHES, "checkpoints": [{"before": " vcs  save ", "skills": [" s "]}]})
        self.assertEqual(got["checkpoints"], [{"before": "vcs save", "skills": ["s"]}])

    def test_a_bad_checkpoint_is_left_out_and_named_while_branches_keep_working(self):
        cases = {
            "not a list": ({"a": 1}, '"checkpoints" must be a list.'),
            "not an object": (["x"], 'Checkpoint 1: must be an object with before and skills.'),
            "empty before": ([{"before": " ", "skills": ["s"]}], 'Checkpoint 1: "before" must be a non-empty text.'),
            "no skills": ([POINTS[0], {"before": "x", "skills": []}],
                          'Checkpoint 2 ("x"): "skills" must be a non-empty list of skill names.'),
            "skill not text": ([{"before": "x", "skills": [1]}],
                               'Checkpoint 1 ("x"): "skills" must be a non-empty list of skill names.'),
        }
        for label, (value, problem) in cases.items():
            with self.subTest(label):
                got = _inspect({"branches": BRANCHES, "checkpoints": value})
                self.assertEqual((got["state"], got["problem"]), ("ok", None))
                self.assertEqual(got["checkpoint_problems"], [problem])
                self.assertEqual(got["branches"][0]["name"], "alpha")
                self.assertEqual(got["checkpoints"], [POINTS[0]] if label == "no skills" else [])

    def test_a_valid_file_has_no_checkpoint_problems(self):
        self.assertEqual(_inspect(TREE)["checkpoint_problems"], [])

    def test_load_warns_once_about_left_out_checkpoints(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(branches.logger, "warning") as warn:
            got = branches.load(_write(tmp, {"branches": BRANCHES, "checkpoints": [{"before": "x", "skills": []}]}))
        self.assertEqual(got[0]["name"], "alpha")
        self.assertEqual(warn.call_count, 1)

    def test_a_panel_edit_writes_one_checkpoint_per_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write(tmp, TREE)
            branches.change(path, {"op": "add", "branch": "alpha", "skill": "skill-z", "rev": branches.inspect(path)["rev"]})
            lines = path.read_text(encoding="utf-8").splitlines()
        self.assertEqual([l.strip().rstrip(",") for l in lines if '"before"' in l],
                         [json.dumps(p, ensure_ascii=False) for p in POINTS])

    def test_where_is_kept_and_checked(self):
        point = {"before": "save_text", "where": {"path": "*.md"}, "skills": ["s"]}
        self.assertEqual(_inspect({"branches": BRANCHES, "checkpoints": [point]})["checkpoints"], [point])
        for bad in ("x", {}, {"path": 1}, {"": "x"}):
            with self.subTest(bad):
                got = _inspect({"branches": BRANCHES, "checkpoints": [dict(point, where=bad)]})
                self.assertEqual(got["checkpoint_problems"], ['Checkpoint 1 ("save_text"): "where" must be an object of '
                                                              'argument names and patterns.'])

    def test_unknown_checkpoint_fields_are_reported(self):
        got = _inspect({"branches": BRANCHES, "checkpoints": [dict(POINTS[0], extra=1)]})
        self.assertEqual(got["ignored"], ['Checkpoint "send_helper": "extra"'])

    def test_load_checkpoints_is_empty_for_a_missing_or_invalid_file_without_a_warning(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(branches.logger, "warning") as warn:
            self.assertEqual(branches.load_checkpoints(Path(tmp) / "nope.json"), [])
            self.assertEqual(branches.load_checkpoints(_write(tmp, {"branches": BRANCHES, "checkpoints": 3})), [])
            self.assertEqual(branches.load_checkpoints(_write(tmp, {"branches": 3, "checkpoints": POINTS})), [])
            self.assertEqual(branches.load_checkpoints(_write(tmp, TREE)), POINTS)
        warn.assert_not_called()

    def test_a_panel_edit_keeps_the_checkpoints(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write(tmp, TREE)
            rev = branches.inspect(path)["rev"]
            got = branches.change(path, {"op": "add", "branch": "alpha", "skill": "skill-z", "rev": rev})
            self.assertEqual(got, {"ok": True, "problem": None})
            self.assertEqual(branches.inspect(path)["checkpoints"], POINTS)


class MatchTests(unittest.TestCase):
    def test_a_tool_is_matched_by_its_exact_name(self):
        self.assertTrue(checkpoints.matches("send_helper", "send_helper", {"tasks": []}))
        self.assertFalse(checkpoints.matches("send_helper", "send_helper_status", {}))

    def test_a_one_word_checkpoint_never_matches_command_text(self):
        for args in ({"command": "grep -rn send_helper src/"}, {"code": "send_helper()"}):
            with self.subTest(args):
                self.assertFalse(checkpoints.matches("send_helper", "terminal", args))

    def test_command_words_are_also_found_in_script_text(self):
        self.assertTrue(checkpoints.matches("vcs save", "run_script", {"code": "run('vcs save -m x')"}))
        self.assertFalse(checkpoints.matches("vcs save", "run_script", {"code": "run('vcs status')"}))
        self.assertFalse(checkpoints.matches("vcs save", "save_text", {"content": "how to vcs save"}))

    def test_a_command_is_matched_by_its_words_in_order_inside_one_command(self):
        yes = ["vcs save -m x", "vcs -C repo save", "cd repo && vcs save", "VAR=1 vcs save", 'vcs --author "a b" save']
        no = ["vcs status", "vcs status; echo save", "vcs log | grep save", "myvcs save", "vcs saved", "save vcs",
              "vcs status && other save"]
        for command in yes:
            with self.subTest(command):
                self.assertTrue(checkpoints.matches("vcs save", "terminal", {"command": command}))
        for command in no:
            with self.subTest(command):
                self.assertFalse(checkpoints.matches("vcs save", "terminal", {"command": command}))

    def test_arguments_without_a_command_text_never_match_a_command(self):
        for args in ({}, {"command": 3}, None, {"text": "vcs save"}):
            with self.subTest(args):
                self.assertFalse(checkpoints.matches("vcs save", "terminal", args))


    def test_where_narrows_a_match_to_argument_values(self):
        where = {"path": "*.md"}
        self.assertTrue(checkpoints.matches("save_text", "save_text", {"path": "C:/x/Report.MD"}, where))
        self.assertFalse(checkpoints.matches("save_text", "save_text", {"path": "x/main.py"}, where))
        self.assertFalse(checkpoints.matches("save_text", "save_text", {"content": "a.md"}, where))
        self.assertFalse(checkpoints.matches("save_text", "save_text", {"path": 3}, where))
        self.assertFalse(checkpoints.matches("other", "save_text", {"path": "a.md"}, where))


class GateTests(unittest.TestCase):
    def setUp(self):
        self.gate = checkpoints.Gate()

    def test_blocks_once_and_names_the_missing_skill(self):
        got = self.gate.decide(POINTS, "send_helper", {"tasks": [1]}, "s1")
        self.assertIn("was not run", got)
        self.assertIn("'brief-rules'", got)
        self.assertIn("skill_view", got)
        self.assertIsNone(self.gate.decide(POINTS, "send_helper", {"tasks": [1]}, "s1"))

    def test_passes_when_the_skill_was_loaded_first(self):
        self.gate.loaded("s1", ["brief-rules"])
        self.assertIsNone(self.gate.decide(POINTS, "send_helper", {}, "s1"))

    def test_asking_for_a_skill_is_not_a_load(self):
        self.assertIsNone(self.gate.decide(POINTS, "skill_view", {"name": "brief-rules"}, "s1"))
        self.assertIsNotNone(self.gate.decide(POINTS, "send_helper", {}, "s1"))

    def test_names_only_the_skills_still_missing(self):
        self.gate.loaded("s1", ["message-rules", "", None, 3])
        got = self.gate.decide(POINTS, "terminal", {"command": "vcs save -m x"}, "s1")
        self.assertIn("'review-rules'", got)
        self.assertNotIn("message-rules", got)

    def test_sessions_are_separate(self):
        self.gate.loaded("s1", ["brief-rules"])
        self.assertIsNotNone(self.gate.decide(POINTS, "send_helper", {}, "s2"))

    def test_checkpoints_are_separate(self):
        self.assertIsNotNone(self.gate.decide(POINTS, "send_helper", {}, "s1"))
        self.assertIsNotNone(self.gate.decide(POINTS, "terminal", {"command": "vcs save"}, "s1"))

    def test_checkpoints_on_one_tool_with_different_where_ask_separately(self):
        points = [{"before": "save_text", "where": {"path": "*.md"}, "skills": ["a"]},
                  {"before": "save_text", "where": {"path": "*.txt"}, "skills": ["b"]}]
        self.assertIsNone(self.gate.decide(points, "save_text", {"path": "x.py"}, "s1"))
        self.assertIn("'a'", self.gate.decide(points, "save_text", {"path": "x.md"}, "s1"))
        self.assertIn("'b'", self.gate.decide(points, "save_text", {"path": "x.txt"}, "s1"))
        self.assertIsNone(self.gate.decide(points, "save_text", {"path": "y.md"}, "s1"))

    def test_two_checkpoints_on_one_call_block_once_with_all_missing_skills(self):
        points = POINTS + [{"before": "vcs init", "skills": ["brief-rules"]}]
        got = self.gate.decide(points, "terminal", {"command": "vcs init && vcs save"}, "s1")
        for name in ("message-rules", "review-rules", "brief-rules"):
            self.assertIn(name, got)
        self.assertIsNone(self.gate.decide(points, "terminal", {"command": "vcs init && vcs save"}, "s1"))

    def test_forgetting_a_session_makes_its_checkpoints_ask_again(self):
        self.gate.loaded("s1", ["brief-rules"])
        self.assertIsNone(self.gate.decide(POINTS, "send_helper", {}, "s1"))
        self.gate.forget("s1")
        self.gate.forget("never-seen")
        self.gate.forget("")
        self.assertIsNotNone(self.gate.decide(POINTS, "send_helper", {}, "s1"))

    def test_never_blocks_without_a_session_or_without_checkpoints(self):
        self.assertIsNone(self.gate.decide(POINTS, "send_helper", {}, ""))
        self.assertIsNone(self.gate.decide([], "send_helper", {}, "s1"))
        self.gate.loaded("", ["brief-rules"])
        self.assertEqual(self.gate.sessions(), [])

    def test_an_unrelated_call_passes(self):
        self.assertIsNone(self.gate.decide(POINTS, "terminal", {"command": "ls"}, "s1"))
        self.assertIsNone(self.gate.decide(POINTS, "read_file", {"path": "x"}, "s1"))

    def test_old_sessions_are_forgotten_past_the_limit(self):
        gate = checkpoints.Gate(limit=2)
        for sid in ("s1", "s2", "s3"):
            gate.decide(POINTS, "send_helper", {}, sid)
        self.assertEqual(gate.sessions(), ["s2", "s3"])


class LoadedNamesTests(unittest.TestCase):
    def test_a_successful_load_counts_under_the_asked_and_the_returned_name(self):
        got = checkpoints.loaded_names({"name": "folder/brief-rules"}, json.dumps({"success": True, "name": "brief-rules"}))
        self.assertEqual(got, ["folder/brief-rules", "brief-rules"])

    def test_a_failed_or_unreadable_load_counts_for_nothing(self):
        for result in (json.dumps({"success": False, "error": "x"}), "not json", None, json.dumps([1]), json.dumps({"name": "x"})):
            with self.subTest(result):
                self.assertEqual(checkpoints.loaded_names({"name": "brief-rules"}, result), [])


def _load_plugin():
    name = "skill_branches_checkpoints_under_test"
    sys.modules[name + ".branches"] = branches
    sys.modules[name + ".checkpoints"] = checkpoints
    spec = importlib.util.spec_from_file_location(name, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class _Ctx:
    def __init__(self):
        self.hooks = {}

    def register_system_prompt_section(self, *a, **k):
        pass

    def register_hook(self, name, fn):
        self.hooks[name] = fn

    def register_skill(self, *a, **k):
        pass


class HookTests(unittest.TestCase):
    def setUp(self):
        self.plugin = _load_plugin()
        self.ctx = _Ctx()
        self.plugin.register(self.ctx)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(self.plugin, "_tree_path", lambda: Path(self.tmp.name) / "branches.json")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.hook = self.ctx.hooks["pre_tool_call"]

    def test_blocks_with_the_host_block_shape_and_logs_one_line(self):
        _write(self.tmp.name, TREE)
        with mock.patch.object(self.plugin.logger, "info") as info:
            got = self.hook(tool_name="send_helper", args={"tasks": [1]}, session_id="s1", turn_id="t")
        self.assertEqual(set(got), {"action", "message"})
        self.assertEqual(got["action"], "block")
        self.assertIn("brief-rules", got["message"])
        self.assertEqual(info.call_count, 1)
        self.assertIsNone(self.hook(tool_name="send_helper", args={"tasks": [1]}, session_id="s1"))

    def test_registers_the_three_checkpoint_hooks(self):
        for name in ("pre_tool_call", "post_tool_call", "post_compaction"):
            self.assertIn(name, self.ctx.hooks)

    def test_a_host_without_the_observer_hooks_keeps_the_checkpoint(self):
        class Old(_Ctx):
            def register_hook(self, name, fn):
                if name in ("post_tool_call", "post_compaction"):
                    raise ValueError(name)
                super().register_hook(name, fn)
        ctx = Old()
        with mock.patch.object(self.plugin.logger, "warning") as warn:
            self.plugin.register(ctx)
        self.assertEqual((sorted(ctx.hooks), warn.call_count), (["pre_llm_call", "pre_tool_call"], 2))

    def test_a_successful_skill_load_lets_the_call_through(self):
        _write(self.tmp.name, TREE)
        self.ctx.hooks["post_tool_call"](tool_name="skill_view", args={"name": "x/brief-rules"}, session_id="s1",
                                         result=json.dumps({"success": True, "name": "brief-rules"}), status="ok")
        self.assertIsNone(self.hook(tool_name="send_helper", args={}, session_id="s1"))

    def test_a_failed_skill_load_does_not(self):
        _write(self.tmp.name, TREE)
        self.ctx.hooks["post_tool_call"](tool_name="skill_view", args={"name": "brief-rules"}, session_id="s1",
                                         result=json.dumps({"success": False, "error": "no such skill"}))
        self.ctx.hooks["post_tool_call"](tool_name="other_tool", args={"name": "brief-rules"}, session_id="s1",
                                         result=json.dumps({"success": True, "name": "brief-rules"}))
        self.assertIsNotNone(self.hook(tool_name="send_helper", args={}, session_id="s1"))

    def test_after_a_compaction_the_checkpoint_asks_again(self):
        _write(self.tmp.name, TREE)
        load = dict(tool_name="skill_view", args={"name": "brief-rules"},
                    result=json.dumps({"success": True, "name": "brief-rules"}))
        for sid in ("s1", "s0"):
            self.ctx.hooks["post_tool_call"](session_id=sid, **load)
            self.assertIsNone(self.hook(tool_name="send_helper", args={}, session_id=sid))
        self.ctx.hooks["post_compaction"](session_id="s1", old_session_id="s0", kind="summarize", reason="manual")
        for sid in ("s1", "s0"):
            self.assertIsNotNone(self.hook(tool_name="send_helper", args={}, session_id=sid))

    def test_the_observer_hooks_never_raise(self):
        with mock.patch.object(self.plugin._gate, "loaded", side_effect=RuntimeError("boom")), \
                mock.patch.object(self.plugin._gate, "forget", side_effect=RuntimeError("boom")), \
                mock.patch.object(self.plugin.logger, "warning") as warn:
            self.ctx.hooks["post_tool_call"](tool_name="skill_view", args={"name": "a"}, session_id="s1",
                                             result=json.dumps({"success": True}))
            self.ctx.hooks["post_compaction"](session_id="s1")
        self.assertEqual(warn.call_count, 2)

    def test_does_nothing_without_a_file_or_without_checkpoints(self):
        self.assertIsNone(self.hook(tool_name="send_helper", args={}, session_id="s1"))
        _write(self.tmp.name, {"branches": BRANCHES})
        self.assertIsNone(self.hook(tool_name="send_helper", args={}, session_id="s2"))

    def test_a_failure_lets_the_call_through_with_one_warning(self):
        _write(self.tmp.name, TREE)
        with mock.patch.object(self.plugin.branches, "load_checkpoints", side_effect=RuntimeError("boom")), \
                mock.patch.object(self.plugin.logger, "warning") as warn:
            self.assertIsNone(self.hook(tool_name="send_helper", args={}, session_id="s1"))
        self.assertEqual(warn.call_count, 1)
        self.assertNotIn("boom", str(warn.call_args))


if __name__ == "__main__":
    unittest.main()
