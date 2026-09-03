# Article reading headers

These text-free 1200x630 WebPs appear inside Around Town articles. They are separate from the
1200x630 title cards that Squarespace continues to use for featured images, grids, Open Graph,
social sharing, and Pinterest.

Build all live headers from the approved source watercolors:

```powershell
python scripts/build_reading_headers.py
python scripts/build_reading_headers.py --check
```

Prepare one header before its article enters the live allowlist:

```powershell
python scripts/build_reading_headers.py --slug <slug>
```

The centered-cover crop matches the established title-card composition. Review each new derivative
visually before publication. A missing reading WebP falls back to the Squarespace featured card.
