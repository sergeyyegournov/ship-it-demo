import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import detect  # noqa: E402
import yaml  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
with open(os.path.join(ROOT, "bands.yaml")) as f:
    BANDS = yaml.safe_load(f)
BASE = [0.4, 0.5, 0.3, 0.45, 0.35] * 20  # mean 0.4, sigma ~0.0707 -> 1s=.471 2s=.541 3s=.612


class DetectTests(unittest.TestCase):
    def tier(self, tail):
        return detect.detect(BASE + tail, BANDS)["tier"]

    def test_quiet_is_none(self):
        self.assertEqual(self.tier([0.4] * 6), "none")

    def test_single_blip_below_3sigma_is_none(self):
        self.assertEqual(self.tier([0.4] * 5 + [0.55]), "none")

    def test_sustained_creep_is_1sigma(self):
        self.assertEqual(self.tier([0.4, 0.4, 0.49, 0.49, 0.49, 0.49]), "1sigma")

    def test_two_of_three_above_2sigma(self):
        self.assertEqual(self.tier([0.4, 0.4, 0.4, 0.56, 0.4, 0.56]), "2sigma")

    def test_one_reading_above_3sigma(self):
        r = detect.detect(BASE + [0.4] * 5 + [0.7], BANDS)
        self.assertEqual((r["tier"], r["action"]), ("3sigma", "propose"))
        self.assertIn("runbook:rollback-deploy", r["routes"])

    def test_spike_does_not_inflate_its_own_baseline(self):
        self.assertEqual(self.tier([9.0] * 6), "3sigma")

    def test_flat_baseline_noise_floor(self):
        flat = [0.4] * 100 + [0.4] * 5 + [0.42]  # sigma 0 -> floor 0.05; 0.42 is far below 3*0.05
        self.assertEqual(detect.detect(flat, BANDS)["tier"], "none")

    def test_too_little_history_raises(self):
        with self.assertRaises(ValueError):
            detect.detect([0.4] * 10, BANDS)

    def test_deterministic(self):
        a = detect.detect(BASE + [0.4] * 5 + [0.7], BANDS)
        self.assertEqual(a, detect.detect(BASE + [0.4] * 5 + [0.7], BANDS))


class CliTests(unittest.TestCase):
    def run_cli(self, data):
        out = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/detect.py"), os.path.join(ROOT, "bands.yaml")],
                             input=json.dumps(data), capture_output=True, text=True, check=True).stdout
        return json.loads(out)

    def test_committed_metrics_are_quiet(self):
        with open(os.path.join(ROOT, BANDS["source"])) as f:
            data = json.load(f)
        self.assertEqual(len(data), 720)
        self.assertEqual(self.run_cli(data)["tier"], "none")

    def test_simulated_spike_is_3sigma(self):
        spiked = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/simulate.py"), "spike",
                                 os.path.join(ROOT, BANDS["source"])], capture_output=True, text=True, check=True).stdout
        self.assertEqual(self.run_cli(json.loads(spiked))["tier"], "3sigma")


if __name__ == "__main__":
    unittest.main()
