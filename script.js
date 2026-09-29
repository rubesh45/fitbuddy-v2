/* ==========================================================
   FitBuddy-AI — script.js (v2, matches provided HTML)
   Handles: page navigation, 4-step form, validation,
   review, API call, results rendering.
   ========================================================== */

const API_BASE_URL = "http://localhost:8000"; // change to your deployed backend URL
const API_ENDPOINT = `${API_BASE_URL}/api/generate-plan`;

/* ---------------------------------------------------------
   Page elements
--------------------------------------------------------- */
const pages = {
  landing: document.getElementById("landingPage"),
  questionnaire: document.getElementById("questionnairePage"),
  review: document.getElementById("reviewPage"),
  loading: document.getElementById("loadingPage"),
  results: document.getElementById("resultsPage"),
};

function showPage(name) {
  Object.values(pages).forEach((p) => p.classList.add("hidden"));
  pages[name].classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------------------------------------------------
   Landing -> Questionnaire
--------------------------------------------------------- */
document.getElementById("headerStart").addEventListener("click", startQuestionnaire);
document.getElementById("heroStart").addEventListener("click", startQuestionnaire);

function startQuestionnaire() {
  state.currentStep = 1;
  renderStep();
  showPage("questionnaire");
}

/* ---------------------------------------------------------
   Multi-step form state & navigation
--------------------------------------------------------- */
const state = { currentStep: 1, totalSteps: 4 };

const stepMeta = {
  1: { label: "STEP 1 OF 4", title: "Let\u2019s get to know you.", desc: "A few basics help us create a plan that feels realistic." },
  2: { label: "STEP 2 OF 4", title: "Tell us about your routine.", desc: "This shapes how often and how long your workouts will be." },
  3: { label: "STEP 3 OF 4", title: "Let\u2019s check your BMI.", desc: "Enter height and weight, or a known BMI \u2014 whichever you have handy." },
  4: { label: "STEP 4 OF 4", title: "Food &amp; training environment.", desc: "Last stretch \u2014 this helps us build your diet and exercise plan." },
};

const form = document.getElementById("fitnessForm");
const formSteps = document.querySelectorAll(".form-step");
const stepLabel = document.getElementById("stepLabel");
const stepTitle = document.getElementById("stepTitle");
const stepDescription = document.getElementById("stepDescription");
const progressBar = document.getElementById("progressBar");
const backButton = document.getElementById("backButton");
const nextButton = document.getElementById("nextButton");
const formError = document.getElementById("formError");

function renderStep() {
  formSteps.forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.step) === state.currentStep);
  });

  const meta = stepMeta[state.currentStep];
  stepLabel.textContent = meta.label;
  stepTitle.innerHTML = meta.title;
  stepDescription.textContent = meta.desc;
  progressBar.style.width = `${(state.currentStep / state.totalSteps) * 100}%`;

  backButton.style.visibility = state.currentStep === 1 ? "hidden" : "visible";
  formError.textContent = "";
}

backButton.addEventListener("click", () => {
  if (state.currentStep > 1) {
    state.currentStep--;
    renderStep();
  }
});

nextButton.addEventListener("click", () => {
  const error = validateStep(state.currentStep);
  if (error) {
    formError.textContent = error;
    return;
  }
  formError.textContent = "";

  if (state.currentStep < state.totalSteps) {
    state.currentStep++;
    renderStep();
  } else {
    populateReview();
    showPage("review");
  }
});

document.getElementById("reviewBack").addEventListener("click", () => {
  showPage("questionnaire");
});

/* ---------------------------------------------------------
   Validation
--------------------------------------------------------- */
function fieldsInStep(stepNumber) {
  const stepEl = document.querySelector(`.form-step[data-step="${stepNumber}"]`);
  return stepEl.querySelectorAll("input, select");
}

function clearInvalid(stepNumber) {
  fieldsInStep(stepNumber).forEach((el) => el.classList.remove("invalid"));
}

function validateStep(stepNumber) {
  clearInvalid(stepNumber);
  const fields = fieldsInStep(stepNumber);
  let firstInvalid = null;

  fields.forEach((el) => {
    if (el.hasAttribute("required") && !el.value.trim()) {
      el.classList.add("invalid");
      if (!firstInvalid) firstInvalid = el;
    }
  });

  if (stepNumber === 1) {
    const age = Number(form.age.value);
    if (form.age.value && (age < 13 || age > 100)) {
      form.age.classList.add("invalid");
      return "Please enter a valid age between 13 and 100.";
    }
  }

  if (stepNumber === 3) {
    const height = form.height_cm.value.trim();
    const weight = form.weight_kg.value.trim();
    const bmi = form.bmi.value.trim();
    const hasHeightWeight = height && weight;

    if (!hasHeightWeight && !bmi) {
      form.height_cm.classList.add("invalid");
      form.weight_kg.classList.add("invalid");
      form.bmi.classList.add("invalid");
      return "Enter your height and weight, or a known BMI, to continue.";
    }
    if ((height && !weight) || (!height && weight)) {
      form.height_cm.classList.add("invalid");
      form.weight_kg.classList.add("invalid");
      return "Please enter both height and weight, or leave both blank and use BMI instead.";
    }
  }

  if (firstInvalid) {
    firstInvalid.focus();
    return "Please fill in all required fields before continuing.";
  }

  return null;
}

/* ---------------------------------------------------------
   Collect form data
--------------------------------------------------------- */
function collectFormData() {
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());

  return {
    name: data.name?.trim() || "",
    age: Number(data.age),
    gender: data.gender,
    occupation: data.occupation?.trim() || "",
    free_time: data.free_time,
    workout_days: data.workout_days,
    fitness_goal: data.fitness_goal,
    activity_level: data.activity_level,
    workout_duration: data.workout_duration,
    height_cm: data.height_cm ? Number(data.height_cm) : null,
    weight_kg: data.weight_kg ? Number(data.weight_kg) : null,
    bmi: data.bmi ? Number(data.bmi) : null,
    food_preference: data.food_preference,
    dietary_restrictions: data.dietary_restrictions?.trim() || "",
    exercise_location: data.exercise_location,
    available_equipment: data.available_equipment?.trim() || "",
  };
}

function buildApiPayload(data) {
  // If both height and weight are present, prefer them and omit bmi
  // so the backend calculates it fresh (matches "we use those values first").
  const useHeightWeight = data.height_cm && data.weight_kg;

  return {
    name: data.name,
    age: data.age,
    gender: data.gender,
    occupation: data.occupation,
    free_time: data.free_time,
    workout_days: data.workout_days,
    workout_duration: data.workout_duration,
    fitness_goal: data.fitness_goal,
    bmi: useHeightWeight ? null : data.bmi,
    height_cm: useHeightWeight ? data.height_cm : null,
    weight_kg: useHeightWeight ? data.weight_kg : null,
    activity_level: data.activity_level,
    food_preference: data.food_preference,
    dietary_restrictions: data.dietary_restrictions,
    exercise_location: data.exercise_location,
    available_equipment: data.available_equipment,
  };
}

/* ---------------------------------------------------------
   Review page
--------------------------------------------------------- */
function populateReview() {
  const data = collectFormData();
  const reviewContent = document.getElementById("reviewContent");

  const bmiDisplay =
    data.height_cm && data.weight_kg
      ? `${(data.weight_kg / ((data.height_cm / 100) ** 2)).toFixed(1)} (calculated)`
      : data.bmi
      ? `${data.bmi} (provided)`
      : "\u2014";

  const items = [
    ["Age", data.age],
    ["Gender", data.gender],
    ["Occupation", data.occupation],
    ["Free time", data.free_time],
    ["Workout frequency", data.workout_days],
    ["Fitness goal", data.fitness_goal],
    ["Activity level", data.activity_level],
    ["Workout duration", data.workout_duration],
    ["BMI", bmiDisplay],
    ["Food preference", data.food_preference],
    ["Dietary restrictions", data.dietary_restrictions || "None"],
    ["Exercise location", data.exercise_location],
    ["Available equipment", data.available_equipment || "None"],
  ];

  reviewContent.innerHTML = items
    .map(
      ([label, value]) => `
      <div class="review-item">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(String(value))}</span>
      </div>`
    )
    .join("");
}

/* ---------------------------------------------------------
   Generate plan — API call
--------------------------------------------------------- */
const generateButton = document.getElementById("generateButton");

generateButton.addEventListener("click", async () => {
  const data = collectFormData();
  const payload = buildApiPayload(data);

  showPage("loading");

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = "Something went wrong while generating your plan. Please try again.";
      try {
        const errBody = await response.json();
        if (errBody?.detail) {
          message = Array.isArray(errBody.detail)
            ? errBody.detail.map((d) => d.msg).join(" ")
            : String(errBody.detail);
        }
      } catch (_) {}
      throw new Error(message);
    }

    const result = await response.json();
    renderResults(result, data.fitness_goal);
    showPage("results");
  } catch (err) {
    showPage("review");
    showErrorToast(
      err.message === "Failed to fetch"
        ? "Could not reach the server. Please check your connection and try again."
        : err.message
    );
  }
});

/* ---------------------------------------------------------
   Render results dashboard
--------------------------------------------------------- */
function renderResults(result, fitnessGoal) {
  const resultsIntro = document.getElementById("resultsIntro");
  resultsIntro.textContent =
    fitnessGoal === "Weight Gain"
      ? "A practical starting point built around steady, healthy weight gain."
      : "A practical starting point built around steady, healthy weight loss.";

  const bmi = result.bmi || {};
  const hydration = result.hydration || {};

  const html = `
    <div class="result-card">
      <h3>BMI Overview</h3>
      <div class="card-body">
        <span class="badge">${safe(bmi.value)}</span>
        <p style="margin-top:10px;">${safe(bmi.category)}</p>
        <p style="margin-top:6px; opacity:0.85;">${safe(bmi.interpretation)}</p>
      </div>
    </div>

    <div class="result-card">
      <h3>Fitness Goal</h3>
      <div class="card-body"><span class="badge">${safe(result.fitness_goal)}</span></div>
    </div>

    <div class="result-card wide">
      <h3>Diet Plan</h3>
      <div class="card-body">${renderDiet(result.diet_plan)}</div>
    </div>

    <div class="result-card">
      <h3>Hydration Guidance</h3>
      <div class="card-body">
        <p><strong>${safe(hydration.daily_target)}</strong></p>
        <p style="margin-top:6px; opacity:0.85;">${safe(hydration.tips)}</p>
      </div>
    </div>

    <div class="result-card">
      <h3>Rest &amp; Recovery</h3>
      <div class="card-body">${renderList(result.rest_recovery)}</div>
    </div>

    <div class="result-card wide">
      <h3>Exercise Plan</h3>
      <div class="card-body">${renderExercisePlan(result.exercise_plan)}</div>
    </div>

    <div class="result-card wide">
      <h3>Weekly Workout Schedule</h3>
      <div class="card-body">${renderSchedule(result.weekly_schedule)}</div>
    </div>

    <div class="result-card wide">
      <h3>Safety Notes</h3>
      <div class="card-body">${renderList(result.safety_notes)}</div>
    </div>
  `;

  document.getElementById("resultsContent").innerHTML = html;
}

function renderDiet(diet) {
  if (!diet) return "<p>No diet information available.</p>";
  const meals = Array.isArray(diet)
    ? diet
    : Object.entries(diet).map(([key, value]) => ({ meal: key, items: value }));

  return meals
    .map((m) => {
      const mealName = m.meal || m.name || "Meal";
      const items = m.items || m.description || m.foods || m;
      return `
        <div class="meal-block">
          <strong>${safe(mealName)}</strong>
          ${renderMealItems(items)}
        </div>`;
    })
    .join("");
}

function renderMealItems(items) {
  if (Array.isArray(items)) {
    return `<ul>${items.map((i) => `<li>${safe(typeof i === "string" ? i : JSON.stringify(i))}</li>`).join("")}</ul>`;
  }
  if (typeof items === "object" && items !== null) {
    return `<ul>${Object.entries(items)
      .map(([k, v]) => `<li><strong>${safe(k)}:</strong> ${safe(String(v))}</li>`)
      .join("")}</ul>`;
  }
  return `<p>${safe(String(items))}</p>`;
}

function renderExercisePlan(plan) {
  if (!plan) return "<p>No exercise plan available.</p>";
  let html = "";
  const warmUp = plan.warm_up ?? plan.warmup;
  const main = plan.main_exercises ?? plan.exercises ?? plan.main;
  const coolDown = plan.cool_down ?? plan.cooldown;

  if (warmUp) html += `<div class="meal-block"><strong>Warm-up</strong>${renderMealItems(warmUp)}</div>`;
  if (main) html += `<div class="meal-block"><strong>Main Exercises</strong>${renderMealItems(main)}</div>`;
  if (coolDown) html += `<div class="meal-block"><strong>Cool-down</strong>${renderMealItems(coolDown)}</div>`;

  if (!html && Array.isArray(plan)) html = renderMealItems(plan);
  return html || "<p>No exercise plan available.</p>";
}

function renderSchedule(schedule) {
  if (!schedule) return "<p>No schedule available.</p>";
  if (Array.isArray(schedule)) {
    return schedule
      .map((d) => {
        const day = d.day || d.name || "Day";
        const activity = d.activity || d.workout || d.description || "";
        return `<div class="day-block"><strong>${safe(day)}:</strong> ${safe(String(activity))}</div>`;
      })
      .join("");
  }
  if (typeof schedule === "object") {
    return Object.entries(schedule)
      .map(([day, activity]) => `<div class="day-block"><strong>${safe(day)}:</strong> ${safe(String(activity))}</div>`)
      .join("");
  }
  return `<p>${safe(String(schedule))}</p>`;
}

function renderList(list) {
  if (!list) return "<p>None provided.</p>";
  if (Array.isArray(list) && list.length) {
    return `<ul>${list.map((i) => `<li>${safe(String(i))}</li>`).join("")}</ul>`;
  }
  if (typeof list === "string") return `<p>${safe(list)}</p>`;
  return "<p>None provided.</p>";
}

/* ---------------------------------------------------------
   Start over
--------------------------------------------------------- */
document.getElementById("startOver").addEventListener("click", () => {
  form.reset();
  state.currentStep = 1;
  showPage("landing");
});

/* ---------------------------------------------------------
   Error toast (created dynamically since not in base HTML)
--------------------------------------------------------- */
let errorToast = document.getElementById("error-toast");
if (!errorToast) {
  errorToast = document.createElement("div");
  errorToast.id = "error-toast";
  errorToast.className = "error-toast hidden";
  errorToast.innerHTML = `<span id="error-toast-text"></span><button id="error-toast-close">\u2715</button>`;
  document.body.appendChild(errorToast);
  document.getElementById("error-toast-close").addEventListener("click", () => {
    errorToast.classList.add("hidden");
  });
}

function showErrorToast(message) {
  document.getElementById("error-toast-text").textContent = message;
  errorToast.classList.remove("hidden");
  clearTimeout(showErrorToast._timer);
  showErrorToast._timer = setTimeout(() => errorToast.classList.add("hidden"), 6000);
}

/* ---------------------------------------------------------
   Utilities
--------------------------------------------------------- */
function safe(value) {
  return escapeHtml(value === undefined || value === null || value === "" ? "\u2014" : String(value));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
