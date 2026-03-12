"""
Formula Calculation Engine — architecture for energy audit calculations.

This module provides the framework for adding calculation formulas
that depend on building type, subtype, and inspection metrics.

HOW TO ADD NEW FORMULAS:
1. Define a formula function that takes an inspection dict and returns a result dict.
2. Register it in FORMULA_REGISTRY with the appropriate building type/subtype key.
3. The engine will automatically apply matching formulas during report generation.

FORMULA FUNCTION SIGNATURE:
    def my_formula(metrics: dict) -> dict:
        '''
        metrics: dict with all inspection fields (building_type, building_subtype,
                 heating_consumption, electricity_consumption, etc.)
        returns: dict of calculated values, e.g. {"eui": 150.5, "rating": "B"}
        '''

REGISTRY KEY FORMAT:
    ("BuildingType", "Subtype")  — specific to a type+subtype combination
    ("BuildingType", "*")        — applies to all subtypes of a type
    ("*", "*")                   — applies to all buildings (universal formulas)
"""

from typing import Callable

# Type alias for formula functions
FormulaFn = Callable[[dict], dict]

# Registry: (building_type, building_subtype) -> list of formula functions
# Use "*" as wildcard for "any type" or "any subtype"
FORMULA_REGISTRY: dict[tuple[str, str], list[FormulaFn]] = {}


def register_formula(building_type: str, building_subtype: str = "*"):
    """Decorator to register a formula for a building type/subtype combination.

    Usage:
        @register_formula("Hotel", "5-star Hotel")
        def calc_hotel_5star_eui(metrics: dict) -> dict:
            area = metrics.get("total_area") or 1
            elec = metrics.get("electricity_consumption") or 0
            return {"eui_electricity": elec / area}
    """
    def decorator(fn: FormulaFn) -> FormulaFn:
        key = (building_type, building_subtype)
        if key not in FORMULA_REGISTRY:
            FORMULA_REGISTRY[key] = []
        FORMULA_REGISTRY[key].append(fn)
        return fn
    return decorator


def get_formulas_for(building_type: str | None, building_subtype: str | None) -> list[FormulaFn]:
    """Get all applicable formulas for a building type/subtype combination.

    Returns formulas in order: universal (*,*) → type-level (Type,*) → specific (Type,Subtype)
    """
    formulas = []

    # Universal formulas (apply to everything)
    formulas.extend(FORMULA_REGISTRY.get(("*", "*"), []))

    if building_type:
        # Type-level formulas (apply to all subtypes of this type)
        formulas.extend(FORMULA_REGISTRY.get((building_type, "*"), []))

        if building_subtype:
            # Specific formulas (exact type+subtype match)
            formulas.extend(FORMULA_REGISTRY.get((building_type, building_subtype), []))

    return formulas


def calculate(metrics: dict) -> dict:
    """Run all applicable formulas for the given metrics and return calculated results.

    Args:
        metrics: dict with all inspection fields including building_type, building_subtype

    Returns:
        dict of all calculated values merged together
    """
    building_type = metrics.get("building_type")
    building_subtype = metrics.get("building_subtype")

    formulas = get_formulas_for(building_type, building_subtype)

    results = {}
    for fn in formulas:
        try:
            result = fn(metrics)
            if isinstance(result, dict):
                results.update(result)
        except Exception:
            # Skip formulas that fail due to missing data
            pass

    return results


# ══════════════════════════════════════════════════════════════════════
# EXAMPLE FORMULAS (uncomment and modify when real formulas are provided)
# ══════════════════════════════════════════════════════════════════════

# @register_formula("*", "*")
# def calc_universal_eui(metrics: dict) -> dict:
#     """Universal EUI calculation — applies to all building types."""
#     area = metrics.get("total_area")
#     elec = metrics.get("electricity_consumption")
#     if area and elec:
#         return {"eui_electricity": round(elec / area, 2)}
#     return {}

# @register_formula("Hotel", "5-star Hotel")
# def calc_hotel_5star(metrics: dict) -> dict:
#     """5-star hotel specific calculations."""
#     # Add hotel-specific formulas here
#     return {}
