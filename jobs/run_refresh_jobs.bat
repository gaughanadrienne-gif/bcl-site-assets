@echo off
REM Daily jobs refresh for Boulder Creek Local. Scheduled via Task Scheduler
REM (registration is the owner/controller's responsibility -- see plan notes).
REM Mirrors the EOB wrapper pattern: full PATH, run, guard on exit code, only
REM commit+push on success. NEVER skip the guard; NEVER run --no-verify.

setlocal

set PATH=C:\Users\Adrie\AppData\Local\Programs\Python\Python314;C:\Users\Adrie\AppData\Local\Programs\Python\Python314\Scripts;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Windows\System32;%PATH%

cd /d "C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets"

python jobs\refresh_jobs.py >> jobs\refresh.log 2>&1

if errorlevel 1 (
    echo %date% %time% refresh_jobs.py failed - skipping commit/push >> jobs\refresh.log
    exit /b 1
)

git add data/jobs.json
git commit -m "Daily jobs refresh"
git push
curl -s "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/jobs.json" >> jobs\refresh.log 2>&1

endlocal
