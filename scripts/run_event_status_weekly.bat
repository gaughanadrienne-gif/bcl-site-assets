@echo off
REM Weekly read-only organizer check. This produces review artifacts and never
REM edits or publishes data/events.json. Task registration remains a separate
REM owner/controller step documented in docs/EVENT_STATUS_WEEKLY.md.

setlocal

set PATH=C:\Users\Adrie\AppData\Local\Programs\Python\Python314;C:\Users\Adrie\AppData\Local\Programs\Python\Python314\Scripts;C:\Windows\System32;%PATH%

cd /d "C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets"
if errorlevel 1 exit /b 2
if not exist review mkdir review

python scripts\check_event_status.py ^
  --published ^
  --review review\events-status-review.json ^
  --json review\events-status-latest.json ^
  >> review\events-status.log 2>&1

set CHECK_RESULT=%ERRORLEVEL%
if %CHECK_RESULT% NEQ 0 (
    echo %date% %time% event status findings require human review >> review\events-status.log
)

endlocal & exit /b %CHECK_RESULT%
