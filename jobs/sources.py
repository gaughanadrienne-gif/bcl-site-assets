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
       "Workday POST json /wday/cxs/scmtd/METRO_Careers/jobs. "
       "VERIFIED HEALTHY 2026-07-28: endpoint returns HTTP 200 with total=0, "
       "i.e. METRO genuinely has no openings. If the zero-yield alarm flags "
       "this source, re-check the endpoint before assuming it is broken.",
       {"host": "https://scmtd.wd12.myworkdayjobs.com", "tenant": "scmtd", "site": "METRO_Careers"}),
    _s("Cabrillo College", "direct_page_reviewed", "neogov", "neogov",
       "https://www.schooljobs.com/careers/cabrilloedu", "area", 5, True, True),
    _s("Central Fire District", "direct_page_reviewed", "calopps", "calopps",
       "https://www.calopps.org/centralfiresc", "employer:Santa Cruz", 6, True, True,
       "task URL 404s; fixed to the real agency slug. County-wide SC agency; "
       "parser yields no per-job city, so geo falls back to the employer hint"),
    _s("City of Capitola", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.cityofcapitola.gov/jobs", "area", 6, False, False, "CivicEngage; JS-render check first"),
    _s("SLV Water District", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.slvwd.com/224/Employment-Opportunities", "area", 7, False, False, "CivicPlus; PDF apply"),
    _s("Scotts Valley Water District", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.svwd.org/HR", "area", 7, False, False, "custom; PDF"),
    # --- Education (EDJOIN) ---
    # ONE county-wide source replaces the six per-district entries that used to
    # sit here (SLVUSD, Live Oak, Santa Cruz City Schools, Soquel Union,
    # Santa Cruz COE, Scotts Valley USD). Two reasons, both found 2026-07-28:
    #
    #  1. All six were enabled and contributing ZERO. EDJOIN renders rows
    #     client-side, firecrawl started returning their "Important Notice"
    #     interstitial, and an empty parse is not an error -- so the run
    #     reported success while 84 local openings went unpublished.
    #  2. `regions=<countyID>` returns every district in the county in a single
    #     call, so new districts and charters appear without a registry edit.
    #     `regions=44` is Santa Cruz County. (`regionID` is NOT a county
    #     filter: regionID=44 returns statewide results.)
    #
    # The geography gate in include_job still decides what actually publishes.
    _s("Santa Cruz County schools (EDJOIN)", "direct_page_reviewed", "http_json", "edjoin",
       "https://www.edjoin.org/Home/LoadJobs?rows=300&page=1&sort=postingDate&sortVal=0&order=desc&keywords=&location=&searchType=all&regions=44&jobTypes=&days=0&empType=&catID=0&onlineApps=&recruitmentCenterID=0&stateID=0&regionID=0&districtID=0&searchID=0",
       "area", 5, True, True,
       "County-wide EDJOIN JSON; covers SLVUSD, Live Oak, SC City Schools, "
       "Soquel, SC COE, Scotts Valley USD and any new district"),
    _s("UC Santa Cruz", "direct_page_reviewed", "peoplesoft", "peoplesoft",
       "https://www.ucsc.edu/careers/", "employer:Santa Cruz", 6, False, False, "PeopleSoft; session-gated, render check"),
    # --- Healthcare ---
    _s("Dominican Hospital / CommonSpirit", "direct_page_reviewed", "icims", "icims",
       "https://careers-commonspirit.icims.com/jobs/search?searchLocation=Santa+Cruz", "area", 6, False, True,
       "DEFERRED: iCIMS SPA does not render job rows to markdown headless; needs a real browser"),
    _s("Kaiser Permanente (SC)", "direct_page_reviewed", "taleo", "taleo",
       "https://www.kaiserpermanentejobs.org/location/santa-cruz-jobs/", "area", 6, False, False, "Taleo/TalentBrew; render check"),
    _s("Sutter / PAMF (SC)", "direct_page_reviewed", "phenom", "phenom",
       "https://jobs.sutterhealth.org/us/en/peninsula/south-bay-and-santa-cruz", "area", 7, False, False, "Phenom JS-render"),
    _s("Central CA Alliance for Health", "direct_page_reviewed", "icims", "icims",
       "https://thealliance.health/about-the-alliance/careers/", "employer:Scotts Valley", 7, False, False, "iCIMS widget; verify"),
    # --- Top employers (structured ATS) ---
    # DISABLED 2026-07-28, both Dayforce sources. Their portals are Next.js and
    # render job rows client-side, so firecrawl returns only a ~1.5KB shell
    # (logo, "Sign In", "Search Jobs" and nothing else). Their own API,
    # /api/geo/<namespace>/jobposting/search, returns 403 to any non-browser
    # client including a full cookie-bearing session, so it is deliberately
    # closed rather than merely undocumented. Working these would need a real
    # JS-executing browser.
    # Left DISABLED rather than enabled-and-permanently-dry: an enabled source
    # that cannot work would trip the zero-yield alarm every single run and
    # train everyone to ignore it, which is worse than not watching at all.
    _s("Bay Photo Lab", "direct_page_reviewed", "dayforce", "dayforce",
       "https://jobs.dayforcehcm.com/en-US/sensaria/CANDIDATEPORTAL", "employer:Scotts Valley", 8, False, True,
       "Dayforce SPA; API 403s to non-browser clients. Needs a rendering fetch."),
    _s("New Leaf Community Markets", "direct_page_reviewed", "dayforce", "dayforce",
       "https://jobs.dayforcehcm.com/en-US/gfh/NEWLEAF", "area", 8, False, True,
       "Dayforce SPA; API 403s to non-browser clients. Needs a rendering fetch."),
    _s("Fox Factory", "direct_page_reviewed", "workday", "workday",
       "https://foxfactory.wd1.myworkdayjobs.com/FOX", "area", 9, True, True,
       "geo-filter to Scotts Valley/Watsonville",
       {"host": "https://foxfactory.wd1.myworkdayjobs.com", "tenant": "foxfactory", "site": "FOX"}),
    _s("Nob Hill Foods / Raley's", "direct_page_reviewed", "oracle", "oracle",
       "https://www.raleys.com/about/careers/job-openings", "area", 9, False, True,
       "DEFERRED: unverified Oracle tenant/siteNumber; needs a real capture",
       {"rest_url": "https://fa-epss-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?keyword=Santa+Cruz",
        "job_url": "https://www.raleys.com/about/careers/job-openings/job/{id}", "keyword": "Santa Cruz"}),
    _s("Safeway (Albertsons)", "direct_page_reviewed", "oracle", "oracle",
       "https://www.albertsonscompanies.com/careers/find-a-job.html", "area", 9, True, True, "Oracle; keyword=Santa Cruz",
       {"rest_url": "https://eofd.fa.us6.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=CX_1001,keyword=Santa Cruz,limit=25",
        "job_url": "https://www.albertsonscompanies.com/careers/find-a-job/job/{id}.html", "keyword": "Santa Cruz"}),
    _s("Joby Aviation", "direct_page_reviewed", "icims", "icims",
       "https://careers-jobyaviation.icims.com/jobs/search", "employer:Santa Cruz", 9, False, True,
       "DEFERRED: iCIMS SPA does not render job rows to markdown headless; needs a real browser"),
    _s("HP (Scotts Valley)", "direct_page_reviewed", "phenom", "phenom",
       "https://apply.hp.com/careers", "employer:Scotts Valley", 10, False, False, "Phenom JS-render; ex-Poly"),
    _s("Dream Inn Santa Cruz", "direct_page_reviewed", "paylocity", "paylocity",
       "https://recruiting.paylocity.com/recruiting/jobs/All/076ee35d-2815-45ca-a6dc-38be74644a87/Dream-Inn", "employer:Santa Cruz", 10, True, True),
    _s("Seascape Beach Resort", "direct_page_reviewed", "paycom", "paycom",
       "https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey=2CE0D003E3DAA595D0729714541C982F", "employer:Aptos", 10, True, True),
    _s("Community Bridges", "direct_page_reviewed", "paycom", "paycom",
       "https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey=5FDAD4C9F20D7D00310983697A309125", "area", 9, True, True),
    _s("Housing Matters", "direct_page_reviewed", "adp", "adp",
       "https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=b7df2a1a-d18b-4096-b14f-3ec9f379f3be", "employer:Santa Cruz", 9, False, True,
       "DEFERRED: ADP serves a bot-wall to headless fetches; needs a real browser"),
    _s("Second Harvest (RSS)", "feed_authorized", "rss", "rss",
       "https://client.hrservicesinc.com/downloads/rss/portals/9876.xml", "area", 8, True, True, "cleanest feed; RSS template",
       {"style": "employer", "employer": "Second Harvest Food Bank Santa Cruz County"}),
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
       "https://weworkremotely.com/remote-jobs.rss", "remote", 15, True, True, "region/country/state tags",
       {"style": "wwr"}),
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
