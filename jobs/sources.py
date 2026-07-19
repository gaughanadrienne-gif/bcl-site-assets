"""Verified jobs source registry. See docs/superpowers/research/source-registry-raw.md.
Enabled sources are official/public and structured. Sources needing a JS-render or
terms check, or flagged low-confidence, are enabled=False until onboarded."""

from shared.registry import validate_registry


def _s(name, cclass, platform, parser, url, geo, priority, enabled, terms_ok, notes="", config=None):
    return dict(name=name, tool="jobs", collection_class=cclass, platform=platform,
                parser=parser, url=url, geo=geo, priority=priority, enabled=enabled,
                terms_ok=terms_ok, notes=notes, config=config or {})


JOB_SOURCES = [
    # --- Government (structured, public) ---
    _s("County of Santa Cruz", "direct_page_reviewed", "jobaps", "jobaps",
       "https://jobapscloud.com/SCRUZ/", "area", 5, True, True, "11 open at check"),
    _s("City of Santa Cruz", "direct_page_reviewed", "neogov", "neogov",
       "https://www.governmentjobs.com/careers/santacruz", "area", 5, True, True),
    _s("City of Scotts Valley", "direct_page_reviewed", "neogov", "neogov",
       "https://www.governmentjobs.com/careers/scottsvalley", "area", 5, True, True),
    _s("Santa Cruz METRO", "direct_page_reviewed", "workday", "workday",
       "https://scmtd.wd12.myworkdayjobs.com/METRO_Careers", "area", 5, True, True,
       "Workday POST json /wday/cxs/scmtd/METRO_Careers/jobs", {"tenant": "scmtd", "site": "METRO_Careers"}),
    _s("Cabrillo College", "direct_page_reviewed", "neogov", "neogov",
       "https://www.schooljobs.com/careers/cabrilloedu", "area", 5, True, True),
    _s("Central Fire District", "direct_page_reviewed", "calopps", "calopps",
       "https://www.calopps.org/central-fire-district-of-santa-cruz-county", "area", 6, True, True),
    _s("City of Capitola", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.cityofcapitola.gov/jobs", "area", 6, False, False, "CivicEngage; JS-render check first"),
    _s("SLV Water District", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.slvwd.com/224/Employment-Opportunities", "area", 7, False, False, "CivicPlus; PDF apply"),
    _s("Scotts Valley Water District", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.svwd.org/HR", "area", 7, False, False, "custom; PDF"),
    # --- Education (EDJOIN) ---
    _s("SLVUSD (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/Home/Jobs?districtID=813", "area", 5, True, True, "Ben Lomond"),
    _s("Live Oak Elementary (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/LOSD", "area", 5, True, True, "NOT LOUSD Central Valley"),
    _s("Santa Cruz City Schools (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/sccs", "area", 5, True, True),
    _s("Soquel Union (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/suesd", "area", 5, True, True),
    _s("Santa Cruz COE (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/santacruzcoe", "area", 5, True, True),
    _s("Scotts Valley USD (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/scottsvalley", "area", 5, True, True, "NOT Scott Valley USD Siskiyou"),
    _s("UC Santa Cruz", "direct_page_reviewed", "peoplesoft", "peoplesoft",
       "https://www.ucsc.edu/careers/", "employer:Santa Cruz", 6, False, False, "PeopleSoft; session-gated, render check"),
    # --- Healthcare ---
    _s("Dominican Hospital / CommonSpirit", "direct_page_reviewed", "icims", "icims",
       "https://careers-commonspirit.icims.com/jobs/search?searchLocation=Santa+Cruz", "area", 6, True, True),
    _s("Kaiser Permanente (SC)", "direct_page_reviewed", "taleo", "taleo",
       "https://www.kaiserpermanentejobs.org/location/santa-cruz-jobs/", "area", 6, False, False, "Taleo/TalentBrew; render check"),
    _s("Sutter / PAMF (SC)", "direct_page_reviewed", "phenom", "phenom",
       "https://jobs.sutterhealth.org/us/en/peninsula/south-bay-and-santa-cruz", "area", 7, False, False, "Phenom JS-render"),
    _s("Central CA Alliance for Health", "direct_page_reviewed", "icims", "icims",
       "https://thealliance.health/about-the-alliance/careers/", "employer:Scotts Valley", 7, False, False, "iCIMS widget; verify"),
    # --- Top employers (structured ATS) ---
    _s("Bay Photo Lab", "direct_page_reviewed", "dayforce", "dayforce",
       "https://jobs.dayforcehcm.com/en-US/sensaria/CANDIDATEPORTAL", "employer:Scotts Valley", 8, True, True),
    _s("New Leaf Community Markets", "direct_page_reviewed", "dayforce", "dayforce",
       "https://jobs.dayforcehcm.com/en-US/gfh/NEWLEAF", "area", 8, True, True),
    _s("Fox Factory", "direct_page_reviewed", "workday", "workday",
       "https://foxfactory.wd1.myworkdayjobs.com/FOX", "area", 9, True, True,
       "geo-filter to Scotts Valley/Watsonville", {"tenant": "foxfactory", "site": "FOX"}),
    _s("Nob Hill Foods / Raley's", "direct_page_reviewed", "oracle", "oracle",
       "https://www.raleys.com/about/careers/job-openings", "area", 9, False, False, "Oracle Recruiting; keyword filter"),
    _s("Safeway (Albertsons)", "direct_page_reviewed", "oracle", "oracle",
       "https://www.albertsonscompanies.com/careers/find-a-job.html", "area", 9, False, False, "Oracle; keyword=Santa Cruz"),
    _s("Joby Aviation", "direct_page_reviewed", "icims", "icims",
       "https://careers-jobyaviation.icims.com/jobs/search", "employer:Santa Cruz", 9, True, True, "HQ Santa Cruz; filter out Marina"),
    _s("HP (Scotts Valley)", "direct_page_reviewed", "phenom", "phenom",
       "https://apply.hp.com/careers", "employer:Scotts Valley", 10, False, False, "Phenom JS-render; ex-Poly"),
    _s("Dream Inn Santa Cruz", "direct_page_reviewed", "paylocity", "paylocity",
       "https://recruiting.paylocity.com/recruiting/jobs/All/076ee35d-2815-45ca-a6dc-38be74644a87/Dream-Inn", "employer:Santa Cruz", 10, True, True),
    _s("Seascape Beach Resort", "direct_page_reviewed", "paycom", "paycom",
       "https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey=2CE0D003E3DAA595D0729714541C982F", "employer:Aptos", 10, True, True),
    _s("Community Bridges", "direct_page_reviewed", "paycom", "paycom",
       "https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey=5FDAD4C9F20D7D00310983697A309125", "area", 9, True, True),
    _s("Housing Matters", "direct_page_reviewed", "adp", "adp",
       "https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=b7df2a1a-d18b-4096-b14f-3ec9f379f3be", "employer:Santa Cruz", 9, True, True),
    _s("Second Harvest (RSS)", "feed_authorized", "rss", "rss",
       "https://client.hrservicesinc.com/downloads/rss/portals/9876.xml", "area", 8, True, True, "cleanest feed; RSS template"),
    _s("Google (Santa Cruz)", "direct_page_reviewed", "custom_html", "custom_html",
       "https://careers.google.com/jobs/results/?location=Santa%20Cruz", "employer:Santa Cruz", 12, False, False, "office unconfirmed; owner decision"),
    # --- Local boards ---
    _s("Santa Cruz Works", "direct_page_reviewed", "custom_html", "custom_html",
       "https://santacruzworks.org/jobs", "area", 12, False, False, "Airtable-embedded; JS render"),
    _s("Lookout Santa Cruz job board", "direct_page_reviewed", "custom_html", "custom_html",
       "https://lookout.co/santa-cruz-county-job-board", "area", 12, False, False, "check membership gating"),
    # --- Remote (free feeds) ---
    _s("Remotive (remote)", "api_authorized", "remote_json", "remote_json",
       "https://remotive.com/api/remote-jobs", "remote", 15, True, True,
       "must link back + credit; ~4 req/day", {"eligibility_field": "candidate_required_location"}),
    _s("We Work Remotely (remote)", "feed_authorized", "rss", "rss",
       "https://weworkremotely.com/remote-jobs.rss", "remote", 15, True, True, "region/country/state tags"),
    _s("RemoteOK (remote)", "api_authorized", "remote_json", "remote_json",
       "https://remoteok.com/api", "remote", 16, False, False, "403 to plain fetch; needs browser UA"),
    _s("Working Nomads (remote)", "api_authorized", "remote_json", "remote_json",
       "https://www.workingnomads.com/api/exposed_jobs/", "remote", 16, False, False, "no published terms; verify"),
    # --- Discovery-only (link out, never scraped) ---
    _s("LinkedIn Jobs", "discovery_only", "discovery", "discovery",
       "https://www.linkedin.com/jobs/search/?location=Santa%20Cruz%20County", "area", 30, False, False),
    _s("Indeed", "discovery_only", "discovery", "discovery",
       "https://www.indeed.com/jobs?l=Boulder+Creek%2C+CA", "area", 30, False, False),
]

validate_registry(JOB_SOURCES)
