@echo off
REM Spotlight feed publish for Boulder Creek Local (2026-10-01).
REM Copies only the started weeks from the private schedule
REM (Social Media\Blotato_2026_H2\spotlight-schedule.json) into data/spotlight.json,
REM publishes that one file and purges jsDelivr. See scripts\publish_spotlight.py.
REM Task Scheduler: BCL-SpotlightPublish, Thursday 00:05 plus a daily 07:05 catch-up.

setlocal

set PATH=C:\Users\Adrie\AppData\Local\Programs\Python\Python314;C:\Users\Adrie\AppData\Local\Programs\Python\Python314\Scripts;C:\Program Files\Git\cmd;C:\Windows\System32;%PATH%

cd /d "C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets"

python scripts\publish_spotlight.py >> scripts\publish_spotlight.log 2>&1
if errorlevel 1 exit /b 1

endlocal
