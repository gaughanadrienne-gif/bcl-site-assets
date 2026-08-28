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


REM River, added 2026-08-27. Same page, same task, ONE commit and ONE push, so
REM two jobs can never race the git index. A river failure must not block the
REM rain publish, so it is guarded separately and only adds its file on success.
set RIVER_OK=0
python rain\refresh_river.py >> rain\refresh.log 2>&1
if errorlevel 1 (
    echo %date% %time% refresh_river.py failed - publishing rain only >> rain\refresh.log
) else (
    set RIVER_OK=1
)

REM Explicit pathspecs only. data/articles.json and other data files are edited by
REM hand and by other sessions; a bare "git add ." here would commit someone else's
REM work in progress. See agent-memory a-shared-json-file-commits-another-sessions-work.
git add data/rain.json
if "%RIVER_OK%"=="1" git add data/river.json
git commit -m "Daily water refresh: rain and river"
git push
curl -s "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/rain.json" >> rain\refresh.log 2>&1
if "%RIVER_OK%"=="1" curl -s "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/river.json" >> rain\refresh.log 2>&1

endlocal
