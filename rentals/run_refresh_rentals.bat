@echo off
REM Twice-daily (morning + afternoon) rentals refresh for Boulder Creek Local.
REM Scheduled via Task Scheduler (registration is the owner/controller's
REM responsibility -- see plan notes). Mirrors the jobs/EOB wrapper pattern:
REM full PATH, run, guard on exit code, only commit+push on success. NEVER
REM skip the guard; NEVER run --no-verify; NEVER run this from a test.

setlocal

set PATH=C:\Users\Adrie\AppData\Local\Programs\Python\Python314;C:\Users\Adrie\AppData\Local\Programs\Python\Python314\Scripts;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Windows\System32;%PATH%

cd /d "C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets"

python rentals\refresh_rentals.py >> rentals\refresh.log 2>&1

if errorlevel 1 (
    echo %date% %time% refresh_rentals.py failed - skipping commit/push >> rentals\refresh.log
    exit /b 1
)

git add data/rentals.json
git commit -m "Rentals refresh"
git push
curl -s "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/rentals.json" >> rentals\refresh.log 2>&1

endlocal
