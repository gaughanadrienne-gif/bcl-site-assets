@echo off
REM Twice-daily (morning + afternoon) rentals refresh for Boulder Creek Local.
REM Scheduled via Task Scheduler (registration is the owner/controller's
REM responsibility -- see plan notes). Mirrors the jobs/EOB wrapper pattern:
REM full PATH, run, guard on exit code, only commit+push on success. NEVER
REM skip the guard; NEVER run --no-verify; NEVER run this from a test.

setlocal

set PATH=C:\Users\Adrie\AppData\Local\Programs\Python\Python314;C:\Users\Adrie\AppData\Local\Programs\Python\Python314\Scripts;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Users\Adrie\AppData\Roaming\npm;C:\Windows\System32;%PATH%

cd /d "C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets"

python rentals\refresh_rentals.py >> rentals\refresh.log 2>&1

if errorlevel 1 (
    echo %date% %time% refresh_rentals.py failed - skipping commit/push >> rentals\refresh.log
    exit /b 1
)

REM Publish (2026-09-13). The old add/commit/push failed non-fast-forward whenever
REM another session pushed first, still exited 0, and left the live feed stuck for
REM two days. publish_data_file.py builds the commit on top of origin in a private
REM index and never touches this checkout's working tree or other sessions' edits.
python scripts\publish_data_file.py -m "Rentals refresh" data/rentals.json >> rentals\refresh.log 2>&1
if errorlevel 1 (
    echo %date% %time% publish failed - live rentals feed NOT updated >> rentals\refresh.log
    exit /b 1
)
curl -s "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/rentals.json" >> rentals\refresh.log 2>&1

endlocal
