"""
bmi_service.py
----------------
Handles BMI calculation, validation, and interpretation for FitBuddy-AI.
"""

from typing import Optional, Tuple

# WHO standard BMI categories
BMI_CATEGORIES = (
    (0.0, 18.5, "Underweight"),
    (18.5, 25.0, "Normal weight"),
    (25.0, 30.0, "Overweight"),
    (30.0, float("inf"), "Obese"),
)

MIN_VALID_BMI = 10.0
MAX_VALID_BMI = 60.0


def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    """
    Calculate BMI using the standard formula:
        BMI = weight (kg) / height (m)^2
    """
    if height_cm <= 0 or weight_kg <= 0:
        raise ValueError("Height and weight must be positive numbers.")

    height_m = height_cm / 100
    bmi = weight_kg / (height_m ** 2)
    return round(bmi, 1)


def classify_bmi(bmi: float) -> str:
    """Return the WHO BMI category label for a given BMI value."""
    for lower, upper, label in BMI_CATEGORIES:
        if lower <= bmi < upper:
            return label
    return "Unknown"


def validate_bmi(bmi: float) -> bool:
    """Check that a manually-provided BMI value is within a plausible range."""
    return MIN_VALID_BMI <= bmi <= MAX_VALID_BMI


def resolve_bmi(
    bmi: Optional[float],
    height_cm: Optional[float],
    weight_kg: Optional[float],
) -> Tuple[float, str, bool]:
    """
    Resolve the final BMI value to use, given either:
      - a manually supplied BMI, or
      - height + weight to calculate it.

    Returns:
        (bmi_value, category, was_calculated)

    Raises:
        ValueError if neither valid input is available.
    """
    if bmi is not None:
        if not validate_bmi(bmi):
            raise ValueError(
                f"Provided BMI ({bmi}) is outside the plausible range "
                f"({MIN_VALID_BMI}-{MAX_VALID_BMI})."
            )
        return bmi, classify_bmi(bmi), False

    if height_cm is not None and weight_kg is not None:
        calculated = calculate_bmi(height_cm, weight_kg)
        if not validate_bmi(calculated):
            raise ValueError(
                f"Calculated BMI ({calculated}) is outside the plausible range. "
                "Please double-check height and weight."
            )
        return calculated, classify_bmi(calculated), True

    raise ValueError(
        "Either a valid BMI, or both height_cm and weight_kg, must be provided."
    )
