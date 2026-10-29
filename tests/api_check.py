"""Backend check for dashboard/plugin_api.py, through FastAPI as the gateway mounts it.

Needs FastAPI, so it runs with the Hermes core's Python, from the repo root:
    <hermes home>/hermes-agent/venv/Scripts/python tests/api_check.py      (exit 0 = passed)
It never reads the real branch file: every request is pointed at a temporary one.
"""
import importlib.util
import json
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

    def test_read_only(self):
        self.file.write_text(json.dumps(TREE), encoding="utf-8")
        before = self.file.read_bytes(), self.file.stat().st_mtime_ns
        self.get()
        self.assertEqual((self.file.read_bytes(), self.file.stat().st_mtime_ns), before)
        self.assertEqual(self.client.post(f"{PREFIX}/tree").status_code, 405)


if __name__ == "__main__":
    unittest.main()
