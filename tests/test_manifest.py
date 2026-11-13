"""Unit tests for dashboard/manifest.json. Run from the repo root: PYTHONUTF8=1 python -m unittest discover -s tests"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "dashboard"
# The script the web dashboard loads when the manifest names no `entry` (the core's default).
DEFAULT_ENTRY = "dist/index.js"


def tab_fails_to_load(manifest, dashboard_dir):
    """True when the web dashboard would list a tab for this manifest and find no script for it.

    `hermes dashboard` loads `dashboard/<entry>` for every manifest and lists a tab for it unless
    `tab.hidden` is true. The page of this plugin is drawn by the desktop app only.
    """
    entry = manifest.get("entry", DEFAULT_ENTRY)
    tab = manifest.get("tab") if isinstance(manifest.get("tab"), dict) else {}
    has_script = isinstance(entry, str) and (Path(dashboard_dir) / entry).is_file()
    return not has_script and not tab.get("hidden")


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((DASHBOARD / "manifest.json").read_text(encoding="utf-8"))

    def test_the_web_dashboard_lists_no_tab_without_a_script(self):
        self.assertFalse(tab_fails_to_load(self.manifest, DASHBOARD),
                         'dashboard/manifest.json shows a web dashboard tab but ships no script for it: '
                         'set "tab": {"hidden": true} or ship the script')

    def test_the_rule_fires_when_the_tab_is_shown_again(self):
        shown = {**self.manifest, "tab": {"hidden": False}}
        self.assertTrue(tab_fails_to_load(shown, DASHBOARD))
        self.assertTrue(tab_fails_to_load({k: v for k, v in self.manifest.items() if k != "tab"}, DASHBOARD))


if __name__ == "__main__":
    unittest.main()
