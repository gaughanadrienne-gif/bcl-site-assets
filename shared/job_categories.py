"""Deterministic job-category classifier for the BCL jobs board.

WHY THIS EXISTS
The jobs tool builds its category dropdown from whatever `category` values are
present in data/jobs.json. On 2026-07-29, 320 of 326 jobs had an EMPTY category
and the remaining 6 carried whatever word their source happened to use ("Fire",
"Front Office", "911 Telecommunications"). A dropdown built from that is
useless. Fixing the DATA fixes the UI with no JS change.

DESIGN RULES
- Deterministic and offline: keyword rules only, no model, no network.
- ONE stable vocabulary (`CATEGORIES`). A source-supplied category is treated
  as an extra keyword SIGNAL, never as an output value, so 'Fire' and
  'Law Enforcement' both land in the same bucket a reader can filter on.
- Never blank. Anything that matches nothing is "Other".
- Order matters and is the whole design (see ORDERED_RULES below): the rules
  run top to bottom and the FIRST match wins, so the more specific occupational
  signal beats the more general one. "Substitute Custodian" is custodial work
  at a school, not teaching; "Nursing - Associate Instructor" is a teaching
  post at Cabrillo, not a nursing post. Both are decided by rule order.
- Title first, then employer. A school custodian should file under trades, so
  the employer is only consulted when the title says nothing occupational.
"""
from __future__ import annotations

import re

EDUCATION = "Education"
HEALTHCARE = "Healthcare"
PUBLIC_SAFETY = "Public Safety"
FOOD_HOSPITALITY = "Food & Hospitality"
RETAIL = "Retail"
OFFICE_ADMIN = "Office & Admin"
TRADES = "Trades & Maintenance"
SALES_MARKETING = "Sales & Marketing"
TECHNOLOGY = "Technology"
OTHER = "Other"

# The published vocabulary. Anything not in this tuple is a bug.
CATEGORIES = (
    EDUCATION, HEALTHCARE, PUBLIC_SAFETY, FOOD_HOSPITALITY, RETAIL,
    OFFICE_ADMIN, TRADES, SALES_MARKETING, TECHNOLOGY, OTHER,
)

# Ordered (category, keywords) rules matched against the job TITLE.
# Read this list as a priority order, not as a set of definitions.
ORDERED_RULES = (
    # 1. Teaching first. A teaching post keeps its subject's vocabulary
    #    ("Nursing ... Associate Instructor", "Fire Technology ... Instructor"),
    #    so unless teaching wins here those postings scatter across Healthcare
    #    and Public Safety and the Education filter loses its biggest employer.
    (EDUCATION, (
        "teacher", "teaching", "instructor", "professor", "faculty", "lecturer",
        "paraeducator", "para-educator", "paraprofessional", "instructional aide",
        "instructional assistant", "tutor", "assistant principal", "vice principal", "school principal",
        "superintendent",
        "curriculum", "literacy coach", "school psychologist", "esl ", "ged ",
        "adult ed", "preschool", "child development", "childcare", "after school",
        "yard duty", "recess", "study hall", "librar", "student services",
        "school office", "classroom", "kindergarten", "substitute site",
        "behavior intervention", "expanded learning", "elop", "head start",
        "site administrator", "college and career", "outdoor science",
        "education", "coach",
    )),
    # 2. Public safety and the courts. Distinct enough from healthcare that it
    #    must be settled before "emergency"/"medical" words are read.
    (PUBLIC_SAFETY, (
        "police", "sheriff", "deputy", "firefighter", "fire captain",
        "fire engineer", "dispatcher", "911", "telecommunicator", "correctional",
        "code enforcement", "park ranger", "ranger", "district attorney",
        "public safety", "emergency dispatch", "reserve officer",
    )),
    # 3. Clinical and care work.
    (HEALTHCARE, (
        "nurse", "nursing", "cna", "certified nursing", "medical assist",
        "patient care", "dental", "hygien", "pharmacist", "pharmacy",
        "therapist", "therapy", "behavior analyst", "bcba", "care manager",
        "caregiver", "home health", "nutritionist", "dietit", "wic nutrition",
        "mental health", "clinical", "phlebotom", "veterinar", "physician",
        "paramedic", "emt", "health care assistant", "healthcare", "counselor",
        "wellness coach", "optomet", "radiolog",
    )),
    # 4. Kitchens, dining rooms and lodging front-of-house.
    (FOOD_HOSPITALITY, (
        "cook", "chef", "kitchen", "dishwasher", "barista", "server", "busser",
        "banquet", "cafeteria", "food service", "food & nutrition",
        "food and nutrition", "food production", "food lab", "deli ", "bakery",
        "baker", "cake decorator", "catering", "front desk", "housekeep",
        "restaurant", "bartender", "hotel", "hostess", "host ", "concierge",
        "line cook", "sous ",
    )),
    # 5. Hands-on and facilities work. Kept above Retail because "Fleet
    #    Technician / School Bus Driver" reads as a trade, not a store job.
    (TRADES, (
        "custodian", "janitor", "maintenance", "groundskeeper", "grounds ",
        "landscap", "driver", "bus operator", "fleet", "mechanic", "hvac",
        "plumb", "electrician", "carpent", "construction", "welder", "machinist",
        "cnc", "warehouse", "forklift", "laborer", "painter", "roofer",
        "utility worker", "facilities", "equipment operator", "installer",
        "arborist", "tree climber",
    )),
    # 6. Store floor work.
    (RETAIL, (
        "cashier", "clerk", "stocker", "front end", "retail", "store support",
        "fuel station", "merchandis", "sales associate", "checker", "courtesy",
        "produce", "grocery",
    )),
    # 7. Desk work that is not sales and not engineering.
    (OFFICE_ADMIN, (
        "administrative", "admin assistant", "receptionist", "office assistant",
        "secretary", "clerical", "accountant", "accounting", "payroll",
        "bookkeep", "data entry", "human resources", "executive assistant",
        "billing", "financial analyst", "auditor", "audit officer", "controller",
        "office manager", "records ", "scheduler", "dispatch clerk",
        # Legal sits here, NOT in Public Safety: only the district attorney's
        # office is public safety, and that keyword is matched above.
        "attorney", "counsel", "paralegal", "legal ",
    )),
    # 8. Revenue-facing roles. Above Technology so "Solutions Engineer" and
    #    "Sales Engineer" file where a jobseeker would look for them.
    (SALES_MARKETING, (
        # "sales " with the trailing space on purpose: bare "sales" files
        # "Salesforce Data Analytics Lead" under Sales. The haystack is
        # space-padded, so this still matches a title ending in "Sales".
        "sales ", "account executive", "account manager", "marketing",
        "business development", "demand generation", "growth strategist",
        "seo", "social media", "brand ", "copywriter", "content strategist",
        "revenue operations", "customer success", "customer support",
        "customer happiness", "customer operations", "advertis", "public relations",
        "outreach associate", "partnerships",
    )),
    # 9. Everything engineering/product/data. Last of the real rules because
    #    its words ("technical", "product", "data") are the most promiscuous.
    (TECHNOLOGY, (
        "engineer", "developer", "software", "devops", "sre ", "programmer",
        "systems administrator", "sysadmin", "help desk", "service desk",
        "it specialist", "it maintenance", "information technology",
        "data analyst", "data scientist", "data labeling", "database", "analytics",
        "machine learning", "blockchain", "cybersecurity", "security analyst",
        "network", "cloud", "architect", "product manager", "product design",
        "ux ", "ui ", "qa engineer", "web ", "wordpress", "sharepoint",
        "technical", "ai ", "video editor", "automation specialist",
    )),
)

# Consulted only when the title matched nothing. Keyed on the employer name.
EMPLOYER_RULES = (
    (EDUCATION, ("school", "district", "college", "academy", "unified",
                 "office of education", "university", "charter")),
    (PUBLIC_SAFETY, ("police", "fire district", "sheriff", "district attorney",
                     "county of", "city of")),
    (HEALTHCARE, ("health", "hospital", "medical", "clinic", "dental",
                  "dexcom", "hospice")),
    (FOOD_HOSPITALITY, ("resort", "inn", "hotel", "restaurant", "cafe",
                        "bakery", "grill", "brewery")),
    (RETAIL, ("safeway", "albertsons", "market", "grocery", "store")),
)

_WORD_SPLIT = re.compile(r"\s+")
_MATCHERS = {}


def _matches(keyword, haystack):
    """True when `keyword` appears in `haystack` at a WORD START.

    Word-start anchoring is not decoration: without it "elop" (the after-school
    program) matches inside "devELOPment" and files a Twilio engineering post
    under Education. The END is deliberately left open so a stem like "librar"
    or "hygien" still covers its whole family; write a trailing space
    ("deli ", "ai ") when the end must be anchored too.
    """
    rx = _MATCHERS.get(keyword)
    if rx is None:
        rx = _MATCHERS[keyword] = re.compile(r"(?<![a-z0-9])" + re.escape(keyword))
    return rx.search(haystack) is not None


def _hay(*parts):
    """Lowercased, whitespace-collapsed, space-padded haystack.

    The padding lets a rule keyword end in a space ("esl ", "ai ") to demand a
    word boundary without needing a regex per keyword.
    """
    joined = " ".join(str(p) for p in parts if p).lower().replace("/", " / ")
    return " " + _WORD_SPLIT.sub(" ", joined).strip() + " "


def classify_job(title, employer="", source_category="", description=""):
    """Return one of CATEGORIES for a job. Never returns "" and never raises.

    `source_category` is whatever word the source volunteered (NeoGov's job
    class, for example). It is folded into the title haystack as an extra
    signal and is never emitted as-is, so the published vocabulary stays fixed.
    `description` is a weak last signal, used only for the employer-less case.
    """
    title_hay = _hay(title, source_category)
    for category, keywords in ORDERED_RULES:
        for kw in keywords:
            if _matches(kw, title_hay):
                return category

    employer_hay = _hay(employer)
    for category, keywords in EMPLOYER_RULES:
        for kw in keywords:
            if _matches(kw, employer_hay):
                return category

    desc_hay = _hay(description)
    for category, keywords in ORDERED_RULES:
        for kw in keywords:
            if _matches(kw, desc_hay):
                return category

    return OTHER
