"use strict";

/* Quick Quiz: 10 questions in 10 minutes, 7 from the Numerical Reasoning
   bank and 3 from the Data Analysis bank. Question types are drawn by
   weighted sampling (see QuestionStats.weight in stats.js), so types you
   often miss or spend longest on turn up more, while unseen and mastered
   types still appear now and then. */

const TOTAL_QUESTIONS = 10;
const TARGET_SECONDS = 10 * 60;
const SECONDS_PER_QUESTION = TARGET_SECONDS / TOTAL_QUESTIONS;
const MIX = [
  { bank: window.NumericalReasoningBank, count: 7 },
  { bank: window.DataAnalysisBank, count: 3 },
];
const FOCUS_LIST_SIZE = 5;
const MIN_ATTEMPTS_FOR_FOCUS = 2;

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Weighted sampling without replacement: each draw picks a generator with
// probability proportional to its weight, then removes it from the pool.
function weightedSample(items, weightOf, count) {
  const pool = items.map((item) => ({ item, w: weightOf(item) }));
  const picks = [];
  while (picks.length < count && pool.length) {
    const total = pool.reduce((sum, p) => sum + p.w, 0);
    let r = Math.random() * total;
    let i = 0;
    while (i < pool.length - 1 && r >= pool[i].w) {
      r -= pool[i].w;
      i++;
    }
    picks.push(pool.splice(i, 1)[0].item);
  }
  return picks;
}

// Why a question type was likely chosen, shown in the review (null if it
// was just a random pick).
function focusReason(bankId, typeId) {
  const entry = window.QuestionStats.get(bankId, typeId);
  if (!entry || entry.attempts < MIN_ATTEMPTS_FOR_FOCUS) return null;
  const avg = entry.totalSeconds / entry.attempts;
  const parts = [];
  if (entry.wrong / entry.attempts >= 0.5) parts.push(`missed ${entry.wrong} of ${entry.attempts} times`);
  if (avg > SECONDS_PER_QUESTION) parts.push(`averages ${Math.round(avg)}s`);
  return parts.length ? `Focus area — ${parts.join(", ")}` : null;
}

function buildQuestionSet() {
  const questions = [];
  for (const { bank, count } of MIX) {
    const gens = weightedSample(
      bank.generators,
      (gen) => window.QuestionStats.weight(bank.id, gen.name, bank.targetSecondsPerQuestion),
      count
    );
    for (const gen of gens) {
      const q = Object.assign(gen(), { typeId: gen.name, bankId: bank.id });
      q.focusReason = focusReason(bank.id, gen.name);
      questions.push(q);
    }
  }
  return shuffleInPlace(questions);
}

/* ---------- quiz state & DOM wiring ---------- */

const state = {
  questions: [],
  index: 0,
  answers: [],
  pendingIndex: null,
  confirmed: false,
  secondsLeft: TARGET_SECONDS,
  timerId: null,
  startedAt: null,
  questionShownAt: null,
  finished: false,
};

const el = {
  startScreen: document.getElementById("start-screen"),
  quizScreen: document.getElementById("quiz-screen"),
  resultsScreen: document.getElementById("results-screen"),
  startBtn: document.getElementById("start-btn"),
  nextBtn: document.getElementById("next-btn"),
  restartBtn: document.getElementById("restart-btn"),
  statsNote: document.getElementById("stats-note"),
  questionCounter: document.getElementById("question-counter"),
  progressFill: document.getElementById("progress-fill"),
  timer: document.getElementById("timer"),
  questionChart: document.getElementById("question-chart"),
  questionPrompt: document.getElementById("question-prompt"),
  optionsContainer: document.getElementById("options"),
  scoreValue: document.getElementById("score-value"),
  timeValue: document.getElementById("time-value"),
  paceMessage: document.getElementById("pace-message"),
  resultsHeadline: document.getElementById("results-headline"),
  focusList: document.getElementById("focus-list"),
  clearStatsBtn: document.getElementById("clear-stats-btn"),
  reviewList: document.getElementById("review-list"),
};

function renderStatsNote() {
  const answered = Object.values(window.QuestionStats.load()).reduce((sum, e) => sum + e.attempts, 0);
  el.statsNote.textContent = answered
    ? `Based on ${answered.toLocaleString()} question${answered === 1 ? "" : "s"} you've answered so far across all three quizzes.`
    : `No answers recorded yet, so this round is fully random — it starts targeting your weak spots as you play any of the quizzes.`;
}

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

function renderChart(container, q) {
  container.innerHTML = "";
  container.hidden = !q.chartRender;
  if (q.chartRender) q.chartRender(container);
}

function renderQuestion() {
  const q = state.questions[state.index];
  state.pendingIndex = null;
  state.confirmed = false;
  state.questionShownAt = Date.now();

  el.questionCounter.textContent = `Question ${state.index + 1} of ${TOTAL_QUESTIONS}`;
  el.progressFill.style.width = `${((state.index + 1) / TOTAL_QUESTIONS) * 100}%`;
  renderChart(el.questionChart, q);
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
  if (state.confirmed) return;
  state.pendingIndex = index;
  Array.from(el.optionsContainer.children).forEach((btn, i) => btn.classList.toggle("selected", i === index));
  el.nextBtn.disabled = false;
}

function confirmAnswer() {
  const q = state.questions[state.index];
  Array.from(el.optionsContainer.children).forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correctIndex) btn.classList.add("correct");
    if (i === state.pendingIndex && i !== q.correctIndex) btn.classList.add("incorrect");
  });

  const correct = state.pendingIndex === q.correctIndex;
  state.answers[state.index] = { selectedIndex: state.pendingIndex, correct };
  state.confirmed = true;
  window.QuestionStats.record(q.bankId, q, correct, (Date.now() - state.questionShownAt) / 1000);

  el.nextBtn.textContent = state.index === TOTAL_QUESTIONS - 1 ? "See results" : "Next question";
}

function handleActionClick() {
  if (!state.confirmed) confirmAnswer();
  else if (state.index < TOTAL_QUESTIONS - 1) {
    state.index += 1;
    renderQuestion();
  } else finishQuiz(false);
}

function finishQuiz(timedOut) {
  if (state.finished) return;
  state.finished = true;
  clearInterval(state.timerId);
  if (timedOut && !state.confirmed) {
    const q = state.questions[state.index];
    window.QuestionStats.record(q.bankId, q, false, (Date.now() - state.questionShownAt) / 1000);
  }

  const elapsedSeconds = timedOut ? TARGET_SECONDS : Math.round((Date.now() - state.startedAt) / 1000);
  const score = state.answers.filter((a) => a && a.correct).length;
  renderResults(elapsedSeconds, timedOut, score);
  showScreen(el.resultsScreen);
}

function renderFocusList() {
  el.focusList.innerHTML = "";
  const rows = [];
  for (const { bank } of MIX) {
    for (const gen of bank.generators) {
      const entry = window.QuestionStats.get(bank.id, gen.name);
      if (!entry || entry.attempts < MIN_ATTEMPTS_FOR_FOCUS) continue;
      const label = bank === window.DataAnalysisBank ? `${entry.label} (Data Analysis)` : entry.label;
      rows.push({ entry, label, w: window.QuestionStats.weight(bank.id, gen.name, bank.targetSecondsPerQuestion) });
    }
  }
  rows.sort((a, b) => b.w - a.w);
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "progress-caption";
    p.textContent = `Answer each question type at least ${MIN_ATTEMPTS_FOR_FOCUS} times to see it ranked here.`;
    el.focusList.appendChild(p);
    return;
  }
  const list = document.createElement("ol");
  list.className = "info-list";
  rows.slice(0, FOCUS_LIST_SIZE).forEach(({ entry, label }) => {
    const li = document.createElement("li");
    const avg = Math.round(entry.totalSeconds / entry.attempts);
    li.innerHTML = `<strong></strong> <span class="hint"></span>`;
    li.querySelector("strong").textContent = label;
    li.querySelector("span").textContent =
      `— ${entry.attempts - entry.wrong}/${entry.attempts} correct, ${avg}s on average`;
    list.appendChild(li);
  });
  el.focusList.appendChild(list);
}

function renderResults(elapsedSeconds, timedOut, score) {
  el.scoreValue.textContent = `${score}/${TOTAL_QUESTIONS}`;
  el.timeValue.textContent = formatClock(elapsedSeconds);
  el.paceMessage.textContent = timedOut
    ? `Time ran out before you finished all questions — real tests will cut you off too.`
    : `You finished with ${formatClock(TARGET_SECONDS - elapsedSeconds)} to spare — nice pace.`;
  el.resultsHeadline.textContent = score >= 8 ? "Strong result" : score >= 5 ? "Solid attempt" : "Room to improve";

  renderFocusList();

  el.reviewList.innerHTML = "";
  state.questions.forEach((q, i) => {
    const answer = state.answers[i];
    const item = document.createElement("div");
    item.className = `review-item ${answer ? (answer.correct ? "correct" : "incorrect") : "unanswered"}`;

    const heading = document.createElement("p");
    heading.className = "review-q";
    heading.textContent = `${i + 1}. [${q.category}] ${q.prompt}`;
    item.appendChild(heading);

    if (q.focusReason) {
      const tag = document.createElement("p");
      tag.className = "review-explain";
      tag.textContent = q.focusReason;
      item.appendChild(tag);
    }

    if (q.chartRender) {
      const chartDiv = document.createElement("div");
      chartDiv.className = "chart-wrap review-chart-wrap";
      q.chartRender(chartDiv);
      item.appendChild(chartDiv);
    }

    const rest = document.createElement("div");
    rest.innerHTML = `
      <p class="review-answer">${answer ? `Your answer: ${q.options[answer.selectedIndex]}` : "You did not answer this question."}</p>
      <p class="review-answer">Correct answer: ${q.options[q.correctIndex]}</p>
      <p class="review-explain">${q.explanation}</p>
    `;
    item.appendChild(rest);
    el.reviewList.appendChild(item);
  });
}

renderStatsNote();
el.startBtn.addEventListener("click", startQuiz);
el.nextBtn.addEventListener("click", handleActionClick);
el.restartBtn.addEventListener("click", () => {
  renderStatsNote();
  startQuiz();
});
el.clearStatsBtn.addEventListener("click", () => {
  if (!window.confirm("Clear the per-question-type stats Quick Quiz uses to pick your weak spots? This can't be undone.")) return;
  window.QuestionStats.clear();
  renderFocusList();
});
