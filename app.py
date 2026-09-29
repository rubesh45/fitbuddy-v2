"""
app.py
------
FastAPI application entry point for FitBuddy-AI backend (v2).
Exposes POST /api/generate-plan which validates user input, resolves BMI,
calls Gemini to generate a personalized fitness/diet plan, and returns it.

Field names here match the v2 frontend form exactly:
  name, age, gender, occupation, free_time, workout_days, fitness_goal,
  activity_level, workout_duration, height_cm, weight_kg, bmi,
  food_preference, dietary_restrictions, exercise_location, available_equipment
"""

from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator

from bmi_service import resolve_bmi
from gemini_service import GeminiServiceError, generate_fitness_plan

# ---------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------
app = FastAPI(
    title="FitBuddy-AI API",
    description="AI-powered fitness & nutrition plan generator backend.",
    version="2.0.0",
)

# Enable CORS for local frontend development.
# In production, replace "*" with your actual frontend origin(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_FITNESS_GOALS = {"Weight Loss", "Weight Gain"}


# ---------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------
class PlanRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    age: int = Field(..., ge=13, le=100)
    gender: str = Field(..., min_length=1)
    occupation: str = Field(..., min_length=1, max_length=120)

    free_time: str = Field(..., min_length=1)
    workout_days: str = Field(..., min_length=1)  # e.g. "3 days per week"
    workout_duration: str = Field(..., min_length=1)

    fitness_goal: str

    bmi: Optional[float] = Field(default=None, ge=10, le=80)
    height_cm: Optional[float] = Field(default=None, ge=80, le=250)
    weight_kg: Optional[float] = Field(default=None, ge=25, le=400)

    activity_level: str = Field(..., min_length=1)
    food_preference: str = Field(..., min_length=1)
    dietary_restrictions: str = Field(..., min_length=1, max_length=180)

    exercise_location: str = Field(..., min_length=1)
    available_equipment: str = Field(..., min_length=1, max_length=180)

    @field_validator("fitness_goal")
    @classmethod
    def validate_fitness_goal(cls, value: str) -> str:
        if value not in VALID_FITNESS_GOALS:
            raise ValueError(
                f"fitness_goal must be one of {sorted(VALID_FITNESS_GOALS)}"
            )
        return value

    @model_validator(mode="after")
    def validate_bmi_inputs(self) -> "PlanRequest":
        has_manual_bmi = self.bmi is not None
        has_height_weight = self.height_cm is not None and self.weight_kg is not None

        if not has_manual_bmi and not has_height_weight:
            raise ValueError(
                "Provide either 'bmi' or both 'height_cm' and 'weight_kg'."
            )
        return self


class PlanResponse(BaseModel):
    bmi: dict
    fitness_goal: str
    diet_plan: dict
    hydration: dict
    exercise_plan: dict
    weekly_schedule: dict
    rest_recovery: list
    safety_notes: list


# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------
@app.get("/")
def root():
    return {"status": "ok", "service": "FitBuddy-AI backend"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


@app.post("/api/generate-plan", response_model=PlanResponse)
def generate_plan(payload: PlanRequest):
    # 1. Resolve BMI (validate manual BMI, or calculate from height/weight)
    try:
        bmi_value, bmi_category, _was_calculated = resolve_bmi(
            bmi=payload.bmi,
            height_cm=payload.height_cm,
            weight_kg=payload.weight_kg,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 2. Build the data dict passed to Gemini (name intentionally excluded
    #    from anything that could leak into the stored/returned plan).
    user_data = {
        "age": payload.age,
        "gender": payload.gender,
        "occupation": payload.occupation,
        "free_time": payload.free_time,
        "workout_days": payload.workout_days,
        "workout_duration": payload.workout_duration,
        "fitness_goal": payload.fitness_goal,
        "activity_level": payload.activity_level,
        "food_preference": payload.food_preference,
        "dietary_restrictions": payload.dietary_restrictions,
        "exercise_location": payload.exercise_location,
        "available_equipment": payload.available_equipment,
    }

    # 3. Call Gemini to generate the structured plan
    try:
        plan = generate_fitness_plan(
            user_data=user_data, bmi_value=bmi_value, bmi_category=bmi_category
        )
    except GeminiServiceError as exc:
        raise HTTPException(
            status_code=502, detail=f"AI plan generation failed: {exc}"
        ) from exc
    except Exception as exc:  # unexpected errors
        raise HTTPException(
            status_code=500, detail=f"Unexpected server error: {exc}"
        ) from exc

    # 4. Ensure BMI block in the response always reflects our own
    #    validated calculation (never trust Gemini's echoed numbers blindly).
    plan["bmi"] = {
        "value": bmi_value,
        "category": bmi_category,
        "interpretation": plan.get("bmi", {}).get(
            "interpretation",
            f"A BMI of {bmi_value} falls into the '{bmi_category}' category.",
        ),
    }
    plan["fitness_goal"] = payload.fitness_goal

    return plan


# ---------------------------------------------------------------------
# Local dev entry point: `python app.py`
# (Prefer `uvicorn app:app --reload` for development.)
# ---------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
