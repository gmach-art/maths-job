"use strict";

/* Prep page greeting and "ask for a question" chat.

   There's no AI service behind this: what you type is matched against a
   keyword catalogue of every question generator in the two banks
   (script.js and data-analysis.js), and the best match generates a fresh
   question in the thread. Answers are recorded in QuestionStats for
   accuracy only (no timing), so they feed Quick Quiz's weak-spot picking. */

const BANKS = [window.NumericalReasoningBank, window.DataAnalysisBank];
const MAX_QUESTIONS_PER_ASK = 5;
const VISIT_KEY = "prepLastVisit";

// Phrases that identify each generator. Longer phrases score higher, so
// "contribution margin" beats plain "margin".
const QUESTION_KEYWORDS = {
  numerical: {
    genLogicGame: ["logic game", "logic", "lsat", "scheduling", "grouping", "constraint", "puzzle", "rules"],
    genMarkupVsMargin: ["markup", "mark up", "margin vs markup", "clearance", "discount"],
    genReverseGrowth: ["working backward", "work backwards", "backwards", "reverse", "original revenue"],
    genSecondHighestWithDistraction: ["ranking", "rank", "second highest", "regions"],
    genUnitConversionTrap: ["unit conversion", "units", "staffing cost", "staffing", "part time", "wages", "salary cost"],
    genThresholdCommission: ["commission", "threshold", "bonus", "marginal pay", "sales pay"],
    genWeightedAverage: ["weighted average", "average", "mean"],
    genOppositeSpeed: ["opposite directions", "speed", "distance", "travel", "trains", "velocity"],
    genSimultaneous: ["simultaneous equations", "simultaneous", "equations", "algebra"],
    genPercentSuccessive: ["successive percentages", "percentage", "percent", "percentages"],
    genRatio: ["ratio", "ratios", "proportion", "headcount"],
    genWorkRate: ["work rate", "rate of work", "workers", "working together"],
    genCompoundGrowth: ["compound growth", "compound interest", "compounding", "interest"],
    genGrowthForecast: ["growth forecast", "forecasting", "forecast", "projection", "project forward"],
    genMixture: ["mixture", "mixtures", "concentration", "blend"],
    genCatchUp: ["catch up", "catching up", "overtake", "chase"],
    genGrossMargin: ["gross margin", "profit margin", "margin"],
    genBreakeven: ["break even", "breakeven", "target profit"],
    genContributionMarginRatio: ["contribution margin", "contribution", "sales mix"],
    genPaybackPeriod: ["payback period", "payback", "cash flow", "investment"],
    genTournamentBracket: ["tournament", "bracket", "knockout", "elimination", "matches"],
    genMarketShareDoubling: ["doubling time", "doubling", "logarithm", "log", "exponential", "market share"],
    genContainerPacking: ["shipping container", "container", "packing", "boxes fit", "dimensions", "rotate", "bain", "3d", "volume"],
    genShippingCost: ["shipping cost", "shipping", "shipments", "freight", "logistics", "cost per container"],
    genCounting: ["permutation", "permutations", "combination", "combinations", "counting", "arrangements", "arrange", "how many ways", "ways", "seats", "chairs", "ncr", "npr", "factorial"],
    genProbability: ["probability", "probabilities", "chance", "odds", "likelihood", "bayes", "conditional"],
  },
  "data-analysis": {
    genChartExcludingOneOff: ["one off", "one-off", "exceptional item", "excluding"],
    genChartUnitTrap: ["summing months", "right months", "months", "quarter"],
    genRankingIgnoreOtherPanel: ["chart ranking", "ranking chart", "ranking"],
    genWhichBelowThresholdFromShareAndMarketSize: ["which is not", "negation", "not true", "below threshold"],
    genRevenueFromUnitsPrice: ["units price", "units times price", "revenue from units", "revenue"],
    genMarginFromRevenueCost: ["revenue and cost", "revenue minus cost", "margin from chart"],
    genPricePerUnitFromRevenueUnits: ["price per unit", "unit price", "price point"],
    genBlendedMarginFromShareAndMargin: ["blended margin", "weighted margin", "pie chart margin"],
    genCompanyRevenueFromShareAndMarketSize: ["market size", "share of market", "share times total", "pie chart"],
    genAbsoluteGrowthFromRateAndBase: ["growth in dollars", "absolute growth", "prior year"],
    genPeakProfitFromRevenueAndCosts: ["peak profit", "highest profit", "best month"],
    genBarPercentChange: ["bar chart", "percentage change", "percent change"],
    genLineCAGR: ["cagr", "compound annual growth", "line chart"],
    genStackedBar: ["stacked bar chart", "stacked bar", "stacked chart", "share of total"],
    genTableAverage: ["table average", "data table", "average from table"],
    genTableGrowthRate: ["table growth", "growth rate table", "growth rate"],
    genLineForecast: ["trend forecast", "line forecast", "trend", "extrapolate"],
  },
};

// Words that lean a request toward one bank without naming a type.
const BANK_HINTS = {
  "data-analysis": ["chart", "graph", "table", "data", "pie", "bar", "line", "visual", "data analysis"],
  numerical: ["word problem", "numerical", "mental maths", "mental math", "arithmetic"],
};

const RANDOM_WORDS = ["random", "anything", "surprise", "whatever", "any question", "mix"];
const WEAK_WORDS = ["weak", "weakest", "struggle", "hard for me", "get wrong", "find hard", "worst", "need practice", "trouble"];
const NUMBER_WORDS = { one: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5 };

/* ---------- text matching ---------- */

function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text) {
  return text
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

function containsPhrase(queryTokens, phrase) {
  const p = tokens(phrase);
  for (let i = 0; i + p.length <= queryTokens.length; i++) {
    if (p.every((t, j) => queryTokens[i + j] === t)) return true;
  }
  return false;
}

function hasAny(queryTokens, phrases) {
  return phrases.some((p) => containsPhrase(queryTokens, p));
}

// Only a number tied to "question(s)" counts ("3 probability questions"),
// so numbers inside the request ("6 people in 3 chairs") are left alone.
function requestedCount(text) {
  const m = text.toLowerCase().match(/\b(\d+|one|two|three|four|five|couple|few)\s+(?:of\s+)?(?:[a-z-]+\s+){0,3}?questions?\b/);
  if (!m) return 1;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  return Math.max(1, Math.min(n, MAX_QUESTIONS_PER_ASK));
}

function allGenerators() {
  return BANKS.flatMap((bank) => bank.generators.map((gen) => ({ bank, gen })));
}

function weightedPick(entries) {
  const weights = entries.map(({ bank, gen }) => window.QuestionStats.weight(bank.id, gen.name, bank.targetSecondsPerQuestion));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i];
    if (r < 0) return entries[i];
  }
  return entries[entries.length - 1];
}

/**
 * Works out which question generator a request means. Returns
 * { matches: [{ bank, gen }], mode } where mode is "match", "random",
 * "weak" or "none".
 */
function interpret(text) {
  const q = tokens(text);
  const scored = allGenerators().map((entry) => {
    let score = 0;
    for (const phrase of QUESTION_KEYWORDS[entry.bank.id][entry.gen.name] || []) {
      if (containsPhrase(q, phrase)) score = Math.max(score, tokens(phrase).length);
    }
    if (score > 0 && hasAny(q, BANK_HINTS[entry.bank.id])) score += 0.5;
    return { entry, score };
  });
  const best = Math.max(...scored.map((s) => s.score));
  if (best > 0) return { matches: scored.filter((s) => s.score === best).map((s) => s.entry), mode: "match" };

  if (hasAny(q, WEAK_WORDS)) return { matches: allGenerators(), mode: "weak" };
  for (const bank of BANKS) {
    if (hasAny(q, BANK_HINTS[bank.id])) return { matches: bank.generators.map((gen) => ({ bank, gen })), mode: "random" };
  }
  if (hasAny(q, RANDOM_WORDS)) return { matches: allGenerators(), mode: "random" };
  return { matches: [], mode: "none" };
}

/* ---------- greeting ---------- */

function weakestType() {
  let worst = null;
  for (const { bank, gen } of allGenerators()) {
    const entry = window.QuestionStats.get(bank.id, gen.name);
    if (!entry || entry.attempts < 2) continue;
    const w = window.QuestionStats.weight(bank.id, gen.name, bank.targetSecondsPerQuestion);
    if (!worst || w > worst.w) worst = { w, entry };
  }
  return worst && worst.entry.wrong > 0 ? worst.entry : null;
}

function renderGreeting() {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  let lastVisit = null;
  try {
    lastVisit = localStorage.getItem(VISIT_KEY);
    localStorage.setItem(VISIT_KEY, new Date().toISOString());
  } catch {
    // storage unavailable — treat as a first visit
  }
  const returning = Boolean(lastVisit);
  document.getElementById("greeting-title").textContent = returning
    ? choice([`${timeOfDay}, welcome back`, "Welcome back", `${timeOfDay} — ready for more?`])
    : timeOfDay;

  const weak = weakestType();
  document.getElementById("greeting-sub").textContent = weak
    ? `Fancy another go at ${weak.label}? You've got ${weak.attempts - weak.wrong} of ${weak.attempts} right so far.`
    : "What kind of question would you like to practise?";
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ---------- chat thread ---------- */

const thread = document.getElementById("chat-thread");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function scrollToBottom(node) {
  node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
}

function addMessage(role) {
  const msg = document.createElement("div");
  msg.className = `chat-msg chat-msg-${role}`;
  thread.appendChild(msg);
  thread.hidden = false;
  return msg;
}

function addUserMessage(text) {
  const msg = addMessage("user");
  const bubble = document.createElement("p");
  bubble.className = "chat-bubble";
  bubble.textContent = text;
  msg.appendChild(bubble);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : ms));
}

// Types text into a node a few characters at a time, finishing within ~1.2s.
async function typeOut(node, text) {
  if (reduceMotion) {
    node.textContent = text;
    return;
  }
  const step = Math.max(2, Math.ceil(text.length / 90));
  for (let i = 0; i < text.length; i += step) {
    node.textContent = text.slice(0, i + step);
    await wait(13);
  }
  node.textContent = text;
}

async function addAssistantText(msg, text, className = "chat-text") {
  const p = document.createElement("p");
  p.className = className;
  msg.appendChild(p);
  await typeOut(p, text);
  return p;
}

function addThinking(msg) {
  const dots = document.createElement("div");
  dots.className = "chat-thinking";
  dots.setAttribute("aria-label", "Thinking");
  dots.innerHTML = "<span></span><span></span><span></span>";
  msg.appendChild(dots);
  scrollToBottom(dots);
  return dots;
}

function addChips(msg, labels) {
  const row = document.createElement("div");
  row.className = "chat-chips";
  for (const label of labels) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-chip";
    chip.textContent = label;
    chip.addEventListener("click", () => ask(label));
    row.appendChild(chip);
  }
  msg.appendChild(row);
}

async function showQuestion(msg, { bank, gen }, number, total) {
  const q = Object.assign(gen(), { typeId: gen.name });
  const card = document.createElement("div");
  card.className = "chat-question";
  msg.appendChild(card);

  const tag = document.createElement("p");
  tag.className = "chat-tag";
  tag.textContent = total > 1 ? `${q.category} · ${number} of ${total}` : q.category;
  card.appendChild(tag);

  if (q.chartRender) {
    const chart = document.createElement("div");
    chart.className = "chart-wrap";
    card.appendChild(chart);
    q.chartRender(chart);
  }

  const prompt = document.createElement("p");
  prompt.className = "prompt";
  card.appendChild(prompt);
  await typeOut(prompt, q.prompt);

  const options = document.createElement("div");
  options.className = "options";
  card.appendChild(options);
  const feedback = document.createElement("div");
  card.appendChild(feedback);

  q.options.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.textContent = text;
    btn.addEventListener("click", () => {
      const correct = i === q.correctIndex;
      Array.from(options.children).forEach((b, j) => {
        b.disabled = true;
        if (j === q.correctIndex) b.classList.add("correct");
        if (j === i && !correct) b.classList.add("incorrect");
      });
      window.QuestionStats.record(bank.id, q, correct, null);
      const verdict = document.createElement("p");
      verdict.className = `chat-verdict ${correct ? "is-correct" : "is-incorrect"}`;
      verdict.textContent = correct ? "Correct." : `Not quite — the answer is ${q.options[q.correctIndex]}.`;
      const explain = document.createElement("p");
      explain.className = "review-explain";
      explain.textContent = q.explanation;
      feedback.append(verdict, explain);
      if (number === total) addChips(feedback, [`Another ${q.category.toLowerCase()} question`, "Something random", "What I find hard"]);
      scrollToBottom(feedback);
    });
    options.appendChild(btn);
  });
  scrollToBottom(card);
}

let busy = false;

async function ask(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  input.value = "";
  autoGrow();
  addUserMessage(text);

  const msg = addMessage("assistant");
  const thinking = addThinking(msg);
  await wait(650);
  thinking.remove();

  // "Another <category> question" chips name the exact type they came from.
  let result = null;
  const another = text.match(/^Another (.+) question$/i);
  if (another) {
    const entry = allGenerators().find(({ gen, bank }) => {
      const s = window.QuestionStats.get(bank.id, gen.name);
      return s && s.label.toLowerCase() === another[1].toLowerCase();
    });
    if (entry) result = { matches: [entry], mode: "match" };
  }
  result = result || interpret(text);

  if (result.mode === "none") {
    await addAssistantText(msg, "I couldn't match that to a question type I have. Try one of these, or ask for something random:");
    addChips(msg, ["Probability", "Break-even", "Container packing", "Bar chart", "Logic game", "Something random"]);
    busy = false;
    return;
  }

  const count = requestedCount(text);
  const intro =
    result.mode === "weak"
      ? count > 1 ? `Here are ${count} picked from the types you find hardest.` : "Here's one from the types you find hardest."
      : result.mode === "random"
        ? count > 1 ? `Here are ${count} at random.` : "Here's one at random."
        : count > 1 ? `Here are ${count} for you.` : "Here's one for you.";
  await addAssistantText(msg, intro);

  for (let i = 1; i <= count; i++) {
    const entry = result.mode === "weak" ? weightedPick(result.matches) : choice(result.matches);
    await showQuestion(msg, entry, i, count);
  }
  busy = false;
}

function autoGrow() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  ask(input.value);
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    ask(input.value);
  }
});
input.addEventListener("input", autoGrow);
document.querySelectorAll("#starter-chips .chat-chip").forEach((chip) =>
  chip.addEventListener("click", () => ask(chip.textContent))
);

renderGreeting();
