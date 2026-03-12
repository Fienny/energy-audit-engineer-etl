"""
Building Type / Subtype registry.

This is the single source of truth for valid building types and their subtypes.
Used by:
  - Frontend (served via API endpoint)
  - Inspection validation
  - Formula engine (future)
"""

# Ordered dict: building_type -> list of subtypes
BUILDING_TYPES: dict[str, list[str]] = {
    "Apartments": [
        "Subsidized/Gap",
        "Middle",
        "High",
    ],
    "Serviced Apartments": [
        "Serviced Apartments",
    ],
    "Hotel": [
        "5-star Hotel",
        "4-star Hotel",
        "3-star Hotel",
        "2-star Hotel",
        "1-star Hotel",
    ],
    "Resort": [
        "5-star Resort",
        "4-star Resort",
        "3-star Resort",
        "2-star Resort",
        "1-star Resort",
    ],
    "Retail": [
        "Department Store",
        "Shopping Mall",
        "Supermarket",
        "Small Food Retail",
        "Non-Food Big Box Retail",
    ],
    "Industrial": [
        "Light Industry",
        "Warehouse",
    ],
    "Office": [
        "Office",
    ],
    "Healthcare": [
        "Nursing Home",
        "Private Hospital",
        "Public Hospital",
        "Multi-Speciality Hospital",
        "Clinics",
        "Diagnostic Center",
        "Teaching Hospital",
        "Eye Hospital",
        "Dental Hospital",
    ],
    "Education": [
        "Preschool",
        "School",
        "University",
        "Sports Facilities",
        "Other Educational Facilities",
    ],
    "Mixed-use": [
        "Self-defined Building",
    ],
}


def get_all_types() -> list[str]:
    """Return list of all building type names."""
    return list(BUILDING_TYPES.keys())


def get_subtypes(building_type: str) -> list[str]:
    """Return subtypes for a given building type, or empty list."""
    return BUILDING_TYPES.get(building_type, [])


def is_valid_combination(building_type: str, building_subtype: str) -> bool:
    """Check if a building_type + subtype combination is valid."""
    return building_subtype in BUILDING_TYPES.get(building_type, [])
