@echo off
REM Daily rain refresh for Boulder Creek Local. Mirrors the jobs and rentals
REM wrappers: full PATH, run, guard on exit code, only commit and push on success.
REM
REM NOT YET REGISTERED IN TASK SCHEDULER, and registering it is the owner's call:
REM the first successful run commits data/rain.json and pushes it, which makes it
REM public. data/*.json rides @main, so a data change needs a jsDelivr purge and
REM NOT a SHA repin. Only bcl-tools.js needs the pin moved.
REM
REM Suggested slot once approved: daily at 6:50 AM, after the jobs and rentals
REM refreshes and before the search-index rebuild. Ben Lomond No. 4 is a
REM once-a-day cooperative gauge whose readings reach NOAA on a delay, so once
REM a day is as fresh as this source gets; more often just burns API calls.
REM
REM refresh_rain.py refuses to write at all if the record comes back short or if
REM the daily and monthly aggregations disagree, so a broken pull leaves the live
REM file untouched and this wrapper exits nonzero without committing.

setlocal

set PATH=C:\Users\Adrie\AppData\Local\Programs\Python\Python314;C:\Users\Adrie\AppData\Local\Programs\Python\Python314\Scripts;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Users\Adrie\AppData\Roaming\npm;C:\Windows\System32;%PATH%

cd /d "C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets"

python rain\refresh_rain.py >> rain\refresh.log 2>&1

if errorlevel 1 (
    echo %date% %time% refresh_rain.py failed - skipping commit/push >> rain\refresh.log
    exit /b 1
)

git add data/rain.json
git commit -m "Daily rain refresh"
git push
curl -s "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/rain.json" >> rain\refresh.log 2>&1

endlocal
