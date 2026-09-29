"""
gemini_service.py
------------------
Builds the prompt for Google Gemini, calls the Gemini API, and parses
the structured JSON fitness plan response for FitBuddy-AI (v2).
"""

import json
import os
import re
from typing import Any, Dict

from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# "gemini-flash-latest" is a Google-maintained alias that always points at
# their current recommended Flash model, so it won't go stale the way a
# pinned version number (e.g. gemini-1.5-flash) eventually will.
GEMINI_MODEL_NAME = "gemini-3.8-flash"

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Please add it to your .env file. "
        "See .env.example for the expected format."
    )

client = genai.Client(api_key=GEMINI_API_KEY)


class GeminiServiceError(Exception):
    """Raised when the Gemini API call or response parsing fails."""


RESPONSE_SCHEMA_HINT = """
Return ONLY a single valid JSON object (no markdown fences, no commentary,
no leading/trailing text) with EXACTLY this structure:

{
  "bmi": {
    "value": <number>,
    "category": "<Underweight | Normal weight | Overweight | Obese>",
    "interpretation": "<1-2 sentence plain-language explanation>"
  },
  "fitness_goal": "<Weight Loss | Weight Gain>",
  "diet_plan": {
    "breakfast": ["<item 1>", "<item 2>", "..."],
    "snacks": ["<item 1>", "<item 2>", "..."],
    "lunch": ["<item 1>", "<item 2>", "..."],
    "dinner": ["<item 1>", "<item 2>", "..."]
  },
  "hydration": {
    "daily_target": "<e.g. 2.5 - 3 liters per day>",
    "tips": "<short hydration guidance>"
  },
  "exercise_plan": {
    "warm_up": ["<exercise 1>", "<exercise 2>"],
    "main_exercises": ["<exercise 1>", "<exercise 2>", "..."],
    "cool_down": ["<exercise 1>", "<exercise 2>"]
  },
  "weekly_schedule": {
    "Monday": "<activity or Rest>",
    "Tuesday": "<activity or Rest>",
    "Wednesday": "<activity or Rest>",
    "Thursday": "<activity or Rest>",
    "Friday": "<activity or Rest>",
    "Saturday": "<activity or Rest>",
    "Sunday": "<activity or Rest>"
  },
  "rest_recovery": ["<tip 1>", "<tip 2>", "..."],
  "safety_notes": ["<note 1>", "<note 2>", "..."]
}

Do not include the user's name or any personally identifying information
anywhere in the JSON. Keep all text general, encouraging, and safe.
"""


def build_prompt(user_data: Dict[str, Any], bmi_value: float, bmi_category: str) -> str:
    """Construct the structured prompt sent to Gemini."""

    prompt = f"""
You are a certified fitness and nutrition assistant. Generate a safe, general,
personalized fitness and diet plan based on the profile below. You must NOT
diagnose any medical condition or prescribe medical treatment — provide general
wellness guidance only, and include safety notes recommending professional
consultation where relevant.

USER PROFILE:
- Age: {user_data['age']}
- Gender: {user_data['gender']}
- Occupation: {user_data['occupation']}
- Available free time: {user_data['free_time']}
- Available workout frequency: {user_data['workout_days']}
- Preferred workout duration: {user_data['workout_duration']}
- Fitness goal: {user_data['fitness_goal']}
- BMI: {bmi_value} ({bmi_category})
- Activity level: {user_data['activity_level']}
- Food preference: {user_data['food_preference']}
- Dietary restrictions / allergies: {user_data['dietary_restrictions']}
- Exercise location: {user_data['exercise_location']}
- Available equipment: {user_data['available_equipment']}

INSTRUCTIONS:
1. Build a diet plan (breakfast, snacks, lunch, dinner) matching the food
   preference and respecting all dietary restrictions/allergies strictly.
2. Build an exercise plan (warm-up, main exercises, cool-down) suited to the
   exercise location, available equipment, workout duration, and fitness goal.
3. Build a full 7-day weekly workout schedule that fits the user's stated
   workout frequency (e.g. "3 days per week") — choose which days make sense,
   spread training out sensibly, and mark all other days as "Rest".
4. Include hydration guidance appropriate for the activity level.
5. Include rest & recovery guidance.
6. Include general safety notes, including a recommendation to consult a
   qualified professional before starting any new program.
7. Do NOT include the user's name or any personal identifying information.

{RESPONSE_SCHEMA_HINT}
"""
    return prompt.strip()


def _extract_json(raw_text: str) -> Dict[str, Any]:
    """
    Extract and parse a JSON object from the raw Gemini response text,
    tolerating markdown code fences or minor surrounding text.
    """
    text = raw_text.strip()

    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1)
    else:
        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            text = brace_match.group(0)

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiServiceError(
            f"Failed to parse JSON from Gemini response: {exc}"
        ) from exc


def generate_fitness_plan(
    user_data: Dict[str, Any], bmi_value: float, bmi_category: str
) -> Dict[str, Any]:
    """
    Calls the Gemini API with a structured prompt and returns the parsed
    fitness plan as a Python dict.
    """
    prompt = build_prompt(user_data, bmi_value, bmi_category)

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                response_mime_type="application/json",
            ),
        )
    except Exception as exc:  # network / API errors from the Gemini SDK
        raise GeminiServiceError(f"Gemini API request failed: {exc}") from exc

    if not response or not getattr(response, "text", None):
        raise GeminiServiceError("Gemini returned an empty response.")

    plan = _extract_json(response.text)

    required_keys = {
        "bmi",
        "fitness_goal",
        "diet_plan",
        "hydration",
        "exercise_plan",
        "weekly_schedule",
        "rest_recovery",
        "safety_notes",
    }
    missing = required_keys - plan.keys()
    if missing:
        raise GeminiServiceError(
            f"Gemini response is missing required fields: {', '.join(missing)}"
        )

    return plan