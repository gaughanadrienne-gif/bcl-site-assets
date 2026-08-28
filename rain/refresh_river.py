"""Build data/river.json for the San Lorenzo River panel on /rain.

Source: USGS National Water Information System, gauge 11160500, SAN LORENZO R
A BIG TREES CA, drainage area 106 square miles. Daily mean discharge since
1936-10-01, plus live instantaneous discharge and gage height. Free, no token.

Why this lives on /rain rather than its own page: rain is how much fell, the
river is what the valley did with it. One page carrying both is the valley's
water page, and two pages would split the same searches.

Method, deliberately mirroring rain/refresh_rain.py so the two panels can never
tell different stories:

  * Aggregate by WATER YEAR, October 1 to September 30, named for the year it
    ends in. A water year holds exactly one winter.
  * Count missing DAYS per water year and exclude any year missing more than
    five of them, in print. Never patch a gap, never infer a dry day.
  * Report MEDIAN alongside mean, and never call either one "typical". The
    label ruling from the rain tiles applies here and the skew is worse: a
    river's flow distribution is far more skewed than rainfall, so the mean
    sits well above the median and a reader's remembered figure will not match.
  * Build a day-of-water-year percentile band from every reportable year, so a
    reader can see where today sits against 90 years rather than against a
    single average.

Discharge is a daily MEAN in cubic feet per second. It is not a flood forecast
and must never be presented as one; the responsible agency is the NWS California
Nevada River Forecast Center. Peaks here are daily means, which are always LOWER
than the instantaneous peak the river actually hit, and that difference is
stated in the payload rather than smoothed over.

Fetchers are injected so the pipeline is testable offline; only main() touches
the network.
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
except ImportError:  # pragma: no cover
    ZoneInfo = None

SITE = "11160500"
SITE_NAME = "San Lorenzo River at Big Trees"
DRAINAGE_SQ_MI = 106
DV = "https://waterservices.usgs.gov/nwis/dv/"
IV = "https://waterservices.usgs.gov/nwis/iv/"
UA = "BoulderCreekLocal/1.0 (+https://www.bouldercreeklocal.com)"
RECORD_START = "1936-10-01"
PERCENTILES = (10, 25, 50, 75, 90)
MAX_MISSING_DAYS = 5
PACIFIC = ZoneInfo("America/Los_Angeles") if ZoneInfo else None


def _get(url, timeout=300):  # pragma: no cover - network
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def fetch_daily():  # pragma: no cover - network
    url = (DV + "?format=json&sites=" + SITE + "&parameterCd=00060&statCd=00003"
           + "&startDT=" + RECORD_START)
    return _get(url)


def fetch_live():  # pragma: no cover - network
    url = IV + "?format=json&sites=" + SITE + "&parameterCd=00060,00065&siteStatus=all"
    return _get(url, timeout=90)


def pacific_today(now=None):
    now = now or (datetime.now(PACIFIC) if PACIFIC else datetime.now())
    return now.date()


def pacific_now_iso(now=None):
    now = now or (datetime.now(PACIFIC) if PACIFIC else datetime.now())
    return now.isoformat(timespec="seconds")


def water_year(d):
    return d.year + 1 if d.month >= 10 else d.year


def water_year_day(d):
    start = date(water_year(d) - 1, 10, 1)
    return (d - start).days + 1


def parse_daily(payload, today):
    """USGS daily JSON -> sorted [(date, cfs_or_None)] up to and including today."""
    series = payload["value"]["timeSeries"][0]["values"][0]["value"]
    rows = []
    for pt in series:
        d = datetime.strptime(pt["dateTime"][:10], "%Y-%m-%d").date()
        if d > today:
            continue
        raw = pt.get("value")
        try:
            cfs = float(raw)
        except (TypeError, ValueError):
            cfs = None
        # USGS uses large negative sentinels for no-data.
        if cfs is not None and cfs < 0:
            cfs = None
        rows.append((d, cfs))
    rows.sort(key=lambda r: r[0])
    return rows


def fill_calendar(rows):
    """Insert explicit None for calendar days the record does not mention.

    A gap that is simply absent reads as a shorter year, not a gappy one, and
    the missing-day count is the whole basis for excluding a year.
    """
    if not rows:
        return []
    have = dict(rows)
    out = []
    d, last = rows[0][0], rows[-1][0]
    while d <= last:
        out.append((d, have.get(d)))
        d += timedelta(days=1)
    return out


def aggregate(days):
    """-> {wy: {"values": [...], "missing": n, "days": n}}"""
    years = {}
    for d, cfs in days:
        wy = water_year(d)
        y = years.setdefault(wy, {"values": [], "missing": 0, "days": 0})
        y["days"] += 1
        if cfs is None:
            y["missing"] += 1
        else:
            y["values"].append(cfs)
    return years


def reportable_years(years, today, max_missing=MAX_MISSING_DAYS):
    """Complete water years with few enough gaps. The current WY is never in."""
    current = water_year(today)
    out = {}
    for wy, y in years.items():
        if wy >= current or y["missing"] > max_missing or not y["values"]:
            continue
        out[wy] = y
    return out


def percentile(sorted_values, pct):
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * (pct / 100.0)
    lo, hi = int(k), min(int(k) + 1, len(sorted_values) - 1)
    if lo == hi:
        return sorted_values[lo]
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo)


def median(values):
    s = sorted(values)
    return percentile(s, 50)


def daily_band(days, reportable, percentiles=PERCENTILES):
    """Percentile flow for each day of the water year, across reportable years."""
    by_day = {i: [] for i in range(1, 367)}
    for d, cfs in days:
        if cfs is None or water_year(d) not in reportable:
            continue
        by_day[water_year_day(d)].append(cfs)
    band = {}
    for pct in percentiles:
        band["p%d" % pct] = [
            round(percentile(sorted(by_day[i]), pct), 1) if by_day[i] else None
            for i in range(1, 366)
        ]
    return band


def annual_peaks(days, reportable):
    """Highest and lowest DAILY MEAN per reportable water year."""
    peaks, lows = {}, {}
    for d, cfs in days:
        wy = water_year(d)
        if cfs is None or wy not in reportable:
            continue
        if wy not in peaks or cfs > peaks[wy][1]:
            peaks[wy] = (d.isoformat(), cfs)
        if wy not in lows or cfs < lows[wy][1]:
            lows[wy] = (d.isoformat(), cfs)
    return peaks, lows


def rank_today(reportable_by_day, cfs):
    """How many reportable years were LOWER than this on this day of the year."""
    if cfs is None or not reportable_by_day:
        return None, 0
    lower = sum(1 for v in reportable_by_day if v < cfs)
    return lower, len(reportable_by_day)


def parse_live(payload):
    """IV JSON -> {"discharge_cfs":x, "gage_height_ft":y, "observed":iso}"""
    out = {"discharge_cfs": None, "gage_height_ft": None, "observed": None}
    for s in payload.get("value", {}).get("timeSeries", []):
        code = s["variable"]["variableCode"][0]["value"]
        pts = s["values"][0]["value"] if s.get("values") else []
        if not pts:
            continue
        pt = pts[-1]
        try:
            val = float(pt["value"])
        except (TypeError, ValueError):
            continue
        if val < 0:
            continue
        if code == "00060":
            out["discharge_cfs"] = val
            out["observed"] = pt["dateTime"]
        elif code == "00065":
            out["gage_height_ft"] = val
            out["observed"] = out["observed"] or pt["dateTime"]
    return out


def build_payload(daily_payload, live_payload, today, generated_at):
    days = fill_calendar(parse_daily(daily_payload, today))
    years = aggregate(days)
    rep = reportable_years(years, today)
    if not rep:
        raise SystemExit("river: no reportable water years, refusing to write")

    year_means = {wy: sum(y["values"]) / len(y["values"]) for wy, y in rep.items()}
    peaks, lows = annual_peaks(days, rep)

    wettest = sorted(peaks.items(), key=lambda kv: -kv[1][1])[:10]
    driest = sorted(year_means.items(), key=lambda kv: kv[1])[:10]

    cur_wy = water_year(today)
    cur = years.get(cur_wy, {"values": [], "missing": 0, "days": 0})
    latest = next((c for d, c in reversed(days) if c is not None), None)
    latest_date = next((d for d, c in reversed(days) if c is not None), None)

    wyd = water_year_day(latest_date) if latest_date else None
    today_values = []
    if wyd:
        today_values = [c for d, c in days
                        if c is not None and water_year(d) in rep and water_year_day(d) == wyd]
    lower, compared = rank_today(sorted(today_values), latest)

    band = daily_band(days, rep)
    all_daily = [c for _d, c in days if c is not None]

    excluded = sorted(
        [{"wy": wy, "missing": y["missing"]}
         for wy, y in years.items()
         if wy < cur_wy and y["missing"] > MAX_MISSING_DAYS],
        key=lambda r: r["wy"])

    return {
        "updated": today.isoformat(),
        "generated_at": generated_at,
        "gauge": {
            "id": SITE,
            "name": SITE_NAME,
            "drainage_sq_mi": DRAINAGE_SQ_MI,
            "record_starts": RECORD_START[:4],
            "place": "Felton, where the river has already collected the whole valley "
                     "above it, Boulder Creek included.",
        },
        "source": {
            "name": "USGS National Water Information System",
            "url": "https://waterdata.usgs.gov/monitoring-location/11160500/",
            "parameters": "Daily mean discharge (00060) and gage height (00065)",
        },
        "method": {
            "water_year": "October 1 to September 30, named for the year it ends in",
            "max_missing_days": MAX_MISSING_DAYS,
            "units": "Discharge in cubic feet per second, a daily MEAN",
            "peaks_are_daily_means": (
                "Annual highs here are the highest DAILY MEAN, which is always lower "
                "than the instantaneous peak the river actually reached."),
            "not_a_forecast": (
                "This is an observation record, not a flood forecast. Forecasts come "
                "from the NWS California Nevada River Forecast Center."),
            "percentiles": list(PERCENTILES),
        },
        "record": {
            "reportable_years": len(rep),
            "first_reportable": min(rep),
            "last_reportable": max(rep),
            "first_water_year": min(years),
            "last_water_year": max(years),
            "excluded_years": len(excluded),
            "mean_daily_cfs": round(sum(all_daily) / len(all_daily), 1),
            "median_daily_cfs": round(median(all_daily), 1),
            "highest_daily_mean": {
                "date": max(peaks.values(), key=lambda v: v[1])[0],
                "cfs": max(peaks.values(), key=lambda v: v[1])[1],
            },
            "lowest_daily_mean": {
                "date": min(lows.values(), key=lambda v: v[1])[0],
                "cfs": min(lows.values(), key=lambda v: v[1])[1],
            },
        },
        "highest_years": [
            {"wy": wy, "date": v[0], "cfs": v[1], "rank": i + 1}
            for i, (wy, v) in enumerate(wettest)
        ],
        "lowest_years": [
            {"wy": wy, "mean_cfs": round(v, 1), "rank": i + 1}
            for i, (wy, v) in enumerate(driest)
        ],
        "excluded": excluded,
        "band": band,
        "current": {
            "wy": cur_wy,
            "through": latest_date.isoformat() if latest_date else None,
            "day_index": wyd,
            "latest_daily_mean_cfs": latest,
            "missing_days": cur["missing"],
            "median_for_this_day": round(median(today_values), 1) if today_values else None,
            "years_lower_on_this_day": lower,
            "years_compared": compared,
            "live": parse_live(live_payload),
        },
    }


def main():  # pragma: no cover - network
    today = pacific_today()
    payload = build_payload(fetch_daily(), fetch_live(), today, pacific_now_iso())
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "data", "river.json")
    write_json_atomic(out, payload)
    r = payload["record"]
    c = payload["current"]
    print("river.json written: %d reportable water years %d-%d, mean %.1f median %.1f cfs"
          % (r["reportable_years"], r["first_reportable"], r["last_reportable"],
             r["mean_daily_cfs"], r["median_daily_cfs"]))
    print("highest daily mean on record %.0f cfs on %s"
          % (r["highest_daily_mean"]["cfs"], r["highest_daily_mean"]["date"]))
    print("water year %d: %.1f cfs through %s, median for this day %s, %s of %s years lower"
          % (c["wy"], c["latest_daily_mean_cfs"] or 0, c["through"],
             c["median_for_this_day"], c["years_lower_on_this_day"], c["years_compared"]))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
