"""Build data/rain.json for the SLV Rain and Water Year Tracker.

Source: NOAA Regional Climate Centers ACIS, station USC00040673, BEN LOMOND
NO. 4, 435 ft, daily precipitation since 1937. ACIS is free and needs no
token, and it sends Access-Control-Allow-Origin, though the page reads this
precomputed file rather than the API so a reader never waits on 33,000 rows.

Method, carried over unchanged from the rainfall article so the tool and the
article can never disagree (see Articles/Drafts/twenty-years-of-rain-san-lorenzo-valley.md
and agent-memory/bcl-data-article-sources.md):

  * Aggregate by WATER YEAR, October 1 to September 30, named for the year it
    ends in. A water year holds exactly one winter.
  * Count missing DAYS per water year and exclude any year missing more than
    five of them. Monthly sums hide missing days; daily records do not.
  * Verify every water-year total a second, independent way (ACIS monthly
    reduce:sum) and refuse to write if the two disagree.
  * Report median alongside mean.
  * Missing data is stated, never patched, never inferred as dry.

Trace days ("T") are real observations of less than 0.005 in and count as
0.00, not as missing. Multi-day accumulations ("A" on the total, "S" on the
days it covers) keep the water-year arithmetic correct while leaving the
individual days unknown, so both counts are reported separately.

Fetchers are injected so the whole pipeline is testable offline; only main()
touches the network.
"""

import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.bcl_ingest import write_json_atomic  # noqa: E402

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9 is not used here
    ZoneInfo = None

ACIS = "https://data.rcc-acis.org/StnData"
STATION = "USC00040673"
STATION_NAME = "Ben Lomond No. 4"
RECORD_START = "1937-01-01"
MAX_MISSING_DAYS = 5
PACIFIC = "America/Los_Angeles"

# A refresh that produced fewer than this many reportable years means the pull
# or the parse broke; the live file is left alone rather than shrunk.
MIN_REPORTABLE_YEARS = 60
STORM_MIN_INCHES = 0.5
PERCENTILES = (10, 25, 50, 75, 90)

# The canonical 365-day water year, October through September. February 29
# shares an index with February 28: its rain still lands in every cumulative
# total from that point on, so nothing is dropped, and the day-by-day
# climatology stays aligned across leap and non-leap years.
_WY_MONTH_DAYS = [(10, 31), (11, 30), (12, 31), (1, 31), (2, 28), (3, 31),
                  (4, 30), (5, 31), (6, 30), (7, 31), (8, 31), (9, 30)]
WY_DAYS = 365


def _build_index():
    index, labels, i = {}, [], 0
    for month, count in _WY_MONTH_DAYS:
        for day in range(1, count + 1):
            i += 1
            index[(month, day)] = i
            labels.append((month, day))
    index[(2, 29)] = index[(2, 28)]
    return index, labels


_WY_INDEX, WY_LABELS = _build_index()


class RainDataError(Exception):
    """Raised instead of writing a payload that failed a check."""


def pacific_today(now=None):
    """Today's date in Pacific time, with the offset computed for that date.

    Never hardcode a UTC offset: America/Los_Angeles is -7 in summer and -8
    after the first Sunday in November, and a fixed offset silently shifts
    every date across that boundary.
    """
    if now is not None:
        return now.date() if isinstance(now, datetime) else now
    if ZoneInfo is None:  # pragma: no cover
        raise RainDataError("no timezone database available")
    return datetime.now(ZoneInfo(PACIFIC)).date()


def pacific_now_iso(now=None):
    if now is not None:
        return now.isoformat(timespec="seconds")
    if ZoneInfo is None:  # pragma: no cover
        raise RainDataError("no timezone database available")
    return datetime.now(ZoneInfo(PACIFIC)).replace(microsecond=0).isoformat()


def water_year(d):
    """The water year a date belongs to: Oct 1 starts the year that follows."""
    return d.year + 1 if d.month >= 10 else d.year


def water_year_day(d):
    """1-based position of a date within the canonical 365-day water year."""
    return _WY_INDEX[(d.month, d.day)]


def parse_daily(rows, today):
    """ACIS daily rows to [(date, inches or None, flag)], today and earlier.

    A value of "M" is a missing day and yields None. "T" is a trace, a real
    observation of less than 0.005 in, and yields 0.0.
    """
    out = []
    for row in rows or []:
        try:
            d = date.fromisoformat(row[0])
        except (ValueError, TypeError, IndexError):
            continue
        if d > today:
            continue
        cell = row[1]
        if isinstance(cell, list):
            value = cell[0] if cell else "M"
            flag = (cell[1] if len(cell) > 1 else "").strip()
        else:
            value, flag = cell, ""
        if value in ("M", "", None):
            out.append((d, None, flag or "M"))
            continue
        if value == "T":
            out.append((d, 0.0, "T"))
            continue
        try:
            out.append((d, float(value), flag))
        except (TypeError, ValueError):
            out.append((d, None, "M"))
    out.sort(key=lambda r: r[0])
    return out


def parse_monthly(rows, today):
    """ACIS monthly reduce:sum rows to {(year, month): inches}, skipping gaps."""
    out = {}
    for row in rows or []:
        ym = str(row[0])
        try:
            year, month = int(ym[:4]), int(ym[5:7])
        except (ValueError, IndexError):
            continue
        if date(year, month, 1) > today:
            continue
        cell = row[1]
        value = cell[0] if isinstance(cell, list) else cell
        if value in ("M", "", None):
            continue
        out[(year, month)] = 0.0 if value == "T" else float(value)
    return out


def aggregate(days):
    """Per-water-year totals, missing-day counts and coverage."""
    years = {}
    for d, inches, flag in days:
        wy = water_year(d)
        y = years.setdefault(wy, {"wy": wy, "total": 0.0, "missing": 0, "dates": 0,
                                  "accumulated": 0, "first_date": d.isoformat(),
                                  "last_date": d.isoformat(), "last_observation": None})
        y["dates"] += 1
        y["last_date"] = d.isoformat()
        if inches is None:
            y["missing"] += 1
            continue
        if flag == "A":
            y["accumulated"] += 1
        y["total"] = round(y["total"] + inches, 4)
        y["last_observation"] = d.isoformat()
    return years


def reportable_years(years, max_missing=MAX_MISSING_DAYS):
    """Water years complete enough to report: a full year of dates, few gaps.

    A year still in progress is never reportable, however small its gaps: its
    total is not yet a year's rainfall.
    """
    return {wy: y for wy, y in years.items()
            if y["missing"] <= max_missing and y["dates"] >= 365}


def monthly_water_year_totals(monthly, today):
    """Independent water-year totals from the monthly reduce:sum series."""
    out = {}
    for (year, month), inches in monthly.items():
        wy = year + 1 if month >= 10 else year
        out[wy] = round(out.get(wy, 0.0) + inches, 4)
    return out


def cumulative_series(days, wy):
    """Cumulative inches through each of the 365 canonical water-year days.

    Missing days add nothing, so a year with gaps reads as a minimum. That is
    the honest direction to be wrong in, and the gap count says how far.
    """
    per_day = [0.0] * (WY_DAYS + 1)
    for d, inches, _flag in days:
        if water_year(d) != wy or inches is None:
            continue
        per_day[water_year_day(d)] += inches
    out, running = [], 0.0
    for i in range(1, WY_DAYS + 1):
        running += per_day[i]
        out.append(round(running, 2))
    return out


def percentile(sorted_values, pct):
    """Linear interpolation between closest ranks, the common convention."""
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = (len(sorted_values) - 1) * (pct / 100.0)
    low = int(pos)
    high = min(low + 1, len(sorted_values) - 1)
    frac = pos - low
    return sorted_values[low] + (sorted_values[high] - sorted_values[low]) * frac


def percentile_band(series_by_year, percentiles=PERCENTILES):
    """Day-by-day cumulative percentiles across the reportable years."""
    band = {"p%d" % p: [] for p in percentiles}
    for i in range(WY_DAYS):
        column = sorted(s[i] for s in series_by_year)
        for p in percentiles:
            band["p%d" % p].append(round(percentile(column, p), 2))
    return band


def rank_to_date(series_by_year, day_index, inches):
    """How many reportable years were drier by this point in their year.

    Returns (drier_count, total_years). Ties count as not drier, so the answer
    never overstates how unusual the current year is.
    """
    if not series_by_year or inches is None:
        return None
    i = min(max(day_index, 1), WY_DAYS) - 1
    drier = sum(1 for s in series_by_year if s[i] < inches)
    return (drier, len(series_by_year))


def storms(days, wy, min_inches=STORM_MIN_INCHES):
    """Runs of consecutive wet days inside one water year.

    A run ends at a dry day. A missing day also ends it, and any run touching
    a missing day is marked incomplete rather than quietly reported short.
    """
    rows = [(d, inches) for d, inches, _f in days if water_year(d) == wy]
    rows.sort(key=lambda r: r[0])
    known = {d: inches for d, inches in rows}
    out, run = [], []

    def flush():
        if not run:
            return
        total = round(sum(inches for _d, inches in run), 2)
        start, end = run[0][0], run[-1][0]
        before, after = start - timedelta(days=1), end + timedelta(days=1)
        incomplete = (before in known and known[before] is None) or \
                     (after in known and known[after] is None)
        if total >= min_inches:
            out.append({
                "start": start.isoformat(),
                "end": end.isoformat(),
                "days": len(run),
                "inches": total,
                "wettest_day": round(max(inches for _d, inches in run), 2),
                "incomplete": incomplete,
            })
        run.clear()

    for d, inches in rows:
        if inches is None or inches <= 0.0:
            flush()
            continue
        if run and (d - run[-1][0]).days != 1:
            flush()
        run.append((d, inches))
    flush()
    out.sort(key=lambda s: s["start"], reverse=True)
    return out


def missing_dates(days, wy):
    """The dates with no reading in one water year, earliest first."""
    return [d.isoformat() for d, inches, _f in sorted(days, key=lambda r: r[0])
            if inches is None and water_year(d) == wy]


def wet_season_gap_count(gap_dates):
    """How many gaps fell in the wet half, October through March.

    A July gap costs a season total almost nothing here; a January gap can cost
    inches. The difference is the whole reason to publish where the gaps fell
    rather than only how many there were.
    """
    count = 0
    for iso in gap_dates:
        month = date.fromisoformat(iso).month
        if month >= 10 or month <= 3:
            count += 1
    return count


def wettest_day(days, wy=None):
    best = None
    for d, inches, _flag in days:
        if inches is None or (wy is not None and water_year(d) != wy):
            continue
        if best is None or inches > best["inches"]:
            best = {"date": d.isoformat(), "inches": round(inches, 2)}
    return best


def build_payload(daily_rows, monthly_rows, today, generated_at):
    days = parse_daily(daily_rows, today)
    if not days:
        raise RainDataError("no daily rows parsed")
    monthly = parse_monthly(monthly_rows, today)

    years = aggregate(days)
    reportable = reportable_years(years)
    if len(reportable) < MIN_REPORTABLE_YEARS:
        raise RainDataError("only %d reportable water years, expected at least %d"
                            % (len(reportable), MIN_REPORTABLE_YEARS))

    # Independent check: the monthly series must reproduce every daily total.
    mly = monthly_water_year_totals(monthly, today)
    disagreements = [(wy, years[wy]["total"], mly[wy]) for wy in sorted(years)
                     if wy in mly and abs(years[wy]["total"] - mly[wy]) > 0.005]
    if disagreements:
        raise RainDataError("daily and monthly totals disagree: %r" % (disagreements[:5],))
    cross_checked = sorted(wy for wy in years if wy in mly)

    totals = {str(wy): round(y["total"], 2) for wy, y in reportable.items()}
    ordered = sorted(reportable.values(), key=lambda y: y["total"])
    sorted_totals = [round(y["total"], 2) for y in ordered]
    mean = round(sum(sorted_totals) / len(sorted_totals), 2)
    median = round(percentile(sorted_totals, 50), 2)

    ranked = sorted(reportable.values(), key=lambda y: -y["total"])
    wettest = [{"wy": y["wy"], "inches": round(y["total"], 2), "rank": i + 1}
               for i, y in enumerate(ranked[:10])]
    driest = [{"wy": y["wy"], "inches": round(y["total"], 2), "rank": i + 1}
              for i, y in enumerate(reversed(ranked)) if i < 10]

    series_by_year = [cumulative_series(days, wy) for wy in sorted(reportable)]
    band = percentile_band(series_by_year)

    current_wy = water_year(today)
    current = years.get(current_wy)
    if current is None:
        raise RainDataError("no observations at all in the current water year")
    last_obs = current["last_observation"]
    day_index = water_year_day(date.fromisoformat(last_obs)) if last_obs else None
    cumulative = cumulative_series(days, current_wy)
    to_date = round(current["total"], 2)
    gaps = missing_dates(days, current_wy)
    rank = rank_to_date(series_by_year, day_index, to_date) if day_index else None
    normal = band["p50"][day_index - 1] if day_index else None

    excluded = [{"wy": y["wy"], "missing": y["missing"], "inches": round(y["total"], 2),
                 "accumulated": y["accumulated"], "partial": y["dates"] < 365}
                for y in sorted(years.values(), key=lambda y: y["wy"])
                if y["wy"] not in reportable]

    return {
        "updated": today.isoformat(),
        "generated_at": generated_at,
        "station": {
            "id": STATION,
            "name": STATION_NAME,
            "elevation_ft": 435,
            "record_starts": "1937",
            "place": "Ben Lomond, about five miles down-canyon from Boulder Creek",
        },
        "source": {
            "name": "NOAA Regional Climate Centers ACIS",
            "url": "https://www.rcc-acis.org/",
            "station_url": "https://www.ncei.noaa.gov/access/search/data-search/daily-summaries?stations=USC00040673",
        },
        "method": {
            "water_year": "October 1 to September 30, named for the year it ends in",
            "max_missing_days": MAX_MISSING_DAYS,
            "trace_counts_as": 0.0,
            "percentiles": list(PERCENTILES),
            "storm_min_inches": STORM_MIN_INCHES,
            "cross_checked_years": len(cross_checked),
        },
        "record": {
            "reportable_years": len(reportable),
            "first_reportable": min(reportable),
            "last_reportable": max(reportable),
            "first_water_year": min(years),
            "last_water_year": max(years),
            "mean": mean,
            "median": median,
            "wettest_day": wettest_day(days),
        },
        "totals": totals,
        "wettest": wettest,
        "driest": driest,
        "excluded": excluded,
        "band": band,
        "current": {
            "wy": current_wy,
            "to_date": to_date,
            "through": last_obs,
            "day_index": day_index,
            "missing_days": current["missing"],
            "accumulated_days": current["accumulated"],
            "gaps": gaps,
            "wet_season_gaps": wet_season_gap_count(gaps),
            "normal_to_date": normal,
            "drier_years_to_date": rank[0] if rank else None,
            "years_compared": rank[1] if rank else None,
            "cumulative": cumulative[:day_index] if day_index else [],
            "storms": storms(days, current_wy)[:12],
            "wettest_day": wettest_day(days, current_wy),
        },
    }


def acis_post(body):  # pragma: no cover - network
    req = urllib.request.Request(
        ACIS,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as fh:
        return json.loads(fh.read().decode("utf-8"))


def fetch_daily(post=acis_post, end=None):  # pragma: no cover - network
    end = end or (pacific_today() + timedelta(days=1))
    payload = post({"sid": STATION, "sdate": RECORD_START, "edate": end.isoformat(),
                    "elems": [{"name": "pcpn", "add": "f"}]})
    return payload.get("data", []), payload.get("meta", {})


def fetch_monthly(post=acis_post, end=None):  # pragma: no cover - network
    end = end or pacific_today()
    payload = post({"sid": STATION, "sdate": "1937-10", "edate": end.strftime("%Y-%m"),
                    "elems": [{"name": "pcpn", "interval": "mly", "reduce": "sum",
                               "maxmissing": 31}]})
    return payload.get("data", [])


def main():  # pragma: no cover - network
    today = pacific_today()
    daily_rows, meta = fetch_daily()
    monthly_rows = fetch_monthly()
    payload = build_payload(daily_rows, monthly_rows, today, pacific_now_iso())
    if meta.get("name"):
        payload["station"]["acis_name"] = meta["name"]
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "data", "rain.json")
    write_json_atomic(out, payload)
    print("rain.json written: %d reportable water years %d-%d, mean %.2f median %.2f"
          % (payload["record"]["reportable_years"], payload["record"]["first_reportable"],
             payload["record"]["last_reportable"], payload["record"]["mean"],
             payload["record"]["median"]))
    print("water year %d: %.2f in through %s, %d missing days, %d storms"
          % (payload["current"]["wy"], payload["current"]["to_date"],
             payload["current"]["through"], payload["current"]["missing_days"],
             len(payload["current"]["storms"])))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
