from shared.bcl_ingest import is_slv, slv_locality


def test_is_slv_by_zip():
    assert is_slv({"postal_code": "95005"}) is True   # Ben Lomond
    assert is_slv({"postal_code": "95018"}) is True   # Felton
    assert is_slv({"address_public": "123 X St, Brookdale, CA 95007"}) is True

def test_is_slv_rejects_outside():
    assert is_slv({"postal_code": "95066"}) is False  # Scotts Valley
    assert is_slv({"postal_code": "95060"}) is False  # Santa Cruz

def test_is_slv_city_alone_insufficient():
    assert is_slv({"city": "Ben Lomond"}) is False

def test_slv_locality_from_zip():
    assert slv_locality({"postal_code": "95005"}) == "Ben Lomond"
    assert slv_locality({"postal_code": "95006"}) == "Boulder Creek"
    assert slv_locality({"address_public": "X, Felton, CA 95018"}) == "Felton"

def test_slv_locality_from_city_when_no_zip():
    assert slv_locality({"city": "brookdale"}) == "Brookdale"
    assert slv_locality({"city": "Santa Cruz"}) == ""
