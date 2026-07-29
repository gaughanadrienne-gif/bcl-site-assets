"""The classifier's rule ORDER is the design, so these test the order.

Each case below is a real title from the 2026-07-29 board that lands in the
wrong bucket if the rules are reordered or a keyword loses its word boundary.
"""
from shared.job_categories import CATEGORIES, classify_job
from jobs.normalize import normalize_job


def test_a_teaching_post_keeps_its_subjects_words_but_files_under_education():
    # Cabrillo posts its faculty openings with the subject first. If Healthcare
    # or Public Safety ran before Education these would scatter.
    assert classify_job("Nursing, Clinical - Associate Instructor", "Cabrillo College") == "Education"
    assert classify_job("Fire Technology (FT)/EMT - Associate Instructor", "Cabrillo College") == "Education"


def test_support_staff_at_a_school_file_by_the_work_not_the_employer():
    district = "Pajaro Valley Unified School District"
    assert classify_job("Substitute Custodian (On-call)", district) == "Trades & Maintenance"
    assert classify_job("SCHOOL BUS DRIVER - SUBSTITUTES", district) == "Trades & Maintenance"
    assert classify_job("Food Service Worker I", district) == "Food & Hospitality"
    assert classify_job("Administrative Secretary I", district) == "Office & Admin"


def test_keywords_match_at_a_word_start_only():
    # "elop" (the after-school program) is inside "devELOPment"; without the
    # word-start anchor this Twilio engineering post filed under Education.
    assert classify_job(
        "Senior Principal, Technical Program Management (Research & Development)", "Twilio"
    ) == "Technology"
    # ...and "sales" is inside "Salesforce".
    assert classify_job("Salesforce & Omnichannel Data Analytics Lead", "Bavarian Nordic") == "Technology"
    assert classify_job("Inside Sales Contractor", "Credit Wellness, LLC") == "Sales & Marketing"


def test_the_source_category_is_a_signal_not_an_output():
    # NeoGov hands us "Fire" and "Law Enforcement"; both must come out as the
    # one word the dropdown offers, never as the source's own vocabulary.
    assert classify_job("Paid Call Firefighter", "Central Fire District", "Fire") == "Public Safety"
    assert classify_job("Reserve Officer", "Police Dept", "Law Enforcement") == "Public Safety"
    assert classify_job("Emergency Dispatcher/Clerk I", "Police Dept", "911 Telecommunications") == "Public Safety"


def test_the_employer_decides_only_when_the_title_says_nothing():
    assert classify_job("General Resource Assistant, Essential Supports Center", "Cabrillo College") == "Education"
    assert classify_job("Banquet Set Up", "Seascape Beach Resort") == "Food & Hospitality"


def test_an_unrecognized_job_is_other_and_never_blank():
    result = classify_job("Freelance Writer", "IAPWE")
    assert result == "Other"
    assert classify_job("", "") == "Other"
    assert result in CATEGORIES


def test_normalize_job_always_publishes_a_category_from_the_vocabulary():
    """The whole point: the tool builds its dropdown from this field, so an
    empty value would silently drop the row out of every filter."""
    job = normalize_job(
        {"title": "Deli Associate", "url": "https://example.com/1", "city": "Scotts Valley"},
        {"name": "Safeway (Albertsons)"}, "2026-07-29",
    )
    assert job["category"] == "Food & Hospitality"

    blank = normalize_job({"title": "Widget Wrangler", "url": "https://example.com/2"},
                          {"name": "Nobody Inc"}, "2026-07-29")
    assert blank["category"] == "Other"
    assert blank["category"] in CATEGORIES
