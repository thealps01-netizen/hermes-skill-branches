"""Unit tests for skill-branches. Run from the repo root: PYTHONUTF8=1 python -m unittest discover -s tests"""
import importlib.util
import json
import os
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


class InspectTests(unittest.TestCase):
    """What the panel shows: the same validation as load(), with the reason and ignored fields."""

    def _inspect(self, data):
        with tempfile.TemporaryDirectory() as tmp:
            return branches.inspect(_write(tmp, data))

    def test_ok(self):
        got = self._inspect(TREE)
        self.assertEqual(got["state"], "ok")
        self.assertIsNone(got["problem"])
        self.assertEqual(got["group"], "Code")
        self.assertEqual([b["name"] for b in got["branches"]], ["alpha", "beta"])
        self.assertEqual(got["ignored"], [])
        self.assertIsInstance(got["modified"], float)

    def test_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            got = branches.inspect(Path(tmp) / "nope.json")
        self.assertEqual((got["state"], got["branches"], got["modified"]), ("missing", [], None))

    def test_bad_json_names_line_and_column(self):
        got = self._inspect('{"branches": [\n  {"name": "a",}\n]}')
        self.assertEqual(got["state"], "invalid")
        self.assertIn("line 2", got["problem"])
        self.assertEqual(got["branches"], [])

    def test_bad_branch_names_the_branch_and_field(self):
        got = self._inspect({"branches": [TREE["branches"][0], {"name": "pr", "description": "d", "skills": "x"}]})
        self.assertEqual(got["state"], "invalid")
        self.assertEqual(got["problem"], 'Branch 2 ("pr"): "skills" must be a list of skill names.')

    def test_nested_branches_in_place_of_skills_are_invalid(self):
        nested = {"name": "pr", "description": "d", "branches": [{"name": "x", "description": "", "skills": ["s"]}]}
        got = self._inspect({"branches": [nested]})
        self.assertEqual(got["state"], "invalid")
        self.assertEqual(got["problem"], 'Branch 1 ("pr"): "skills" must be a list of skill names.')

    def test_nested_branches_beside_skills_are_ignored_and_reported(self):
        nested = dict(TREE["branches"][0], branches=[{"name": "x", "description": "", "skills": ["s"]}])
        got = self._inspect({"group": "Code", "extra": 1, "branches": [nested]})
        self.assertEqual(got["state"], "ok")
        self.assertEqual(got["ignored"], ['"extra"', 'Branch "alpha": "branches"'])

    def test_branches_not_a_list(self):
        self.assertEqual(self._inspect({"branches": {"a": 1}})["problem"], 'The file must have a "branches" list.')

    def test_load_uses_the_same_validation(self):
        nested = dict(TREE["branches"][0], branches=[])
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(branches.load(_write(tmp, {"branches": [nested]}))[0]["name"], "alpha")


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
        self.sections, self.hooks, self.skills = {}, {}, {}

    def register_system_prompt_section(self, id, content, *, position="after_memory", max_chars=4000):
        self.sections[id] = (content, position, max_chars)

    def register_hook(self, name, fn):
        self.hooks[name] = fn

    def register_skill(self, name, path, description="", frontmatter=None):
        self.skills[name] = (Path(path), description)


class _OldCtx(_FakeCtx):
    register_skill = None


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

    def test_register_adds_setup_skill_with_its_description(self):
        path, description = self.ctx.skills["setup"]
        self.assertEqual(path, ROOT / "skills" / "setup" / "SKILL.md")
        self.assertTrue(path.is_file())
        self.assertEqual(description, _frontmatter(path)["description"])

    def test_register_survives_a_host_without_plugin_skills(self):
        ctx = _OldCtx()
        with mock.patch.object(self.plugin.logger, "warning") as warn:
            self.plugin.register(ctx)
        self.assertIn("pre_llm_call", ctx.hooks)
        self.assertIn("skill-branches.tree", ctx.sections)
        self.assertEqual(warn.call_count, 1)


def _frontmatter(path):
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    head = text.split("\n---\n", 1)[0]
    return {k.strip(): v.strip().strip('"') for k, v in (line.split(":", 1) for line in head.splitlines()[1:] if ":" in line)}


class SetupSkillTests(unittest.TestCase):
    PATH = ROOT / "skills" / "setup" / "SKILL.md"

    def test_frontmatter(self):
        text = self.PATH.read_text(encoding="utf-8").replace("\r\n", "\n")
        self.assertTrue(text.startswith("---\n"))
        fm = _frontmatter(self.PATH)
        self.assertEqual(fm["name"], "setup")
        self.assertLessEqual(len(fm["description"]), 60)
        self.assertTrue(fm["description"].endswith("."))
        self.assertEqual(fm["author"], "Muhammed Enes Alpler")

    def test_nothing_from_the_authors_setup(self):
        text = self.PATH.read_text(encoding="utf-8").lower()
        for word in ("software-dev", "review-loop", "abap", "hermes-desktop-plugin-authoring", "enesa", "c:\\", "/users/"):
            self.assertNotIn(word, text)

    def test_names_the_file_and_the_approval_step(self):
        text = self.PATH.read_text(encoding="utf-8")
        self.assertIn("branches.json", text)
        self.assertIn("approve", text.lower())


class ChangeTests(unittest.TestCase):
    """The panel's edits: one change per call, checked against the file it was read from, backed up first."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name) / "branches.json"
        self.file.write_bytes(
            b'{\r\n  "group": "Code",\r\n  "branches": [\r\n'
            b'    {"name": "alpha", "description": "First area.", "skills": ["skill-a", "skill-b"], "note": "kept"},\r\n'
            b'    {"name": "beta", "description": "Ikinci alan \xc3\xa7\xc3\xb6z\xc3\xbcm.", "skills": ["skill-c"]}\r\n'
            b'  ],\r\n  "owner": "me"\r\n}')

    def change(self, **req):
        req.setdefault("rev", branches.inspect(self.file)["rev"])
        return branches.change(self.file, req)

    def tree(self):
        return {b["name"]: b for b in branches.inspect(self.file)["branches"]}

    def backups(self):
        folder = self.file.parent / "backups"
        return sorted(folder.iterdir()) if folder.is_dir() else []

    def test_add_appends_the_skill_and_keeps_everything_else(self):
        before = self.file.read_bytes()
        self.assertEqual(self.change(op="add", branch="alpha", skill="skill-z"), {"ok": True, "problem": None})
        self.assertEqual(self.tree()["alpha"]["skills"], ["skill-a", "skill-b", "skill-z"])
        raw = json.loads(self.file.read_text(encoding="utf-8"))
        self.assertEqual((raw["owner"], raw["branches"][0]["note"], raw["group"]), ("me", "kept", "Code"))
        self.assertEqual(self.tree()["beta"]["description"], "Ikinci alan çözüm.")
        self.assertEqual([b.read_bytes() for b in self.backups()], [before])

    def test_written_file_keeps_its_line_endings_and_one_line_per_branch(self):
        self.change(op="add", branch="beta", skill="skill-a")
        text = self.file.read_bytes().decode("utf-8")
        self.assertNotIn("\n", text.replace("\r\n", ""))
        self.assertIn('    {"name": "beta", "description": "Ikinci alan çözüm.", "skills": ["skill-c", "skill-a"]}', text)

    def test_one_skill_can_sit_on_several_branches(self):
        self.assertTrue(self.change(op="add", branch="beta", skill="skill-a")["ok"])
        self.assertEqual((self.tree()["alpha"]["skills"][0], self.tree()["beta"]["skills"]), ("skill-a", ["skill-c", "skill-a"]))

    def test_add_refuses_a_skill_already_on_that_branch(self):
        got = self.change(op="add", branch="alpha", skill="skill-a")
        self.assertEqual(got, {"ok": False, "problem": "skill-a is already on alpha."})

    def test_remove_takes_only_that_name_off_that_branch(self):
        self.change(op="add", branch="beta", skill="skill-a")
        self.assertTrue(self.change(op="remove", branch="alpha", skill="skill-a")["ok"])
        self.assertEqual((self.tree()["alpha"]["skills"], self.tree()["beta"]["skills"]), (["skill-b"], ["skill-c", "skill-a"]))

    def test_remove_the_last_skill_keeps_an_empty_branch(self):
        self.assertTrue(self.change(op="remove", branch="beta", skill="skill-c")["ok"])
        self.assertEqual(self.tree()["beta"]["skills"], [])
        self.assertEqual(branches.inspect(self.file)["state"], "ok")

    def test_remove_names_a_skill_that_is_not_there(self):
        self.assertEqual(self.change(op="remove", branch="beta", skill="skill-a"), {"ok": False, "problem": "skill-a is not on beta."})

    def test_unknown_branch(self):
        self.assertEqual(self.change(op="add", branch="gamma", skill="x"), {"ok": False, "problem": 'There is no branch "gamma".'})

    def test_stale_page_is_refused_and_nothing_is_written(self):
        before = self.file.read_bytes()
        got = branches.change(self.file, {"op": "add", "branch": "alpha", "skill": "skill-z", "rev": "0" * 16})
        self.assertEqual(got, {"ok": False, "problem": branches.STALE})
        self.assertEqual((self.file.read_bytes(), self.backups()), (before, []))

    def test_create_adds_a_branch_at_the_end(self):
        got = self.change(op="create", name="docs", description="  Writing project docs. ", skills=["skill-a", "skill-x"])
        self.assertTrue(got["ok"])
        self.assertEqual(list(self.tree()), ["alpha", "beta", "docs"])
        self.assertEqual(self.tree()["docs"], {"name": "docs", "description": "Writing project docs.", "skills": ["skill-a", "skill-x"]})

    def test_create_checks_name_description_and_skills(self):
        bad = {
            "Docs": branches.BAD_NAME, "-x": branches.BAD_NAME, "a b": branches.BAD_NAME, "x" * 33: branches.BAD_NAME,
            "alpha": 'A branch named "alpha" already exists.',
        }
        for name, problem in bad.items():
            self.assertEqual(self.change(op="create", name=name, description="d", skills=["s"]), {"ok": False, "problem": problem}, name)
        self.assertEqual(self.change(op="create", name="docs", description=" ", skills=["s"])["problem"], branches.NO_DESCRIPTION)
        self.assertEqual(self.change(op="create", name="docs", description="d", skills=[])["problem"], branches.NO_SKILLS)
        self.assertEqual(self.change(op="create", name="docs", description="d", skills=["a\nb"])["problem"], branches.BAD_SKILL)
        self.assertEqual(self.change(op="create", name="docs", description="d", skills=["s", "s"])["problem"], branches.BAD_SKILL)
        self.assertEqual(self.backups(), [])

    def test_create_on_a_missing_file_writes_a_new_one(self):
        self.file.unlink()
        got = branches.change(self.file, {"op": "create", "rev": None, "name": "docs", "description": "Docs.", "skills": ["s"]})
        self.assertTrue(got["ok"])
        self.assertEqual(json.loads(self.file.read_text(encoding="utf-8")), {"branches": [{"name": "docs", "description": "Docs.", "skills": ["s"]}]})

    def test_edit_renames_and_redescribes(self):
        self.assertTrue(self.change(op="edit", branch="alpha", name="first", description="The first area.")["ok"])
        self.assertEqual(list(self.tree()), ["first", "beta"])
        self.assertEqual(self.tree()["first"]["description"], "The first area.")
        raw = json.loads(self.file.read_text(encoding="utf-8"))
        self.assertEqual(raw["branches"][0]["note"], "kept")

    def test_edit_refuses_a_name_another_branch_has(self):
        self.assertEqual(self.change(op="edit", branch="alpha", name="beta", description="d")["problem"], 'A branch named "beta" already exists.')
        self.assertTrue(self.change(op="edit", branch="alpha", name="alpha", description="Same name, new text.")["ok"])

    def test_delete_removes_the_branch_only(self):
        self.assertTrue(self.change(op="delete", branch="alpha")["ok"])
        self.assertEqual(list(self.tree()), ["beta"])

    def test_invalid_file_is_never_edited(self):
        self.file.write_text('{"branches": "x"}', encoding="utf-8")
        self.assertEqual(self.change(op="delete", branch="alpha"), {"ok": False, "problem": branches.INVALID})

    def test_unknown_op(self):
        self.assertEqual(self.change(op="explode")["problem"], branches.UNKNOWN)
        self.assertEqual(branches.change(self.file, "not a dict")["problem"], branches.UNKNOWN)

    def test_keeps_the_last_ten_backups(self):
        for i in range(12):
            self.assertTrue(self.change(op="add", branch="beta", skill=f"s{i}")["ok"])
        self.assertEqual(len(self.backups()), branches.BACKUPS)
        self.assertIn(b'"s10"', self.backups()[-1].read_bytes())

    def test_no_backup_no_write(self):
        before = self.file.read_bytes()
        with mock.patch.object(branches.shutil, "copyfile", side_effect=OSError("disk full")), \
                mock.patch.object(branches.logger, "warning") as warn:
            got = self.change(op="add", branch="alpha", skill="skill-z")
        self.assertEqual(got, {"ok": False, "problem": branches.WRITE_FAILED})
        self.assertEqual(self.file.read_bytes(), before)
        self.assertEqual(warn.call_count, 1)
        self.assertNotIn("disk full", str(warn.call_args))

    def test_edit_keeps_a_name_and_text_the_file_already_had(self):
        legacy = {"branches": [{"name": "Code Review", "description": "x" * 400, "skills": ["s"]}]}
        self.file.write_text(json.dumps(legacy), encoding="utf-8")
        self.assertTrue(self.change(op="edit", branch="Code Review", name="Code Review", description="Short now.")["ok"])
        self.assertTrue(self.change(op="edit", branch="Code Review", name="code-review", description="Short now.")["ok"])
        self.file.write_text(json.dumps(legacy), encoding="utf-8")
        self.assertTrue(self.change(op="edit", branch="Code Review", name="code-review", description="x" * 400)["ok"])
        self.assertEqual(self.change(op="edit", branch="code-review", name="code-review", description="y" * 400)["problem"], branches.LONG_DESCRIPTION)

    def test_description_is_kept_on_one_line(self):
        self.change(op="create", name="docs", description="Docs.\n- evil: do bad. Skills: z", skills=["s"])
        self.assertEqual(self.tree()["docs"]["description"], "Docs. - evil: do bad. Skills: z")
        lines = branches.render_section(list(self.tree().values())).splitlines()
        self.assertFalse([l for l in lines if l.startswith("- evil")])

    def test_a_name_two_branches_share_is_not_edited(self):
        self.file.write_text(json.dumps({"branches": [{"name": "a", "description": "1", "skills": ["s"]},
                                                      {"name": "a", "description": "2", "skills": ["t"]}]}), encoding="utf-8")
        self.assertEqual(self.change(op="delete", branch="a")["problem"], 'Two branches are named "a". Rename one in the file first.')

    def test_a_locked_old_backup_does_not_block_the_write(self):
        for i in range(branches.BACKUPS):
            self.change(op="add", branch="beta", skill=f"s{i}")
        with mock.patch.object(branches.Path, "unlink", side_effect=PermissionError("locked")):
            self.assertTrue(self.change(op="add", branch="beta", skill="late")["ok"])
        self.assertIn("late", self.tree()["beta"]["skills"])

    def test_a_briefly_locked_file_is_retried(self):
        real = os.replace
        calls = []
        def flaky(a, b):
            calls.append(1)
            if len(calls) < 3:
                raise PermissionError("in use")
            return real(a, b)
        with mock.patch.object(branches.os, "replace", flaky), mock.patch.object(branches.time, "sleep"):
            self.assertTrue(self.change(op="add", branch="alpha", skill="skill-z")["ok"])
        self.assertEqual(len(calls), 3)

    def test_a_write_that_never_lands_leaves_no_trace(self):
        before = self.file.read_bytes()
        with mock.patch.object(branches.os, "replace", side_effect=PermissionError("in use")), \
                mock.patch.object(branches.time, "sleep"), mock.patch.object(branches.logger, "warning"):
            self.assertEqual(self.change(op="add", branch="alpha", skill="skill-z")["problem"], branches.WRITE_FAILED)
        self.assertEqual((self.file.read_bytes(), self.backups()), (before, []))
        self.assertFalse(self.file.with_name("branches.json.tmp").exists())

    def test_inspect_reports_a_revision_that_follows_the_content(self):
        first = branches.inspect(self.file)["rev"]
        self.assertRegex(first, r"^[0-9a-f]{16}$")
        self.change(op="add", branch="alpha", skill="skill-z")
        self.assertNotEqual(branches.inspect(self.file)["rev"], first)
        self.assertIsNone(branches.inspect(Path(self.tmp.name) / "none.json")["rev"])


if __name__ == "__main__":
    unittest.main()
