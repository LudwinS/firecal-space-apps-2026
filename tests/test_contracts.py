from firecal.contracts import HOTSPOT_COLUMNS, AreaSpec, CalendarResponse, QueryRequest


def test_contracts_import_and_defaults():
    q = QueryRequest(area=AreaSpec(country="El_Salvador"))
    assert q.area.country == "El_Salvador" and q.end is None
    assert "country" in HOTSPOT_COLUMNS
    assert len(CalendarResponse.model_fields["months"].default) == 12
