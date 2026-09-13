@echo off
REM Daily jobs refresh for Boulder Creek Local. Scheduled via Task Scheduler
REM (registration is the owner/controller's responsibility -- see plan notes).
REM Mirrors the EOB wrapper pattern: full PATH, run, guard on exit code, only
REM commit+push on success. NEVER skip the guard; NEVER run --no-verify.

setlocal

set PATH=C:\Users\Adrie\AppData\Local\Programs\Python\Python314;C:\Users\Adrie\AppData\Local\Programs\Python\Python314\Scripts;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Users\Adrie\AppData\Roaming\npm;C:\Windows\System32;%PATH%

cd /d "C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets"

python jobs\refresh_jobs.py >> jobs\refresh.log 2>&1

if errorlevel 1 (
    echo %date% %time% refresh_jobs.py failed - skipping commit/push >> jobs\refresh.log
    exit /b 1
)

REM Publish (2026-09-13). The old add/commit/push failed non-fast-forward whenever
REM another session pushed first, still exited 0, and left the live feed stuck for
REM two days. publish_data_file.py builds the commit on top of origin in a private
REM index and never touches this checkout's working tree or other sessions' edits.
python scripts\publish_data_file.py -m "Daily jobs refresh" data/jobs.json >> jobs\refresh.log 2>&1
if errorlevel 1 (
    echo %date% %time% publish failed - live jobs feed NOT updated >> jobs\refresh.log
    exit /b 1
)
curl -s "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/jobs.json" >> jobs\refresh.log 2>&1

endlocal
