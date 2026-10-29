"""Unit tests for skill-branches. Run from the repo root: PYTHONUTF8=1 python -m unittest discover -s tests"""
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

TREE = {"group": "Code", "branches": [
    {"name": "alpha", "description": "First area.", "skills": ["skill-a", "skill-b"]},
    {"name": "beta", "description": "Second area.", "skills": ["skill-c"]},
]}


def _write(tmp, data):
    p = Path(tmp) / "branches.json"
    p.write_text(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return p


class LoadTests(unittest.TestCase):
    def test_load_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            got = branches.load(_write(tmp, TREE))
        self.assertEqual([b["name"] for b in got], ["alpha", "beta"])
        self.assertEqual(got[0]["skills"], ["skill-a", "skill-b"])

    def test_load_missing_returns_none_without_warning(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(branches.logger, "warning") as warn:
            self.assertIsNone(branches.load(Path(tmp) / "nope.json"))
        warn.assert_not_called()

    def test_load_invalid_shapes_return_none_with_one_warning(self):
        cases = {
            "bad json": "{not json",
            "branches not list": {"branches": {"a": 1}},
            "skill not str": {"branches": [{"name": "a", "description": "d", "skills": [1]}]},
            "empty name": {"branches": [{"name": " ", "description": "d", "skills": ["x"]}]},
            "description not str": {"branches": [{"name": "a", "description": 3, "skills": ["x"]}]},
        }
        for label, data in cases.items():
            with self.subTest(label), tempfile.TemporaryDirectory() as tmp, \
                    mock.patch.object(branches.logger, "warning") as warn:
                self.assertIsNone(branches.load(_write(tmp, data)))
                self.assertEqual(warn.call_count, 1)
                self.assertTrue(warn.call_args[0][0].startswith("skill-branches: "))

    def test_load_keeps_turkish_text(self):
        tree = {"branches": [{"name": "kod", "description": "Çalışma ağacı, şube, ığdır.", "skills": ["s"]}]}
        with tempfile.TemporaryDirectory() as tmp:
            got = branches.load(_write(tmp, tree))
        self.assertEqual(got[0]["description"], "Çalışma ağacı, şube, ığdır.")


class RenderTests(unittest.TestCase):
    def test_render_section_format(self):
        self.assertEqual(branches.render_section(TREE["branches"]),
                         "Skill branches\n"
                         "- alpha: First area. Skills: skill-a, skill-b\n"
                         "- beta: Second area. Skills: skill-c")

    def test_render_directive_exact_text(self):
        self.assertEqual(branches.render_directive(TREE["branches"]),
                         "Skill branches: before your first tool call, name the branch this message belongs to "
                         "(alpha, beta) or 'none'. If one fits, load with skill_view the skills of that branch "
                         "that apply to this task; the 'Skill branches' section lists them.")

    def test_renders_empty_for_no_branches(self):
        self.assertEqual(branches.render_section([]), "")
        self.assertEqual(branches.render_directive([]), "")


def _load_plugin():
    name = "skill_branches_under_test"
    sys.modules[name + ".branches"] = branches
    spec = importlib.util.spec_from_file_location(name, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class _FakeCtx:
    def __init__(self):
        self.sections, self.hooks = {}, {}

    def register_system_prompt_section(self, id, content, *, position="after_memory", max_chars=4000):
        self.sections[id] = (content, position, max_chars)

    def register_hook(self, name, fn):
        self.hooks[name] = fn


class PluginTests(unittest.TestCase):
    def setUp(self):
        self.plugin = _load_plugin()
        self.ctx = _FakeCtx()
        self.plugin.register(self.ctx)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(self.plugin, "_tree_path", lambda: Path(self.tmp.name) / "branches.json")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_register_adds_section_and_hook(self):
        self.assertEqual(set(self.ctx.sections), {"skill-branches.tree"})
        self.assertEqual(self.ctx.sections["skill-branches.tree"][1:], ("after_memory", 4000))
        self.assertIn("pre_llm_call", self.ctx.hooks)

    def test_hook_returns_directive(self):
        _write(self.tmp.name, TREE)
        got = self.ctx.hooks["pre_llm_call"](user_message="hi", is_first_turn=True)
        self.assertEqual(got, {"context": branches.render_directive(TREE["branches"])})

    def test_hook_none_when_file_missing(self):
        self.assertIsNone(self.ctx.hooks["pre_llm_call"](user_message="hi"))

    def test_hook_swallows_exception_with_one_warning(self):
        with mock.patch.object(self.plugin.branches, "load", side_effect=RuntimeError("boom")), \
                mock.patch.object(self.plugin.logger, "warning") as warn:
            self.assertIsNone(self.ctx.hooks["pre_llm_call"](user_message="hi"))
        self.assertEqual(warn.call_count, 1)
        self.assertNotIn("boom", str(warn.call_args))

    def test_section_lists_branches(self):
        _write(self.tmp.name, TREE)
        self.assertEqual(self.ctx.sections["skill-branches.tree"][0]({}), branches.render_section(TREE["branches"]))

    def test_section_empty_when_file_missing(self):
        self.assertEqual(self.ctx.sections["skill-branches.tree"][0]({}), "")

    def test_section_swallows_exception(self):
        with mock.patch.object(self.plugin.branches, "load", side_effect=RuntimeError("boom")), \
                mock.patch.object(self.plugin.logger, "warning") as warn:
            self.assertEqual(self.ctx.sections["skill-branches.tree"][0]({}), "")
        self.assertEqual(warn.call_count, 1)


if __name__ == "__main__":
    unittest.main()
