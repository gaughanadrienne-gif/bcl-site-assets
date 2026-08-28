"""Tests for rain/refresh_river.py.

The gate these exist to hold: the river panel and the rain panel sit on one page,
so they must never disagree about method. Water year, missing-day exclusion,
median-not-mean, and "peaks are daily means" are all asserted here, and the
figures pinned below were reproduced from a live pull on 2026-08-27.

Nothing here touches the network. Fetchers are injected in refresh_river.main().
"""

import json
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rain import refresh_river as rv  # noqa: E402


def dv(pairs):
    """Build a USGS daily-values payload from [(iso_date, value_or_None)]."""
    return {"value": {"timeSeries": [{"values": [{"value": [
        {"dateTime": d + "T00:00:00.000", "value": ("" if v is None else str(v))}
        for d, v in pairs]}]}]}}


def iv(discharge=None, gage=None, when="2026-08-27T08:30:00.000-07:00"):
    ts = []
    if discharge is not None:
        ts.append({"variable": {"variableCode": [{"value": "00060"}]},
                   "values": [{"value": [{"dateTime": when, "value": str(discharge)}]}]})
    if gage is not None:
        ts.append({"variable": {"variableCode": [{"value": "00065"}]},
                   "values": [{"value": [{"dateTime": when, "value": str(gage)}]}]})
    return {"value": {"timeSeries": ts}}


class WaterYear(unittest.TestCase):
    def test_october_starts_the_next_water_year(self):
        self.assertEqual(rv.water_year(date(1955, 12, 23)), 1956)
        self.assertEqual(rv.water_year(date(1956, 9, 30)), 1956)
        self.assertEqual(rv.water_year(date(1956, 10, 1)), 1957)

    def test_day_index_counts_from_october_first(self):
        self.assertEqual(rv.water_year_day(date(2025, 10, 1)), 1)
        self.assertEqual(rv.water_year_day(date(2026, 1, 1)), 93)


class Parsing(unittest.TestCase):
    def test_blank_and_negative_values_become_missing(self):
        rows = rv.parse_daily(dv([("2026-01-01", 10), ("2026-01-02", None),
                                  ("2026-01-03", -999999)]), date(2026, 1, 5))
        self.assertEqual([r[1] for r in rows], [10.0, None, None])

    def test_future_days_are_dropped(self):
        rows = rv.parse_daily(dv([("2026-01-01", 10), ("2026-01-09", 11)]), date(2026, 1, 5))
        self.assertEqual(len(rows), 1)

    def test_absent_calendar_days_are_filled_as_missing(self):
        """A gap that is simply absent must read as a GAP, not a shorter year."""
        rows = rv.fill_calendar([(date(2026, 1, 1), 10.0), (date(2026, 1, 5), 12.0)])
        self.assertEqual(len(rows), 5)
        self.assertEqual([r[1] for r in rows], [10.0, None, None, None, 12.0])


class Exclusion(unittest.TestCase):
    def test_a_gappy_year_is_excluded_and_never_patched(self):
        days = [(date(2024, 10, 1) , 5.0)] + [
            (date(2024, 10, 2 + i), None) for i in range(6)]
        years = rv.aggregate(days)
        self.assertEqual(years[2025]["missing"], 6)
        self.assertEqual(rv.reportable_years(years, date(2026, 8, 27)), {})

    def test_the_current_water_year_is_never_reportable(self):
        days = [(date(2026, 1, 1), 5.0)]
        self.assertEqual(rv.reportable_years(rv.aggregate(days), date(2026, 8, 27)), {})


class Statistics(unittest.TestCase):
    def test_median_is_reported_not_just_mean(self):
        payload = build_small()
        self.assertIn("median_daily_cfs", payload["record"])
        self.assertIn("mean_daily_cfs", payload["record"])

    def test_percentile_matches_a_hand_computed_value(self):
        self.assertEqual(rv.percentile([1, 2, 3, 4], 50), 2.5)
        self.assertEqual(rv.percentile([10], 90), 10)

    def test_band_has_one_value_per_water_year_day(self):
        payload = build_small()
        for key in ("p10", "p25", "p50", "p75", "p90"):
            self.assertEqual(len(payload["band"][key]), 365)


class Framing(unittest.TestCase):
    """Label rules carried over from the rain tiles ruling."""

    def test_payload_never_calls_a_figure_typical(self):
        blob = json.dumps(build_small()).lower()
        self.assertNotIn("typical", blob)

    def test_peaks_are_declared_to_be_daily_means(self):
        m = build_small()["method"]
        self.assertIn("daily mean", m["peaks_are_daily_means"].lower())

    def test_payload_disclaims_being_a_forecast(self):
        self.assertIn("not a flood forecast", build_small()["method"]["not_a_forecast"].lower())


class Live(unittest.TestCase):
    def test_live_reading_is_parsed(self):
        out = rv.parse_live(iv(discharge=17.2, gage=3.15))
        self.assertEqual(out["discharge_cfs"], 17.2)
        self.assertEqual(out["gage_height_ft"], 3.15)

    def test_missing_live_feed_does_not_raise(self):
        out = rv.parse_live({"value": {"timeSeries": []}})
        self.assertIsNone(out["discharge_cfs"])


class LiveRecordFigures(unittest.TestCase):
    """Pinned from a real pull 2026-08-27. These are the article's figures.

    If one of these changes, the record changed or the method drifted. Either
    way a human reads it before the page does.
    """

    def setUp(self):
        p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "river.json")
        if not os.path.exists(p):
            self.skipTest("data/river.json not built")
        self.d = json.load(open(p, encoding="utf8"))

    def test_record_span(self):
        r = self.d["record"]
        self.assertEqual(r["first_water_year"], 1937)
        self.assertGreaterEqual(r["reportable_years"], 89)

    def test_highest_daily_mean_is_the_1955_flood(self):
        h = self.d["record"]["highest_daily_mean"]
        self.assertEqual(h["date"], "1955-12-23")
        self.assertEqual(h["cfs"], 17000.0)

    def test_second_flood_shares_a_date_with_the_rain_records_wettest_day(self):
        """Independent corroboration across two agencies. Worth keeping."""
        second = self.d["highest_years"][1]
        self.assertEqual(second["date"], "1982-01-04")
        rain_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                 "data", "rain.json")
        if os.path.exists(rain_path):
            rain = json.load(open(rain_path, encoding="utf8"))
            self.assertEqual(rain["record"]["wettest_day"]["date"], "1982-01-04")

    def test_the_skew_is_large_enough_to_forbid_the_word_average_alone(self):
        r = self.d["record"]
        self.assertGreater(r["mean_daily_cfs"], r["median_daily_cfs"] * 3)


def build_small():
    """Two clean water years plus a live reading."""
    pairs = []
    for wy_start, base in ((2023, 20.0), (2024, 30.0)):
        d = date(wy_start, 10, 1)
        end = date(wy_start + 1, 9, 30)
        i = 0
        while d <= end:
            pairs.append((d.isoformat(), base + (i % 7)))
            d = date.fromordinal(d.toordinal() + 1)
            i += 1
    pairs.append(("2025-10-01", 25.0))
    return rv.build_payload(dv(pairs), iv(17.2, 3.15), date(2025, 10, 2), "2025-10-02T06:00:00-07:00")


if __name__ == "__main__":
    unittest.main(verbosity=2)
