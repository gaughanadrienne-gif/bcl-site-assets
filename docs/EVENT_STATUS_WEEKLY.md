# Weekly event organizer check

`scripts/run_event_status_weekly.bat` re-reads every upcoming event URL and writes two local artifacts:

- `review/events-status-review.json` is the stable human review queue. Repeated identical runs do not rewrite it, and the checker preserves `decision`, `review_note`, and `reviewed_at` when a reviewer edits those fields.
- `review/events-status-latest.json` is timestamped diagnostic evidence from the latest run.

The weekly wrapper loads the event list from the public jsDelivr `@main/data/events.json` feed with `--published`. The fetch uses verified TLS, a 30-second timeout, and a 5 MB response limit. A fetch, certificate, HTTP, or JSON failure exits with status 2 before either review artifact is written. It never falls back to the local checkout's `data/events.json`, which may contain unpublished work.

The check is read-only. It never edits or publishes `data/events.json`. A reviewer must confirm each organizer signal and then accept or reject the corresponding feed correction. A `BLOCKED` finding means the organizer refused or interrupted automated access. It is never evidence that an event was cancelled. A `DEAD` finding requires the same 404 or 410 result twice in one run.

## Staged Task Scheduler recipe

The task is intentionally not registered by this repository change. After the code is released into the shared BCL checkout, an authorized controller can stage it for Wednesday at 6:10 a.m. Pacific with:

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'cmd.exe' `
  -Argument '/c ""C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets\scripts\run_event_status_weekly.bat""'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At '6:10 AM'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask `
  -TaskName 'BCL-EventStatusCheck' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Read-only weekly organizer status check; human review required before event feed changes.'
```

Before registration, run the wrapper once from the shared checkout and confirm:

1. `events-status-review.json` contains only `CANCELLED`, twice-confirmed `DEAD`, and `BLOCKED` findings.
2. A second identical run reports the review file as unchanged.
3. Any existing reviewer decision and note survive the second run.
4. No file under `data/` changes.

Task Scheduler should retain the script's nonzero exit when `CANCELLED` or `DEAD` findings exist so the review need is visible. Blocks alone keep exit status zero, but remain in the review queue for a browser check.
