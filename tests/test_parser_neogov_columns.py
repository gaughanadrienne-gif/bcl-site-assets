"""NEOGOV's table shape varies by agency; the parser must not assume it.

Measured live 2026-07-28:
  Scotts Valley  9 columns   (worked)
  Santa Cruz    10 columns   adds "Remote"        -> parsed 0 before this fix
  Cabrillo       7 columns   no Salary/Category/Department -> parsed 0 before

The old parser required exactly 9 cells and skipped everything else silently,
so two agencies with live openings contributed nothing while a third worked on
the same code path. That is the bug these tests pin down.
"""
from jobs.parsers import neogov

SRC = {"name": "Cabrillo College"}

NINE = (
    "| Job Title | Job Type | Salary | Closing | Posted | Category | Department | Location | Job Number |\n"
    "| --- | --- | --- |\n"
    "| [Dispatcher](https://x/jobs/123) | Full-Time | $66,888.00 | | 10/18/24 | 911 | Police Dept | CA 95066, CA | 1 |"
)

TEN = (
    "| Job Title | Job Type | Salary | Closing | Posted | Category | Department | Location | Job Number | Remote |\n"
    "| --- | --- | --- |\n"
    "| [Officer](https://x/jobs/456) | Regular | $59,808.00 | 12/31/26 | 01/01/26 | Cleric | Police | Santa Cruz, CA 95060 | 26-PD-06 | |"
)

SEVEN = (
    "| Job Title | Job Type | Posted | Closing | Location | Job Number | Remote |\n"
    "| --- | --- | --- |\n"
    "| [Groundskeeper](https://x/jobs/789) | Temporary | 07/20/26 | 08/03/26 | Aptos, CA 95003 | 2026-02179 | |"
)


def test_all_three_agency_table_shapes_parse():
    assert len(neogov.parse(NINE, SRC)) == 1
    assert len(neogov.parse(TEN, SRC)) == 1
    assert len(neogov.parse(SEVEN, SRC)) == 1


def test_fields_come_from_the_header_not_the_position():
    nine = neogov.parse(NINE, SRC)[0]
    ten = neogov.parse(TEN, SRC)[0]
    assert nine["employer"] == "Police Dept"
    assert nine["city"] == "Scotts Valley"
    # In TEN every column after Closing is shifted by the extra Remote column;
    # positional parsing would put the wrong text in these fields.
    assert ten["employer"] == "Police"
    assert ten["city"] == "Santa Cruz"
    assert ten["salary_text"].startswith("$59,808")
    assert ten["application_deadline"] == "12/31/26"
    assert ten["date_posted"] == "2026-01-01"


def test_missing_columns_degrade_instead_of_dropping_the_row():
    """Cabrillo publishes no Salary, Category or Department column."""
    row = neogov.parse(SEVEN, SRC)[0]
    assert row["salary_text"] == ""
    assert row["category"] == ""
    # employer falls back to the agency rather than being blank
    assert row["employer"] == "Cabrillo College"
    assert row["city"] == "Aptos"
    assert row["date_posted"] == "2026-07-20"


def test_junk_and_empty_input_return_nothing_rather_than_raising():
    assert neogov.parse("", SRC) == []
    assert neogov.parse(None, SRC) == []
    assert neogov.parse("| not | a | job | table |", SRC) == []
