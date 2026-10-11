/* ============================================================
   STELLAR MATCH — GAME DATA
   ============================================================ */

/* ---------- GLOBAL CONFIG ---------- */
const GAME_CONFIG = {
  /* Grid */
  GRID_COLS: 8,
  GRID_ROWS: 8,

  /* Timer for questions */
  TIME_PER_QUESTION: 16,
  TIME_AUTO_SCALE: true,
  TIME_PER_CHAR: 0.08,
  TIME_MIN: 10,
  TIME_MAX: 45,

  /* Save */
  SAVE_KEY: "stellarMatchSave_v1"
};

/* ---------- ORBS ----------
   Each orb has an id, name, color, and an inline SVG shape.
   Geometric shapes (not emoji) are used so every orb is
   instantly distinguishable at any tile size, on any platform.
     Star    → 5-point star (spiky)
     Planet  → hexagon      (6-sided)
     Comet   → triangle     (3-sided)
     Crystal → diamond      (4-sided)
     Moon    → circle       (round)
   `fill="currentColor"` lets CSS control the orb's colour.
*/
const ORBS = [
  {
    id: "star",
    name: "Star",
    color: "#ffd76e",
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M50 4 L61.17 34.63 L93.75 35.78 L68.07 55.87 L77.04 87.22 L50 69 L22.96 87.22 L31.93 55.87 L6.25 35.78 L38.83 34.63 Z" fill="currentColor" stroke="rgba(0,0,0,.45)" stroke-width="3" stroke-linejoin="round"/></svg>'
  },
  {
    id: "planet",
    name: "Planet",
    color: "#ff9f45",
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M50 4 L89.84 27 L89.84 73 L50 96 L10.16 73 L10.16 27 Z" fill="currentColor" stroke="rgba(0,0,0,.45)" stroke-width="3" stroke-linejoin="round"/></svg>'
  },
  {
    id: "comet",
    name: "Comet",
    color: "#6ee7ff",
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M50 6 L94 88 L6 88 Z" fill="currentColor" stroke="rgba(0,0,0,.45)" stroke-width="3" stroke-linejoin="round"/></svg>'
  },
  {
    id: "crystal",
    name: "Crystal",
    color: "#c8b5ff",
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M50 4 L96 50 L50 96 L4 50 Z" fill="currentColor" stroke="rgba(0,0,0,.45)" stroke-width="3" stroke-linejoin="round"/></svg>'
  },
  {
    id: "moon",
    name: "Moon",
    color: "#7dffc4",
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="currentColor" stroke="rgba(0,0,0,.45)" stroke-width="3"/></svg>'
  }
];

/* ---------- LEVELS (SECTORS) ----------
   Each level has:
     name        — display name
     targetScore — points to hit to clear
     moves       — number of swaps available
     bonusSwaps  — extra swaps earned per correct answer (default 1)
*/
const LEVELS = [
{ name: "Orbital Station",  targetScore: 250,  moves: 16, bonusSwaps: 1 },
{ name: "Asteroid Belt",    targetScore: 400,  moves: 16, bonusSwaps: 1 },
{ name: "Nebula Drift",     targetScore: 600,  moves: 18, bonusSwaps: 1 },
{ name: "Event Horizon",    targetScore: 800,  moves: 18, bonusSwaps: 1 },
{ name: "Galactic Core",    targetScore: 1100, moves: 20, bonusSwaps: 1 }
];

/* ---------- SCORING ----------
   Used by game.js to compute match scores.
*/
const SCORING = {
  base3: 30,
  base4: 60,
  base5: 100,
  cascadeBonus: 0.5  // +50% per cascade level
};

/* ---------- QUESTIONS (COSMIC SCANS) ----------
   ⚠️ a[0] is ALWAYS the correct answer.
   OPTIONAL: time — custom seconds for this question.
*/
const QUESTIONS = [
  { 
    q: "What is the primary goal of the Service Level Management (SLM) process?",
    a: ["To ensure IT services meet business goals.", "To design new IT services for the company.", "To manage the financial budget of IT projects.", " To hire new IT support staff."]
  },
  { 
    q: " Step 2 of the SLM process is called 'SLA Documentation.'",
    a: ["False", "True"]
  },
  { 
    q: "A key responsibility of a Service Level Manager is to ensure that the customers' requirements have been identified.",
    a: ["True", "False"]
  },
  { 
    q: "Negotiating and making agreements on the delivery of services is outside the scope of a Service Level Manager's responsibilities.",
    a: ["False", "True"]
  },
  { 
    q: "Service Level Management (SLM) is solely responsible for writing contracts and has no role in monitoring or reporting on service levels once an SLA is signed.",
    a: ["False", "True"]
  },
  { 
    q: "Which of the following elements is explicitly included in a Service Level Agreement (SLA) according to ITIL v3 definitions?",
    a: ["Documented service level targets and the responsibilities of both the IT service provider and the customer", "Source code repositories and developer credentials", "Comprehensive physical server blueprints and floor plans", "Employee salary grades and organizational hiring schedules"]
  },
  { 
    q: "One of the core objectives of SLM is to make sure that the agreed level of IT service provision is actually attained.",
    a: ["True", "False"]
  }
];