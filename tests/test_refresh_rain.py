"""Tests for the SLV rain tracker pipeline.

The load-bearing property is honesty about gaps: a missing day must never be
read as a dry day, and a year with too many gaps must never reach the
climatology. The article's published figures are asserted directly so the tool
cannot drift away from what is already in print.
"""

from datetime import date

import pytest

from rain.refresh_rain import (
    MAX_MISSING_DAYS, RainDataError, WY_DAYS, aggregate, build_payload,
    cumulative_series, monthly_water_year_totals, pacific_today, parse_daily,
    missing_dates, parse_monthly, percentile, percentile_band, rank_to_date,
    reportable_years, storms, water_year, water_year_day, wet_season_gap_count,
    wettest_day,
)


def cell(value, flag=" "):
    return [value, flag]


def daily_rows(pairs):
    return [[d, cell(*v) if isinstance(v, tuple) else cell(v)] for d, v in pairs]


# ---------------------------------------------------------------- water years

def test_water_year_starts_in_october():
    assert water_year(date(2025, 9, 30)) == 2025
    assert water_year(date(2025, 10, 1)) == 2026
    assert water_year(date(2026, 7, 29)) == 2026


def test_the_canonical_water_year_runs_365_days_from_october():
    assert water_year_day(date(2025, 10, 1)) == 1
    assert water_year_day(date(2026, 9, 30)) == WY_DAYS == 365


def test_leap_day_shares_february_28s_slot_so_its_rain_is_never_dropped():
    assert water_year_day(date(2024, 2, 29)) == water_year_day(date(2024, 2, 28))
    days = parse_daily(daily_rows([
        ("2024-02-28", "1.00"), ("2024-02-29", "2.00"), ("2024-03-01", "0.50"),
    ]), date(2024, 3, 1))
    series = cumulative_series(days, 2024)
    assert series[water_year_day(date(2024, 2, 28)) - 1] == 3.00
    assert series[WY_DAYS - 1] == 3.50


# -------------------------------------------------------------------- parsing

def test_a_missing_day_parses_as_unknown_not_as_zero():
    days = parse_daily(daily_rows([("2026-01-01", ("M", "M"))]), date(2026, 1, 2))
    assert days == [(date(2026, 1, 1), None, "M")]


def test_a_trace_is_a_real_observation_of_almost_no_rain():
    days = parse_daily(daily_rows([("2026-01-01", ("0.00", "T"))]), date(2026, 1, 2))
    assert days[0][1] == 0.0
    assert days[0][2] == "T"


def test_days_after_today_are_dropped_rather_than_counted_as_missing():
    rows = daily_rows([("2026-07-29", "0.10"), ("2026-07-30", ("M", "M"))])
    assert [d for d, _v, _f in parse_daily(rows, date(2026, 7, 29))] == [date(2026, 7, 29)]


def test_an_accumulated_total_keeps_its_flag_so_it_can_be_disclosed():
    rows = daily_rows([("2025-09-23", ("M", "S")), ("2025-09-24", ("M", "M")),
                       ("2025-09-25", ("0.08", "A"))])
    days = parse_daily(rows, date(2025, 9, 30))
    assert [f for _d, _v, f in days] == ["S", "M", "A"]
    years = aggregate(days)
    assert years[2025]["missing"] == 2
    assert years[2025]["accumulated"] == 1
    assert years[2025]["total"] == 0.08


def test_unparseable_values_are_treated_as_missing_not_as_zero():
    days = parse_daily(daily_rows([("2026-01-01", "nonsense")]), date(2026, 1, 2))
    assert days[0][1] is None


# ---------------------------------------------------------------- reportability

def _full_year(wy, per_day="0.10", missing=0):
    rows, d = [], date(wy - 1, 10, 1)
    while d <= date(wy, 9, 30):
        value = ("M", "M") if len(rows) < missing else (per_day, " ")
        rows.append([d.isoformat(), list(value)])
        d = date.fromordinal(d.toordinal() + 1)
    return rows


def test_a_year_with_more_than_five_gaps_is_excluded_not_patched():
    days = parse_daily(_full_year(2000, missing=MAX_MISSING_DAYS + 1), date(2000, 9, 30))
    years = aggregate(days)
    assert years[2000]["missing"] == 6
    assert reportable_years(years) == {}


def test_five_gaps_is_still_reportable():
    days = parse_daily(_full_year(2000, missing=MAX_MISSING_DAYS), date(2000, 9, 30))
    assert set(reportable_years(aggregate(days))) == {2000}


def test_a_year_still_in_progress_is_never_reportable_however_clean():
    rows = _full_year(2026)[:100]
    days = parse_daily(rows, date(2026, 1, 8))
    years = aggregate(days)
    assert years[2026]["missing"] == 0
    assert reportable_years(years) == {}, "a partial year is not a year's rainfall"


# ------------------------------------------------------------------ statistics

def test_percentile_interpolates_between_closest_ranks():
    assert percentile([10, 20, 30, 40], 50) == 25
    assert percentile([10, 20, 30, 40], 0) == 10
    assert percentile([10, 20, 30, 40], 100) == 40
    assert percentile([5], 90) == 5
    assert percentile([], 50) is None


def test_the_band_is_built_day_by_day_and_never_decreases_across_a_year():
    series = [[float(i) for i in range(1, WY_DAYS + 1)],
              [float(2 * i) for i in range(1, WY_DAYS + 1)],
              [float(3 * i) for i in range(1, WY_DAYS + 1)]]
    band = percentile_band(series)
    assert band["p50"][0] == 2.0
    assert band["p10"][-1] <= band["p50"][-1] <= band["p90"][-1]
    for key in band:
        assert band[key] == sorted(band[key]), key


def test_rank_to_date_counts_only_years_that_were_genuinely_drier():
    series = [[1.0] * WY_DAYS, [2.0] * WY_DAYS, [3.0] * WY_DAYS]
    assert rank_to_date(series, 10, 2.0) == (1, 3), "a tie is not drier"
    assert rank_to_date(series, 10, 0.5) == (0, 3)
    assert rank_to_date(series, 10, 9.0) == (3, 3)
    assert rank_to_date([], 10, 1.0) is None


def test_a_gappy_year_reads_as_a_minimum_because_gaps_add_nothing():
    days = parse_daily(daily_rows([
        ("2025-10-01", "1.00"), ("2025-10-02", ("M", "M")), ("2025-10-03", "1.00"),
    ]), date(2025, 10, 3))
    assert cumulative_series(days, 2026)[2] == 2.00


# ---------------------------------------------------------------------- storms

def test_a_storm_is_a_run_of_consecutive_wet_days():
    days = parse_daily(daily_rows([
        ("2025-11-01", "0.00"), ("2025-11-02", "1.20"), ("2025-11-03", "0.90"),
        ("2025-11-04", "0.00"), ("2025-11-05", "0.60"),
    ]), date(2025, 11, 30))
    found = storms(days, 2026)
    assert [(s["start"], s["end"], s["inches"], s["days"]) for s in found] == [
        ("2025-11-05", "2025-11-05", 0.6, 1),
        ("2025-11-02", "2025-11-03", 2.1, 2),
    ]
    assert found[1]["wettest_day"] == 1.2


def test_storms_below_the_floor_are_not_listed():
    days = parse_daily(daily_rows([("2025-11-02", "0.10")]), date(2025, 11, 30))
    assert storms(days, 2026) == []


def test_a_storm_touching_a_missing_day_is_flagged_incomplete():
    days = parse_daily(daily_rows([
        ("2025-11-01", ("M", "M")), ("2025-11-02", "1.20"), ("2025-11-03", "0.00"),
    ]), date(2025, 11, 30))
    assert storms(days, 2026)[0]["incomplete"] is True


def test_a_storm_between_two_dry_days_is_complete():
    days = parse_daily(daily_rows([
        ("2025-11-01", "0.00"), ("2025-11-02", "1.20"), ("2025-11-03", "0.00"),
    ]), date(2025, 11, 30))
    assert storms(days, 2026)[0]["incomplete"] is False


def test_a_missing_day_breaks_a_run_rather_than_bridging_it():
    days = parse_daily(daily_rows([
        ("2025-11-02", "1.00"), ("2025-11-03", ("M", "M")), ("2025-11-04", "1.00"),
    ]), date(2025, 11, 30))
    found = storms(days, 2026)
    assert len(found) == 2, "an unknown day cannot be assumed part of the storm"
    assert all(s["incomplete"] for s in found)


def test_the_gap_dates_are_published_not_just_their_count():
    days = parse_daily(daily_rows([
        ("2025-10-05", ("M", "M")), ("2025-10-06", "1.00"), ("2026-07-07", ("M", "M")),
    ]), date(2026, 7, 29))
    assert missing_dates(days, 2026) == ["2025-10-05", "2026-07-07"]


def test_wet_season_gaps_are_counted_separately_from_summer_ones():
    """A July gap costs a season total nothing; a January gap can cost inches."""
    assert wet_season_gap_count(["2025-10-05", "2026-01-20", "2026-03-31"]) == 3
    assert wet_season_gap_count(["2026-04-18", "2026-06-02", "2026-07-07"]) == 0
    assert wet_season_gap_count([]) == 0


def test_wettest_day_ignores_gaps_and_can_be_scoped_to_one_year():
    days = parse_daily(daily_rows([
        ("2025-11-02", "3.00"), ("2025-11-03", ("M", "M")), ("2026-10-02", "1.00"),
    ]), date(2026, 10, 2))
    assert wettest_day(days) == {"date": "2025-11-02", "inches": 3.0}
    assert wettest_day(days, 2027) == {"date": "2026-10-02", "inches": 1.0}


# ------------------------------------------------------------ the monthly check

def test_the_monthly_series_is_summed_into_water_years_independently():
    monthly = parse_monthly([["2025-10", cell("2.00")], ["2025-11", cell("3.00")],
                             ["2026-01", cell("4.00")], ["2025-09", cell("1.00")]],
                            date(2026, 7, 29))
    totals = monthly_water_year_totals(monthly, date(2026, 7, 29))
    assert totals[2026] == 9.0
    assert totals[2025] == 1.0


def test_build_payload_refuses_to_write_when_the_two_methods_disagree():
    rows = []
    for wy in range(1940, 2010):
        rows.extend(_full_year(wy))
    daily = rows
    monthly = [["1940-10", cell("999.00")]]
    with pytest.raises(RainDataError, match="disagree"):
        build_payload(daily, monthly, date(2009, 9, 30), "2026-07-29T12:00:00-07:00")


def test_build_payload_refuses_a_short_record_rather_than_shrinking_the_file():
    with pytest.raises(RainDataError, match="reportable"):
        build_payload(_full_year(2000), [], date(2000, 9, 30), "2026-07-29T12:00:00-07:00")


def test_build_payload_refuses_an_empty_pull():
    with pytest.raises(RainDataError, match="no daily rows"):
        build_payload([], [], date(2026, 7, 29), "2026-07-29T12:00:00-07:00")


# ------------------------------------------------------------------- timezone

def test_pacific_today_is_computed_not_offset_by_a_constant():
    """The DST boundary is why a fixed UTC offset is banned portfolio-wide."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    pacific = ZoneInfo("America/Los_Angeles")
    summer = datetime(2026, 7, 1, 23, 30, tzinfo=pacific)
    winter = datetime(2026, 11, 30, 23, 30, tzinfo=pacific)
    assert summer.utcoffset().total_seconds() / 3600 == -7
    assert winter.utcoffset().total_seconds() / 3600 == -8
    assert pacific_today(summer) == date(2026, 7, 1)
    assert pacific_today(winter) == date(2026, 11, 30)


# ------------------------------------------- the article's published figures

ARTICLE_FIGURES = {
    2021: 21.51, 2023: 85.13, 1983: 95.65, 2017: 94.62, 1977: 19.97, 1976: 21.60,
    2014: 22.83, 1990: 24.30, 1998: 82.80, 1958: 80.61, 2006: 74.62, 2007: 29.03,
    2008: 38.79, 2009: 38.55, 2010: 56.20, 2013: 36.85, 2015: 34.44, 2016: 46.62,
    2018: 33.77, 2019: 65.26, 2020: 31.38, 2022: 44.58,
}


@pytest.fixture(scope="module")
def live_payload():
    """The generated data/rain.json, if a refresh has been run locally."""
    import json
    import os
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "rain.json")
    if not os.path.exists(path):
        pytest.skip("data/rain.json not generated yet; run rain/refresh_rain.py")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def test_the_payload_matches_every_water_year_total_already_in_print(live_payload):
    for wy, inches in sorted(ARTICLE_FIGURES.items()):
        assert live_payload["totals"][str(wy)] == inches, "WY%d contradicts the article" % wy


def test_the_payload_matches_the_articles_mean_median_and_year_count(live_payload):
    assert live_payload["record"]["reportable_years"] == 67
    assert live_payload["record"]["first_reportable"] == 1940
    assert live_payload["record"]["last_reportable"] == 2023
    assert live_payload["record"]["mean"] == 49.09
    assert live_payload["record"]["median"] == 42.69


def test_the_payload_matches_the_articles_wettest_and_driest_rankings(live_payload):
    assert [(w["wy"], w["inches"]) for w in live_payload["wettest"][:5]] == [
        (1983, 95.65), (2017, 94.62), (2023, 85.13), (1998, 82.80), (1958, 80.61)]
    assert [(d["wy"], d["inches"]) for d in live_payload["driest"][:5]] == [
        (1977, 19.97), (2021, 21.51), (1976, 21.60), (2014, 22.83), (1990, 24.30)]


def test_the_years_the_article_calls_out_as_gappy_are_the_excluded_ones(live_payload):
    excluded = {row["wy"] for row in live_payload["excluded"]}
    for wy in (2011, 2012, 2024, 2025):
        assert wy in excluded, "WY%d is named in the article as unreportable" % wy
    assert live_payload["current"]["wy"] in excluded, "the year in progress is not reportable"


def test_both_aggregation_methods_covered_the_whole_record(live_payload):
    assert live_payload["method"]["cross_checked_years"] >= 85


def test_the_current_year_publishes_every_gap_it_has(live_payload):
    current = live_payload["current"]
    assert len(current["gaps"]) == current["missing_days"]
    assert current["wet_season_gaps"] == wet_season_gap_count(current["gaps"])
