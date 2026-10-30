"""Backend check for dashboard/plugin_api.py, through FastAPI as the gateway mounts it.

Needs FastAPI, so it runs with the Hermes core's Python, from the repo root:
    <hermes home>/hermes-agent/venv/Scripts/python tests/api_check.py      (exit 0 = passed)
It never reads the real branch file: every request is pointed at a temporary one.
"""
import importlib.util
import json
import sys
import types
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("skill_branches_plugin_api_under_test", ROOT / "dashboard" / "plugin_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
PREFIX = "/api/plugins/skill-branches"
TREE = {"group": "Code", "branches": [{"name": "alpha", "description": "First.", "skills": ["skill-a"]}]}


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name) / "branches.json"
        patcher = mock.patch.object(api, "_tree_path", lambda: self.file)
        patcher.start()
        self.addCleanup(patcher.stop)
        host = _fake_host([])  # never the real plugin discovery: it would load the real home's plugins
        host.start()
        self.addCleanup(host.stop)
        app = FastAPI()
        app.include_router(api.router, prefix=PREFIX)
        self.client = TestClient(app)

    def get(self):
        response = self.client.get(f"{PREFIX}/tree")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_ok_tree(self):
        self.file.write_text(json.dumps(TREE), encoding="utf-8")
        got = self.get()
        self.assertEqual((got["state"], got["group"], got["branches"][0]["skills"]), ("ok", "Code", ["skill-a"]))
        self.assertNotIn("error", got)
        self.assertEqual(got["path"], str(self.file))

    def test_missing_tree(self):
        self.assertEqual(self.get()["state"], "missing")

    def test_invalid_tree_names_the_reason(self):
        self.file.write_text('{"branches": [{"name": "alpha", "description": "d", "skills": "x"}]}', encoding="utf-8")
        got = self.get()
        self.assertEqual((got["state"], got["problem"]), ("invalid", 'Branch 1 ("alpha"): "skills" must be a list of skill names.'))

    def test_unexpected_failure_is_an_invalid_state_with_one_warning(self):
        with mock.patch.object(api, "_branches", side_effect=RuntimeError("secret detail")), \
                mock.patch.object(api.logger, "warning") as warn:
            got = self.get()
        self.assertEqual((got["state"], got["problem"]), ("invalid", "The branch file could not be checked."))
        self.assertEqual(warn.call_count, 1)
        self.assertNotIn("secret detail", str(warn.call_args))

    def test_tree_is_read_only(self):
        self.file.write_text(json.dumps(TREE), encoding="utf-8")
        before = self.file.read_bytes(), self.file.stat().st_mtime_ns
        self.get()
        self.assertEqual((self.file.read_bytes(), self.file.stat().st_mtime_ns), before)
        self.assertEqual(self.client.post(f"{PREFIX}/tree").status_code, 405)

    def test_change_writes_through_the_shared_rules(self):
        self.file.write_text(json.dumps(TREE), encoding="utf-8")
        rev = self.get()["rev"]
        got = self.client.post(f"{PREFIX}/change", json={"op": "add", "branch": "alpha", "skill": "skill-z", "rev": rev})
        self.assertEqual((got.status_code, got.json()), (200, {"ok": True, "problem": None}))
        self.assertEqual(self.get()["branches"][0]["skills"], ["skill-a", "skill-z"])
        again = self.client.post(f"{PREFIX}/change", json={"op": "add", "branch": "alpha", "skill": "skill-y", "rev": rev})
        self.assertFalse(again.json()["ok"])
        self.assertIn("changed since this page loaded", again.json()["problem"])

    def test_change_failure_is_a_refusal_with_one_warning(self):
        with mock.patch.object(api, "_branches", side_effect=RuntimeError("secret detail")), \
                mock.patch.object(api.logger, "warning") as warn:
            got = self.client.post(f"{PREFIX}/change", json={"op": "delete", "branch": "alpha", "rev": None})
        self.assertEqual(got.json(), {"ok": False, "problem": "The change could not be saved. Nothing was changed."})
        self.assertEqual(warn.call_count, 1)
        self.assertNotIn("secret detail", str(warn.call_args))

    def test_plugin_skills_listed_by_namespace_without_disabled_ones(self):
        rows = [{"name": "toolkit:helper", "description": "Helps."}, {"name": "toolkit:off", "description": "Off."},
                {"name": "bare", "description": "No namespace."}]
        with _fake_host(rows, disabled={"toolkit:off"}):
            got = self.get()
        self.assertEqual(got["plugin_skills"], [{"name": "toolkit:helper", "description": "Helps.", "category": "toolkit"}])

    def test_plugin_skills_failure_keeps_the_tree_with_one_warning(self):
        self.file.write_text(json.dumps(TREE), encoding="utf-8")
        with _fake_host(RuntimeError("secret detail")), mock.patch.object(api.logger, "warning") as warn:
            got = self.get()
        self.assertEqual((got["state"], got["plugin_skills"]), ("ok", []))
        self.assertEqual(warn.call_count, 1)
        self.assertNotIn("secret detail", str(warn.call_args))


def _fake_host(rows, disabled=()):
    """Stand-ins for the three Hermes modules the route reads plugin skills from."""
    def listing():
        if isinstance(rows, Exception):
            raise rows
        return rows
    manager = types.SimpleNamespace(list_plugin_skill_metadata=listing)
    plugins = types.SimpleNamespace(discover_plugins=lambda: None, get_plugin_manager=lambda: manager)
    config = types.SimpleNamespace(load_config=lambda: {})
    skills_config = types.SimpleNamespace(get_disabled_skills=lambda cfg: set(disabled))
    return mock.patch.dict(sys.modules, {"hermes_cli": types.ModuleType("hermes_cli"), "hermes_cli.plugins": plugins,
                                         "hermes_cli.config": config, "hermes_cli.skills_config": skills_config})


if __name__ == "__main__":
    unittest.main()
