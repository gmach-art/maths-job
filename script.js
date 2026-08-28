"use strict";

const TARGET_SECONDS = 15 * 60; // recommended completion time
const TOTAL_QUESTIONS = 10;
const HISTORY_KEY = "numericalReasoningTrainerHistory";
const HISTORY_LIMIT = 30;

/* ---------- small utilities ---------- */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* ---------- attempt history (persisted locally per browser) ---------- */

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
  } catch (e) {
    // Storage unavailable (private browsing, quota, etc.) — progress just won't persist.
  }
}

function recordAttempt(score, elapsedSeconds) {
  const history = loadHistory();
  history.push({ score, elapsedSeconds, timestamp: Date.now() });
  saveHistory(history);
  return history.slice(-HISTORY_LIMIT);
}

function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    // ignore
  }
}

/**
 * Builds a shuffled multiple-choice question from a correct numeric value
 * and a list of plausible wrong numeric values. Distractors that would
 * format identically to the correct answer (or to each other) are dropped.
 */
function buildQuestion(category, prompt, correctValue, rawDistractors, formatFn, explanation) {
  const seen = new Set();
  const options = [];

  const correctText = formatFn(correctValue);
  seen.add(correctText);
  options.push({ text: correctText, isCorrect: true });

  for (const value of rawDistractors) {
    if (options.length >= 4) break;
    const text = formatFn(value);
    if (seen.has(text)) continue;
    seen.add(text);
    options.push({ text, isCorrect: false });
  }

  // Pad out if we ended up with fewer than 4 unique options (rare edge cases).
  let jitter = 1;
  while (options.length < 4) {
    const padded = correctValue + jitter * (correctValue === 0 ? 1 : Math.sign(correctValue) || 1) * (1 + jitter);
    const text = formatFn(padded);
    if (!seen.has(text)) {
      seen.add(text);
      options.push({ text, isCorrect: false });
    }
    jitter += 1;
    if (jitter > 20) break; // safety valve
  }

  // Fisher-Yates shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [options[i], options[j]] = [options[j], options[i]];
  }

  const correctIndex = options.findIndex((o) => o.isCorrect);

  return {
    category,
    prompt,
    options: options.map((o) => o.text),
    correctIndex,
    explanation,
  };
}

/* ---------- question generators ---------- */
/* Every generator is a self-contained word problem with randomised
   numbers, so replaying the test gives a fresh set of questions. */

function genAlgebra() {
  const a = randInt(3, 9);
  const x = randInt(6, 48);
  const b = randInt(5, 120);
  const c = a * x - b;

  const prompt =
    `A recruiter poses a brain-teaser: "Think of a number, multiply it by ${a}, ` +
    `then subtract ${b}. The result is ${c}." What number was the candidate thinking of?`;

  const distractors = [x + a, x - a, Math.round(c / a), x * 2];

  return buildQuestion(
    "Algebra",
    prompt,
    x,
    distractors,
    (v) => String(Math.round(v)),
    `${a} × ${x} − ${b} = ${c}, so the number is (${c} + ${b}) ÷ ${a} = ${x}.`
  );
}

function genWeightedAverage() {
  const n1 = randInt(20, 80);
  const n2 = randInt(20, 80);
  const s1 = randInt(50, 95);
  const s2 = randInt(50, 95);
  const weighted = (n1 * s1 + n2 * s2) / (n1 + n2);
  const correct = round1(weighted);

  const prompt =
    `In a client-satisfaction survey, ${n1} customers from the Retail division gave an ` +
    `average score of ${s1} out of 100, while ${n2} customers from the Corporate division ` +
    `gave an average score of ${s2} out of 100. What is the overall average score across ` +
    `both divisions, to 1 decimal place?`;

  const simpleAvg = round1((s1 + s2) / 2);
  const swapped = round1((n1 * s2 + n2 * s1) / (n1 + n2));
  const distractors = [simpleAvg, swapped, round1(weighted + 3), round1(weighted - 3)];

  return buildQuestion(
    "Weighted averages",
    prompt,
    correct,
    distractors,
    (v) => v.toFixed(1),
    `Weighted average = (${n1}×${s1} + ${n2}×${s2}) ÷ (${n1}+${n2}) = ${correct.toFixed(1)}.`
  );
}

function genOppositeSpeed() {
  const speed1 = randInt(8, 15) * 5; // 40-75 mph
  const speed2 = randInt(8, 15) * 5;
  const distance = randInt(20, 40) * 10; // 200-400 miles
  const closing = speed1 + speed2;
  const time = round1(distance / closing);

  const prompt =
    `Two delivery trucks leave warehouses that are ${distance} miles apart and drive directly ` +
    `toward each other along the same road. Truck A travels at ${speed1} mph and Truck B travels ` +
    `at ${speed2} mph. Assuming both maintain a constant speed, how long after they set off will ` +
    `they meet?`;

  const diff = Math.abs(speed1 - speed2) || speed1;
  const distractors = [
    round1(distance / diff),
    round1(distance / speed1),
    round1(time + 0.5),
    round1(Math.max(time - 0.5, 0.1)),
  ];

  return buildQuestion(
    "Speed & distance (opposite directions)",
    prompt,
    time,
    distractors,
    (v) => `${v.toFixed(1)} hours`,
    `Closing speed = ${speed1} + ${speed2} = ${closing} mph. Time = distance ÷ closing speed = ` +
      `${distance} ÷ ${closing} = ${time.toFixed(1)} hours.`
  );
}

function genSimultaneous() {
  const priceA = randInt(9, 20);
  const priceC = randInt(3, priceA - 1);
  const adultCount = randInt(30, 90);
  const childCount = randInt(20, 80);
  const total = adultCount + childCount;
  const revenue = adultCount * priceA + childCount * priceC;

  const prompt =
    `A cinema sells adult tickets for $${priceA} and child tickets for $${priceC}. On Saturday it ` +
    `sold ${total} tickets in total for combined revenue of $${revenue}. How many adult tickets ` +
    `were sold?`;

  const distractors = [
    childCount,
    Math.round(revenue / priceA),
    Math.round(total / 2),
    adultCount + 10,
  ];

  return buildQuestion(
    "Simultaneous equations",
    prompt,
    adultCount,
    distractors,
    (v) => String(Math.round(v)),
    `Let a = adult tickets and c = child tickets. a + c = ${total} and ${priceA}a + ${priceC}c = ` +
      `${revenue}. Solving the two equations gives a = ${adultCount} (and c = ${childCount}).`
  );
}

function genPercentSuccessive() {
  const price = randInt(40, 300);
  const incPct = choice([10, 15, 20, 25, 30]);
  const decPct = choice([10, 15, 20, 25, 30]);
  const afterInc = price * (1 + incPct / 100);
  const final = round2(afterInc * (1 - decPct / 100));

  const prompt =
    `A retailer increases the price of a product by ${incPct}%, then later applies a ${decPct}% ` +
    `discount to the new price. If the product originally cost $${price}, what is the final price, ` +
    `to the nearest cent?`;

  const naiveNet = round2(price * (1 + (incPct - decPct) / 100));
  const distractors = [price, naiveNet, round2(afterInc), round2(price * (1 - decPct / 100))];

  return buildQuestion(
    "Percentages",
    prompt,
    final,
    distractors,
    (v) => `$${v.toFixed(2)}`,
    `After the increase: $${price} × ${(1 + incPct / 100).toFixed(2)} = $${afterInc.toFixed(2)}. ` +
      `After the discount: $${afterInc.toFixed(2)} × ${(1 - decPct / 100).toFixed(2)} = $${final.toFixed(2)}.`
  );
}

function genRatio() {
  let rA = randInt(2, 7);
  let rB = randInt(2, 7);
  while (rB === rA) rB = randInt(2, 7);
  const divisor = gcd(rA, rB);
  rA = rA / divisor;
  rB = rB / divisor;

  const totalPart = randInt(4, 14);
  const amountA = rA * totalPart;
  const amountB = rB * totalPart;

  const prompt =
    `A bakery's recipe uses flour and sugar in the ratio ${rA}:${rB}. If a batch uses ${amountA} kg ` +
    `of flour, how much sugar is needed, in kg?`;

  const swapped = Math.round((amountA * rA) / rB);
  const distractors = [swapped, amountA, amountB + rA, Math.max(amountB - rB, 1)];

  return buildQuestion(
    "Ratios",
    prompt,
    amountB,
    distractors,
    (v) => `${Math.round(v)} kg`,
    `Sugar = flour × (${rB}/${rA}) = ${amountA} × ${rB} ÷ ${rA} = ${amountB} kg.`
  );
}

function genWorkRate() {
  const options = [4, 5, 6, 8, 9, 10, 12];
  const hoursA = choice(options);
  const hoursB = choice(options.filter((h) => h !== hoursA));
  const combined = (hoursA * hoursB) / (hoursA + hoursB);
  const correct = round1(combined);

  const prompt =
    `Working alone, Priya can complete a report in ${hoursA} hours and Jamal can complete the same ` +
    `report in ${hoursB} hours. If they work together, each at their own constant rate, how long ` +
    `will it take them to complete the report, to the nearest 0.1 hour?`;

  const distractors = [
    round1((hoursA + hoursB) / 2),
    hoursA + hoursB,
    round1(Math.abs(hoursA - hoursB)),
    round1(correct + 0.5),
  ];

  return buildQuestion(
    "Work rate",
    prompt,
    correct,
    distractors,
    (v) => `${v.toFixed(1)} hours`,
    `Combined rate = 1/${hoursA} + 1/${hoursB} of the report per hour. Time together = 1 ÷ ` +
      `(1/${hoursA} + 1/${hoursB}) = ${correct.toFixed(1)} hours.`
  );
}

function genCompoundGrowth() {
  const principal = randInt(2, 20) * 1000;
  const rate = choice([4, 5, 6, 8, 10]);
  const years = choice([2, 3]);
  const value = principal * Math.pow(1 + rate / 100, years);
  const correct = Math.round(value);

  const prompt =
    `An initial investment of $${principal.toLocaleString()} grows at a compound annual rate of ` +
    `${rate}%. What is the value of the investment after ${years} years, to the nearest dollar?`;

  const simpleInterest = Math.round(principal + principal * (rate / 100) * years);
  const distractors = [
    simpleInterest,
    Math.round(principal * Math.pow(1 + rate / 100, years + 1)),
    Math.round(principal * Math.pow(1 + rate / 100, Math.max(years - 1, 1))),
  ];

  return buildQuestion(
    "Compound growth",
    prompt,
    correct,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}`,
    `Value = $${principal.toLocaleString()} × (1 + ${rate}/100)^${years} = $${correct.toLocaleString()}.`
  );
}

function genMixture() {
  const volA = randInt(10, 40) * 5;
  const volB = randInt(10, 40) * 5;
  const concA = choice([10, 20, 30, 40]);
  const concB = choice([50, 60, 70, 80].filter((c) => c > concA));
  const totalAcid = volA * concA + volB * concB;
  const resultConc = totalAcid / (volA + volB);
  const correct = round1(resultConc);

  const prompt =
    `A chemist mixes ${volA} liters of a solution that is ${concA}% acid with ${volB} liters of a ` +
    `solution that is ${concB}% acid. What is the acid concentration of the resulting mixture, to ` +
    `1 decimal place?`;

  const simpleAvg = round1((concA + concB) / 2);
  const swapped = round1((volA * concB + volB * concA) / (volA + volB));
  const distractors = [simpleAvg, swapped, round1(resultConc + 2), round1(Math.max(resultConc - 2, 0))];

  return buildQuestion(
    "Mixtures",
    prompt,
    correct,
    distractors,
    (v) => `${v.toFixed(1)}%`,
    `Total acid = ${volA}×${concA}% + ${volB}×${concB}% = ${totalAcid}. Concentration = total acid ÷ ` +
      `total volume = ${totalAcid} ÷ ${volA + volB} = ${correct.toFixed(1)}%.`
  );
}

function genCatchUp() {
  const speedSlow = randInt(6, 12) * 5;
  const speedFast = speedSlow + randInt(2, 6) * 5;
  const headStart = choice([0.5, 1, 1.5, 2]);
  const gap = speedSlow * headStart;
  const closingSpeed = speedFast - speedSlow;
  const timeToCatch = round1(gap / closingSpeed);

  const prompt =
    `Car A leaves a service station and travels at a constant ${speedSlow} mph. Car B leaves the ` +
    `same service station along the same road ${headStart} hour${headStart === 1 ? "" : "s"} later, ` +
    `travelling at a constant ${speedFast} mph in the same direction. How long after Car B departs ` +
    `will it catch up with Car A?`;

  const distractors = [
    headStart,
    round1(gap / (speedFast + speedSlow)),
    round1(timeToCatch + 0.5),
    round1((speedFast * headStart) / closingSpeed),
  ];

  return buildQuestion(
    "Speed & distance (catch-up)",
    prompt,
    timeToCatch,
    distractors,
    (v) => `${v.toFixed(1)} hours`,
    `Car A has a ${gap.toFixed(0)}-mile head start when Car B departs. Car B closes the gap at ` +
      `${closingSpeed} mph, so time to catch up = ${gap.toFixed(0)} ÷ ${closingSpeed} = ` +
      `${timeToCatch.toFixed(1)} hours.`
  );
}

const GENERATORS = [
  genAlgebra,
  genWeightedAverage,
  genOppositeSpeed,
  genSimultaneous,
  genPercentSuccessive,
  genRatio,
  genWorkRate,
  genCompoundGrowth,
  genMixture,
  genCatchUp,
];

function buildQuestionSet() {
  // One question per generator, in a shuffled order, so all ten topics
  // required are always covered exactly once per playthrough.
  const questions = GENERATORS.map((gen) => gen());
  for (let i = questions.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions;
}

/* ---------- quiz state & DOM wiring ---------- */

const state = {
  questions: [],
  index: 0,
  answers: [], // { selectedIndex: number|null, correct: boolean }
  pendingIndex: null, // option chosen but not yet confirmed
  confirmed: false, // whether the current question's answer has been locked in
  secondsLeft: TARGET_SECONDS,
  timerId: null,
  startedAt: null,
  finished: false,
};

const el = {
  startScreen: document.getElementById("start-screen"),
  quizScreen: document.getElementById("quiz-screen"),
  resultsScreen: document.getElementById("results-screen"),
  startBtn: document.getElementById("start-btn"),
  nextBtn: document.getElementById("next-btn"),
  restartBtn: document.getElementById("restart-btn"),
  targetTimeDisplay: document.getElementById("target-time-display"),
  questionCounter: document.getElementById("question-counter"),
  progressFill: document.getElementById("progress-fill"),
  timer: document.getElementById("timer"),
  questionCategory: document.getElementById("question-category"),
  questionPrompt: document.getElementById("question-prompt"),
  optionsContainer: document.getElementById("options"),
  scoreValue: document.getElementById("score-value"),
  timeValue: document.getElementById("time-value"),
  targetValue: document.getElementById("target-value"),
  paceMessage: document.getElementById("pace-message"),
  reviewList: document.getElementById("review-list"),
  resultsHeadline: document.getElementById("results-headline"),
  progressChart: document.getElementById("progress-chart"),
  progressTableWrap: document.getElementById("progress-table-wrap"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
};

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

el.targetTimeDisplay.textContent = formatClock(TARGET_SECONDS);
el.targetValue.textContent = formatClock(TARGET_SECONDS);

function showScreen(screen) {
  [el.startScreen, el.quizScreen, el.resultsScreen].forEach((s) => s.classList.remove("active"));
  screen.classList.add("active");
}

function startQuiz() {
  state.questions = buildQuestionSet();
  state.index = 0;
  state.answers = [];
  state.secondsLeft = TARGET_SECONDS;
  state.finished = false;
  state.startedAt = Date.now();

  showScreen(el.quizScreen);
  renderQuestion();
  startTimer();
}

function startTimer() {
  clearInterval(state.timerId);
  updateTimerDisplay();
  state.timerId = setInterval(() => {
    state.secondsLeft -= 1;
    updateTimerDisplay();
    if (state.secondsLeft <= 0) {
      clearInterval(state.timerId);
      finishQuiz(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  el.timer.textContent = formatClock(state.secondsLeft);
  el.timer.classList.toggle("warn", state.secondsLeft <= 60);
}

function renderQuestion() {
  const q = state.questions[state.index];
  state.pendingIndex = null;
  state.confirmed = false;

  el.questionCounter.textContent = `Question ${state.index + 1} of ${TOTAL_QUESTIONS}`;
  el.progressFill.style.width = `${((state.index + 1) / TOTAL_QUESTIONS) * 100}%`;
  el.questionCategory.textContent = q.category;
  el.questionPrompt.textContent = q.prompt;
  el.optionsContainer.innerHTML = "";
  el.nextBtn.disabled = true;
  el.nextBtn.textContent = "Confirm answer";

  q.options.forEach((optionText, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.type = "button";
    btn.textContent = optionText;
    btn.addEventListener("click", () => chooseOption(i));
    el.optionsContainer.appendChild(btn);
  });
}

function chooseOption(index) {
  if (state.confirmed) return; // answer already locked in for this question

  state.pendingIndex = index;
  const buttons = Array.from(el.optionsContainer.children);
  buttons.forEach((btn, i) => btn.classList.toggle("selected", i === index));
  el.nextBtn.disabled = false;
}

function confirmAnswer() {
  const q = state.questions[state.index];
  const buttons = Array.from(el.optionsContainer.children);

  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correctIndex) btn.classList.add("correct");
    if (i === state.pendingIndex && i !== q.correctIndex) btn.classList.add("incorrect");
  });

  state.answers[state.index] = {
    selectedIndex: state.pendingIndex,
    correct: state.pendingIndex === q.correctIndex,
  };
  state.confirmed = true;

  el.nextBtn.textContent = state.index === TOTAL_QUESTIONS - 1 ? "See results" : "Next question";
}

function handleActionClick() {
  if (!state.confirmed) {
    confirmAnswer();
  } else {
    goToNext();
  }
}

function goToNext() {
  if (state.index < TOTAL_QUESTIONS - 1) {
    state.index += 1;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz(timedOut) {
  if (state.finished) return;
  state.finished = true;
  clearInterval(state.timerId);

  const elapsedSeconds = timedOut
    ? TARGET_SECONDS
    : Math.round((Date.now() - state.startedAt) / 1000);
  const score = state.answers.filter((a) => a && a.correct).length;
  const history = recordAttempt(score, elapsedSeconds);

  renderResults(elapsedSeconds, Boolean(timedOut), score, history);
  showScreen(el.resultsScreen);
}

function renderResults(elapsedSeconds, timedOut, score, history) {
  el.scoreValue.textContent = `${score}/${TOTAL_QUESTIONS}`;
  el.timeValue.textContent = formatClock(elapsedSeconds);
  el.targetValue.textContent = formatClock(TARGET_SECONDS);

  if (timedOut) {
    el.paceMessage.textContent = `Time ran out before you finished all questions — real tests will cut you off too.`;
  } else {
    el.paceMessage.textContent = `You finished with ${formatClock(TARGET_SECONDS - elapsedSeconds)} to spare — nice pace.`;
  }

  if (score >= 8) {
    el.resultsHeadline.textContent = "Strong result";
  } else if (score >= 5) {
    el.resultsHeadline.textContent = "Solid attempt";
  } else {
    el.resultsHeadline.textContent = "Room to improve";
  }

  renderProgressChart(history);
  renderProgressTable(history);

  el.reviewList.innerHTML = "";
  state.questions.forEach((q, i) => {
    const answer = state.answers[i];
    const item = document.createElement("div");

    let statusClass = "unanswered";
    let answerLine = "You did not answer this question.";
    if (answer) {
      statusClass = answer.correct ? "correct" : "incorrect";
      answerLine = `Your answer: ${q.options[answer.selectedIndex]}`;
    }

    item.className = `review-item ${statusClass}`;
    item.innerHTML = `
      <p class="review-q">${i + 1}. [${q.category}] ${q.prompt}</p>
      <p class="review-answer">${answerLine}</p>
      <p class="review-answer">Correct answer: ${q.options[q.correctIndex]}</p>
      <p class="review-explain">${q.explanation}</p>
    `;
    el.reviewList.appendChild(item);
  });
}

/* ---------- progress chart (line chart of score across attempts) ---------- */

function renderProgressChart(history) {
  el.progressChart.innerHTML = "";

  if (history.length < 2) {
    const note = document.createElement("p");
    note.className = "progress-empty";
    note.textContent =
      history.length === 0
        ? "No attempts recorded yet."
        : "Play again to start seeing your progress on a graph.";
    el.progressChart.appendChild(note);
    return;
  }

  const width = 560;
  const height = 200;
  const marginLeft = 30;
  const marginRight = 12;
  const marginTop = 14;
  const marginBottom = 26;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const n = history.length;

  const xFor = (i) => marginLeft + (i / (n - 1)) * plotW;
  const yFor = (score) => marginTop + plotH - (score / TOTAL_QUESTIONS) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "progress-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Line chart of score out of ${TOTAL_QUESTIONS} across ${n} attempts, from ${history[0].score} to ${history[n - 1].score}`
  );

  // gridlines + y-axis labels (fixed scale, since scores are always out of 10)
  [0, 2, 4, 6, 8, 10].forEach((tick) => {
    const y = yFor(tick);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", marginLeft);
    line.setAttribute("x2", width - marginRight);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", "progress-gridline");
    svg.appendChild(line);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", marginLeft - 6);
    label.setAttribute("y", y);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("class", "progress-axis-label");
    label.textContent = String(tick);
    svg.appendChild(label);
  });

  // x-axis attempt labels, thinned out if there are many attempts
  const step = Math.max(1, Math.ceil(n / 10));
  history.forEach((_, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", xFor(i));
    label.setAttribute("y", height - marginBottom + 16);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "progress-axis-label");
    label.textContent = String(i + 1);
    svg.appendChild(label);
  });

  // the line itself
  let d = "";
  history.forEach((h, i) => {
    d += `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(h.score).toFixed(1)} `;
  });
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", d.trim());
  path.setAttribute("class", "progress-line");
  path.setAttribute("fill", "none");
  svg.appendChild(path);

  // crosshair, hidden until hover/focus
  const crosshair = document.createElementNS(svgNS, "line");
  crosshair.setAttribute("y1", marginTop);
  crosshair.setAttribute("y2", height - marginBottom);
  crosshair.setAttribute("class", "progress-crosshair");
  crosshair.style.opacity = "0";
  svg.appendChild(crosshair);

  const tooltip = document.createElement("div");
  tooltip.className = "progress-tooltip";
  tooltip.style.opacity = "0";

  history.forEach((h, i) => {
    const cx = xFor(i);
    const cy = yFor(h.score);

    const marker = document.createElementNS(svgNS, "circle");
    marker.setAttribute("cx", cx);
    marker.setAttribute("cy", cy);
    marker.setAttribute("r", "4");
    marker.setAttribute("class", "progress-marker");
    svg.appendChild(marker);

    // generous, keyboard-reachable hit target (spec: >= 24px diameter)
    const hit = document.createElementNS(svgNS, "circle");
    hit.setAttribute("cx", cx);
    hit.setAttribute("cy", cy);
    hit.setAttribute("r", "12");
    hit.setAttribute("class", "progress-hit");
    hit.setAttribute("tabindex", "0");
    hit.setAttribute(
      "aria-label",
      `Attempt ${i + 1}: ${h.score} out of ${TOTAL_QUESTIONS}, completed in ${formatClock(h.elapsedSeconds)}`
    );

    const show = () => {
      crosshair.setAttribute("x1", cx);
      crosshair.setAttribute("x2", cx);
      crosshair.style.opacity = "1";
      tooltip.style.opacity = "1";
      tooltip.style.left = `${(cx / width) * 100}%`;
      tooltip.style.top = `${(cy / height) * 100}%`;
      tooltip.innerHTML = "";
      const value = document.createElement("div");
      value.className = "progress-tooltip-value";
      value.textContent = `${h.score}/${TOTAL_QUESTIONS}`;
      const sub = document.createElement("div");
      sub.className = "progress-tooltip-sub";
      sub.textContent = `Attempt ${i + 1} · ${formatClock(h.elapsedSeconds)}`;
      tooltip.appendChild(value);
      tooltip.appendChild(sub);
    };
    const hide = () => {
      crosshair.style.opacity = "0";
      tooltip.style.opacity = "0";
    };

    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", show);
    hit.addEventListener("blur", hide);
    svg.appendChild(hit);
  });

  el.progressChart.appendChild(svg);
  el.progressChart.appendChild(tooltip);
}

function renderProgressTable(history) {
  if (history.length === 0) {
    el.progressTableWrap.innerHTML = "";
    return;
  }

  const table = document.createElement("table");
  table.className = "progress-table";
  table.innerHTML = `
    <thead>
      <tr><th>Attempt</th><th>Date</th><th>Score</th><th>Time taken</th></tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");

  history.forEach((h, i) => {
    const row = document.createElement("tr");
    const date = new Date(h.timestamp);
    const dateCell = document.createElement("td");
    dateCell.textContent = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const attemptCell = document.createElement("td");
    attemptCell.textContent = String(i + 1);
    const scoreCell = document.createElement("td");
    scoreCell.textContent = `${h.score}/${TOTAL_QUESTIONS}`;
    const timeCell = document.createElement("td");
    timeCell.textContent = formatClock(h.elapsedSeconds);

    row.appendChild(attemptCell);
    row.appendChild(dateCell);
    row.appendChild(scoreCell);
    row.appendChild(timeCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  el.progressTableWrap.innerHTML = "";
  el.progressTableWrap.appendChild(table);
}

el.startBtn.addEventListener("click", startQuiz);
el.nextBtn.addEventListener("click", handleActionClick);
el.restartBtn.addEventListener("click", startQuiz);
el.clearHistoryBtn.addEventListener("click", () => {
  if (!window.confirm("Clear your saved progress history? This can't be undone.")) return;
  clearHistory();
  renderProgressChart([]);
  renderProgressTable([]);
});
