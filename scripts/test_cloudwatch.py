import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cloudwatch_readings import to_readings, HOUR  # noqa: E402

END = 10 * HOUR


class ToReadings(unittest.TestCase):
    def test_rate_is_percent_of_requests(self):
        r = to_readings({END - HOUR: 5}, {END - HOUR: 100}, 2, END, 20)
        self.assertEqual(r, [0.0, 5.0])

    def test_hours_without_data_read_zero_and_order_is_oldest_first(self):
        r = to_readings({}, {}, 3, END, 20)
        self.assertEqual(r, [0.0, 0.0, 0.0])
        r = to_readings({END - 2 * HOUR: 1}, {END - 2 * HOUR: 50, END - HOUR: 50}, 2, END, 20)
        self.assertEqual(r, [2.0, 0.0])

    def test_too_few_requests_is_noise_not_a_breach(self):
        # 3 of 4 requests failed, but four requests prove nothing
        self.assertEqual(to_readings({END - HOUR: 3}, {END - HOUR: 4}, 1, END, 20), [0.0])
        self.assertEqual(to_readings({END - HOUR: 5}, {END - HOUR: 20}, 1, END, 20), [25.0])

    def test_length_matches_hours(self):
        self.assertEqual(len(to_readings({}, {}, 720, END * 100, 20)), 720)


if __name__ == "__main__":
    unittest.main()
