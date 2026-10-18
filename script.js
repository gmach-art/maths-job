"use strict";

// Everything is wrapped in one function scope so Quick Quiz can load this
// question bank alongside the other one without their helpers clashing.
(() => {

const TOTAL_QUESTIONS = 27; // one of every question type currently in the generator pools
const TARGET_SECONDS = TOTAL_QUESTIONS * 60; // recommended completion time: 1 minute per question
const CLOSE_READING_COUNT = 5;
const LOGIC_GAME_COUNT = 1;
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

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleGenerators(pool, count) {
  return shuffleInPlace([...pool]).slice(0, count);
}

// Evenly spaced gridline values for the progress chart's y-axis, from 0 up
// to (but not exceeding) maxValue, using a "nice" step size so the chart
// reads sensibly regardless of how many total questions there are.
function progressChartTicks(maxValue) {
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100];
  const roughStep = maxValue / 5;
  const step = niceSteps.find((s) => s >= roughStep) || niceSteps[niceSteps.length - 1];
  const ticks = [];
  for (let t = 0; t <= maxValue; t += step) ticks.push(t);
  return ticks;
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
 * Builds a shuffled multiple-choice question from a correct value (number or,
 * for "which of these" questions, a string) and a list of plausible wrong
 * values. Distractors that would format identically to the correct answer
 * (or to each other) are dropped.
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

  // Pad out if we ended up with fewer than 4 unique numeric options (rare edge cases).
  let jitter = 1;
  while (options.length < 4 && typeof correctValue === "number") {
    const padded = correctValue + jitter * (correctValue === 0 ? 1 : Math.sign(correctValue) || 1);
    const text = formatFn(padded);
    if (!seen.has(text)) {
      seen.add(text);
      options.push({ text, isCorrect: false });
    }
    jitter += 1;
    if (jitter > 20) break; // safety valve
  }

  shuffleInPlace(options);
  const correctIndex = options.findIndex((o) => o.isCorrect);

  return {
    category,
    prompt,
    options: options.map((o) => o.text),
    correctIndex,
    explanation,
  };
}

/* ---------- question generators (standard) ---------- */
/* Every generator is a self-contained word problem with randomised numbers,
   so replaying the test gives a fresh set of questions. Most require at
   least two reasoning steps rather than a single formula application. */

function genWeightedAverage() {
  const n1 = randInt(15, 60);
  const n2 = randInt(15, 60);
  const n3 = randInt(15, 60);
  const s1 = randInt(45, 95);
  const s2 = randInt(45, 95);
  const s3 = randInt(45, 95);
  const weighted = (n1 * s1 + n2 * s2 + n3 * s3) / (n1 + n2 + n3);
  const correct = round1(weighted);

  const prompt =
    `In a client-satisfaction survey, ${n1} customers from Retail gave an average score of ${s1}, ${n2} ` +
    `customers from Corporate gave an average score of ${s2}, and ${n3} customers from Wholesale gave an ` +
    `average score of ${s3} (all out of 100). What is the overall average score across all three ` +
    `divisions, to 1 decimal place?`;

  const simpleAvg = round1((s1 + s2 + s3) / 3);
  const twoOnly = round1((n1 * s1 + n2 * s2) / (n1 + n2));
  const distractors = [simpleAvg, twoOnly, round1(weighted + 1.5), round1(weighted - 1.5)];

  return buildQuestion(
    "Weighted averages",
    prompt,
    correct,
    distractors,
    (v) => v.toFixed(1),
    `Weighted average = (${n1}×${s1} + ${n2}×${s2} + ${n3}×${s3}) ÷ (${n1}+${n2}+${n3}) = ${correct.toFixed(1)}.`
  );
}

function genOppositeSpeed() {
  const speed1 = randInt(38, 78);
  const speed2 = randInt(38, 78);
  const distance = randInt(220, 480);
  const delay = choice([0.25, 0.5, 0.75, 1, 1.25, 1.5]);

  const headStartGap = round2(speed1 * delay);
  if (headStartGap >= distance) return genOppositeSpeed(); // Truck A would already be there before B even leaves

  const remainingGap = round2(distance - headStartGap);
  const closing = speed1 + speed2;
  const timeAfterBDeparts = round2(remainingGap / closing);
  const totalTime = round2(delay + timeAfterBDeparts);

  const prompt =
    `Truck A leaves a warehouse and travels at a constant ${speed1} mph directly toward a second warehouse ` +
    `${distance} miles away. Truck B leaves the second warehouse ${delay} hours later, travelling at a ` +
    `constant ${speed2} mph directly toward Truck A along the same road. How long after Truck A departs ` +
    `will the two trucks meet, to 2 decimal places?`;

  const naiveIgnoreDelay = round2(distance / closing); // pretends both left at the same time
  const forgotToAddDelay = timeAfterBDeparts; // counts only the time after B departs, not the total since A left
  const delayAppliedToWrongTruck = round2(delay + (distance - round2(speed2 * delay)) / closing); // gives the head start to B instead of A
  const forgotHeadStartDistance = round2(delay + distance / closing); // adds the delay but never shrinks the gap A already closed
  const distractors = [naiveIgnoreDelay, forgotToAddDelay, delayAppliedToWrongTruck, forgotHeadStartDistance];

  return buildQuestion(
    "Speed & distance (opposite directions)",
    prompt,
    totalTime,
    distractors,
    (v) => `${v.toFixed(2)} hours`,
    `In its ${delay}-hour head start, Truck A covers ${speed1} × ${delay} = ${headStartGap.toFixed(1)} miles, ` +
      `leaving ${remainingGap.toFixed(1)} miles between the trucks once Truck B finally sets off. Closing ` +
      `speed once both are moving = ${speed1} + ${speed2} = ${closing} mph, so that remaining gap takes ` +
      `${remainingGap.toFixed(1)} ÷ ${closing} = ${timeAfterBDeparts.toFixed(2)} hours to close. Total time ` +
      `since Truck A departed = ${delay} + ${timeAfterBDeparts.toFixed(2)} = ${totalTime.toFixed(2)} hours.`
  );
}

function genSimultaneous() {
  const priceA = randInt(11, 26);
  const priceC = randInt(4, priceA - 2);
  const adultCount = randInt(40, 140);
  const childCount = randInt(30, 120);
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
    adultCount + 5,
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
  const pct1 = choice([10, 15, 20, 25, 30]);
  const pct2 = choice([10, 15, 20, 25, 30]);
  const pct3 = choice([5, 10, 15, 20]);
  const dir1 = choice([1, -1]);
  const dir2 = choice([1, -1]);
  const dir3 = choice([1, -1]);
  const afterStep1 = price * (1 + (dir1 * pct1) / 100);
  const afterStep2 = afterStep1 * (1 + (dir2 * pct2) / 100);
  const final = round2(afterStep2 * (1 + (dir3 * pct3) / 100));
  const verb = (d) => (d === 1 ? "increases" : "decreases");

  const prompt =
    `A retailer's price ${verb(dir1)} by ${pct1}%, then ${verb(dir2)} by ${pct2}% on the new price, ` +
    `then finally ${verb(dir3)} by ${pct3}% on that price. If the product originally cost $${price}, ` +
    `what is the final price, to the nearest cent?`;

  const naiveNet = round2(price * (1 + (dir1 * pct1 + dir2 * pct2 + dir3 * pct3) / 100));
  const distractors = [price, naiveNet, round2(afterStep2), round2(afterStep1)];

  return buildQuestion(
    "Percentages",
    prompt,
    final,
    distractors,
    (v) => `$${v.toFixed(2)}`,
    `Step 1: $${price} × ${(1 + (dir1 * pct1) / 100).toFixed(2)} = $${afterStep1.toFixed(2)}. Step 2: ` +
      `$${afterStep1.toFixed(2)} × ${(1 + (dir2 * pct2) / 100).toFixed(2)} = $${afterStep2.toFixed(2)}. ` +
      `Step 3: $${afterStep2.toFixed(2)} × ${(1 + (dir3 * pct3) / 100).toFixed(2)} = $${final.toFixed(2)}. ` +
      `Simply adding the three percentages together gives the wrong answer — each change applies to the ` +
      `new price, not the original.`
  );
}

function genRatio() {
  const [rA, rB, rC] = shuffleInPlace([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
  const totalPart = randInt(4, 12);
  const amountA = rA * totalPart;
  const amountB = rB * totalPart;
  const amountC = rC * totalPart;
  const growthPct = choice([5, 8, 10, 12, 15, 20]);
  const projectedC = Math.round(amountC * (1 + growthPct / 100));

  const prompt =
    `A company's headcount is split across Engineering, Sales, and Operations in the ratio ${rA}:${rB}:${rC}. ` +
    `It currently has ${amountA} employees in Engineering. Operations is projected to grow by ${growthPct}% ` +
    `next quarter. How many employees will Operations have after that growth, rounded to the nearest whole ` +
    `number?`;

  const swappedBase = Math.round((amountA * rB) / rA);
  const distractors = [
    amountC,
    Math.round(amountB * (1 + growthPct / 100)),
    Math.round(amountC * (1 + growthPct / 200)),
    Math.round(swappedBase * (1 + growthPct / 100)),
  ];

  return buildQuestion(
    "Ratios",
    prompt,
    projectedC,
    distractors,
    (v) => `${Math.round(v)} employees`,
    `Operations currently = Engineering × (${rC}/${rA}) = ${amountA} × ${rC} ÷ ${rA} = ${amountC} employees. ` +
      `(Sales's ratio, ${rB}, isn't needed to find Operations's current headcount.) After ${growthPct}% ` +
      `growth: ${amountC} × 1.${String(growthPct).padStart(2, "0")} = ${projectedC} employees.`
  );
}

function genWorkRate() {
  const options = [4, 5, 6, 8, 9, 10, 12, 15];
  const hoursA = choice(options);
  const hoursB = choice(options.filter((h) => h !== hoursA));
  const rateA = 1 / hoursA;
  const rateB = 1 / hoursB;
  const togetherHours = choice([1, 1.5]);
  const workDoneTogether = togetherHours * (rateA + rateB);
  const remaining = Math.max(1 - workDoneTogether, 0.01);
  const finishAlone = round1(remaining / rateA);

  const prompt =
    `Working alone, Priya can complete a report in ${hoursA} hours and Jamal can complete the same ` +
    `report in ${hoursB} hours. They work together for ${togetherHours} hour${togetherHours === 1 ? "" : "s"}, ` +
    `then Jamal leaves and Priya finishes the rest alone. How many more hours does Priya need, to the ` +
    `nearest 0.1 hour?`;

  const combinedTime = round1((hoursA * hoursB) / (hoursA + hoursB));
  const distractors = [combinedTime, hoursA, round1(finishAlone + 0.5), round1(Math.max(finishAlone - 0.5, 0.1))];

  return buildQuestion(
    "Work rate",
    prompt,
    finishAlone,
    distractors,
    (v) => `${v.toFixed(1)} hours`,
    `In ${togetherHours} hour${togetherHours === 1 ? "" : "s"} together they complete ${togetherHours} × ` +
      `(1/${hoursA} + 1/${hoursB}) = ${(workDoneTogether * 100).toFixed(1)}% of the report, leaving ` +
      `${(remaining * 100).toFixed(1)}%. Priya alone needs ${remaining.toFixed(2)} ÷ (1/${hoursA}) = ` +
      `${finishAlone.toFixed(1)} more hours.`
  );
}

function genCompoundGrowth() {
  const principal = randInt(2, 20) * 1000;
  const rate1 = choice([4, 5, 6, 8, 10]);
  const rate2 = choice([3, 5, 7, 9, 12]);
  const years1 = choice([2, 3]);
  const years2 = choice([1, 2]);
  const afterPhase1 = principal * Math.pow(1 + rate1 / 100, years1);
  const value = afterPhase1 * Math.pow(1 + rate2 / 100, years2);
  const correct = Math.round(value);
  const totalYears = years1 + years2;

  const prompt =
    `An initial investment of $${principal.toLocaleString()} grows at a compound annual rate of ` +
    `${rate1}% for ${years1} years, then the rate changes to ${rate2}% for a further ${years2} ` +
    `year${years2 === 1 ? "" : "s"}. What is the value of the investment at the end, to the nearest dollar?`;

  const naiveSingleRate = Math.round(principal * Math.pow(1 + rate1 / 100, totalYears));
  const avgRate = (rate1 + rate2) / 2;
  const naiveAvg = Math.round(principal * Math.pow(1 + avgRate / 100, totalYears));
  const distractors = [naiveSingleRate, naiveAvg, Math.round(afterPhase1)];

  return buildQuestion(
    "Compound growth",
    prompt,
    correct,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}`,
    `After phase 1: $${principal.toLocaleString()} × (1 + ${rate1}/100)^${years1} = $${Math.round(afterPhase1).toLocaleString()}. ` +
      `After phase 2: that × (1 + ${rate2}/100)^${years2} = $${correct.toLocaleString()}.`
  );
}

function genGrowthForecast() {
  const monthsElapsed = choice([3, 4, 5, 6]);
  const initialUsers = randInt(20, 200) * 1000;
  const growthMultiple = choice([1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5]);
  const laterUsers = Math.round((initialUsers * growthMultiple) / 100) * 100;
  const additionalMonths = choice([2, 3, 4, 5]);
  const totalMonths = monthsElapsed + additionalMonths;
  const ratio = laterUsers / initialUsers;
  const projectedUsers = Math.round((initialUsers * Math.pow(ratio, totalMonths / monthsElapsed)) / 100) * 100;

  const prompt =
    `A startup's monthly active users grew from ${initialUsers.toLocaleString()} in Month 0 to ` +
    `${laterUsers.toLocaleString()} in Month ${monthsElapsed}, and that growth has been tracking a steady ` +
    `trend line the whole time. If the user base keeps following that same trend, approximately how many ` +
    `monthly active users will the startup have in Month ${totalMonths}, to the nearest 100 users?`;

  const linearExtrapolation =
    Math.round((laterUsers + ((laterUsers - initialUsers) / monthsElapsed) * additionalMonths) / 100) * 100; // extended the trend as a straight line instead of compounding it
  const invertedExponent = Math.round((initialUsers * Math.pow(ratio, monthsElapsed / totalMonths)) / 100) * 100; // flipped the exponent's numerator and denominator
  const repeatedFullMultiple = Math.round((laterUsers * ratio) / 100) * 100; // reapplied the entire Month-0-to-Month-N multiple again, ignoring that the forecast window is a different length
  const distractors = [
    linearExtrapolation,
    invertedExponent,
    repeatedFullMultiple,
    Math.round((projectedUsers * 1.1) / 100) * 100,
  ];

  return buildQuestion(
    "Growth forecasting",
    prompt,
    projectedUsers,
    distractors,
    (v) => `${Math.round(v).toLocaleString()} users`,
    `The two data points imply a constant growth rate of (${laterUsers.toLocaleString()} ÷ ` +
      `${initialUsers.toLocaleString()}) per ${monthsElapsed}-month stretch, compounding continuously in ` +
      `between. Projecting that rate ${additionalMonths} months beyond the data given, to Month ` +
      `${totalMonths}, means raising the ratio to the power of how many ${monthsElapsed}-month stretches ` +
      `that spans: ${initialUsers.toLocaleString()} × (${laterUsers.toLocaleString()} ÷ ` +
      `${initialUsers.toLocaleString()})^(${totalMonths}/${monthsElapsed}) ≈ ` +
      `${projectedUsers.toLocaleString()} users. Extending the trend as a straight line, instead of ` +
      `compounding it, understates how fast it's actually accelerating.`
  );
}

function genMixture() {
  const volA = randInt(10, 35) * 5;
  const volB = randInt(10, 35) * 5;
  const volC = randInt(10, 35) * 5;
  const concA = choice([10, 15, 20, 25]);
  const concB = choice([35, 40, 45, 50]);
  const concC = choice([60, 65, 70, 75]);
  const totalAcid = volA * concA + volB * concB + volC * concC;
  const totalVol = volA + volB + volC;
  const resultConc = totalAcid / totalVol;
  const correct = round1(resultConc);

  const prompt =
    `A chemist mixes ${volA} liters of a ${concA}% acid solution, ${volB} liters of a ${concB}% acid ` +
    `solution, and ${volC} liters of a ${concC}% acid solution. What is the acid concentration of the ` +
    `combined mixture, to 1 decimal place?`;

  const simpleAvg = round1((concA + concB + concC) / 3);
  const twoOnly = round1((volA * concA + volB * concB) / (volA + volB));
  const distractors = [simpleAvg, twoOnly, round1(resultConc + 1.2), round1(Math.max(resultConc - 1.2, 0))];

  return buildQuestion(
    "Mixtures",
    prompt,
    correct,
    distractors,
    (v) => `${v.toFixed(1)}%`,
    `Total acid = ${volA}×${concA}% + ${volB}×${concB}% + ${volC}×${concC}% = ${totalAcid}. Concentration ` +
      `= total acid ÷ total volume = ${totalAcid} ÷ ${totalVol} = ${correct.toFixed(1)}%.`
  );
}

function genCatchUp() {
  const speedSlow = randInt(32, 62);
  const speedFast = speedSlow + randInt(8, 28);
  const headStart = choice([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const gap = speedSlow * headStart;
  const closingSpeed = speedFast - speedSlow;
  const timeToCatch = round2(gap / closingSpeed);

  const prompt =
    `Car A leaves a service station and travels at a constant ${speedSlow} mph. Car B leaves the ` +
    `same service station along the same road ${headStart} hours later, travelling at a constant ` +
    `${speedFast} mph in the same direction. How long after Car B departs will it catch up with Car A, ` +
    `to 2 decimal places?`;

  const distractors = [
    headStart,
    round2(gap / (speedFast + speedSlow)),
    round2(timeToCatch + 0.2),
    round2((speedFast * headStart) / closingSpeed),
  ];

  return buildQuestion(
    "Speed & distance (catch-up)",
    prompt,
    timeToCatch,
    distractors,
    (v) => `${v.toFixed(2)} hours`,
    `Car A has a ${gap.toFixed(1)}-mile head start when Car B departs. Car B closes the gap at ` +
      `${closingSpeed} mph, so time to catch up = ${gap.toFixed(1)} ÷ ${closingSpeed} = ` +
      `${timeToCatch.toFixed(2)} hours.`
  );
}

function genGrossMargin() {
  const revenue = randInt(20, 120) * 10;
  const cogsPct = randInt(35, 65);
  const opexPct = randInt(10, 25);
  const cogs = Math.round((revenue * cogsPct) / 100);
  const opex = Math.round((revenue * opexPct) / 100);
  const netProfit = revenue - cogs - opex;
  const margin = round1((netProfit / revenue) * 100);

  const prompt =
    `A business reports revenue of $${revenue}k, cost of goods sold (COGS) of $${cogs}k, and operating ` +
    `expenses of $${opex}k for the quarter. What is the company's net profit margin (net profit as a ` +
    `percentage of revenue), to 1 decimal place?`;

  const grossMarginOnly = round1(((revenue - cogs) / revenue) * 100);
  const distractors = [
    grossMarginOnly,
    round1((cogs / revenue) * 100),
    round1(margin + 3),
    round1(Math.max(margin - 3, 1)),
  ];

  return buildQuestion(
    "Margins",
    prompt,
    margin,
    distractors,
    (v) => `${v.toFixed(1)}%`,
    `Net profit = $${revenue}k − $${cogs}k − $${opex}k = $${netProfit}k. Net margin = $${netProfit}k ÷ ` +
      `$${revenue}k × 100 = ${margin.toFixed(1)}%. Stopping after COGS alone gives the gross margin ` +
      `(${grossMarginOnly.toFixed(1)}%), not the net margin asked for.`
  );
}

function genBreakeven() {
  const fixedCosts = randInt(20, 200) * 100;
  const pricePerUnit = randInt(15, 60);
  const variableCostPerUnit = randInt(5, pricePerUnit - 5);
  const contributionPerUnit = pricePerUnit - variableCostPerUnit;
  const targetProfit = randInt(10, 100) * 100;
  const requiredUnits = Math.ceil((fixedCosts + targetProfit) / contributionPerUnit);
  const breakevenOnly = Math.ceil(fixedCosts / contributionPerUnit);

  const prompt =
    `A startup has fixed costs of $${fixedCosts.toLocaleString()} per month. Each unit sells for ` +
    `$${pricePerUnit} and costs $${variableCostPerUnit} in variable costs to produce. How many units ` +
    `must it sell per month to earn a target profit of $${targetProfit.toLocaleString()}?`;

  const distractors = [
    breakevenOnly,
    Math.ceil(fixedCosts / pricePerUnit),
    requiredUnits + 15,
    Math.max(requiredUnits - 15, 1),
  ];

  return buildQuestion(
    "Break-even analysis",
    prompt,
    requiredUnits,
    distractors,
    (v) => `${Math.round(v).toLocaleString()} units`,
    `Contribution margin per unit = $${pricePerUnit} − $${variableCostPerUnit} = $${contributionPerUnit}. ` +
      `Units needed = (fixed costs + target profit) ÷ contribution per unit = ` +
      `($${fixedCosts.toLocaleString()} + $${targetProfit.toLocaleString()}) ÷ $${contributionPerUnit} ≈ ` +
      `${requiredUnits.toLocaleString()} units. (Plain break-even, ignoring the target profit, would only ` +
      `need ${breakevenOnly.toLocaleString()} units.)`
  );
}

function genContributionMarginRatio() {
  const priceA = randInt(30, 100);
  const varA = randInt(5, priceA - 10);
  const priceB = randInt(30, 100);
  const varB = randInt(5, priceB - 10);
  const mixAPct = choice([30, 40, 50, 60, 70]);
  const mixBPct = 100 - mixAPct;
  const cmA = priceA - varA;
  const cmB = priceB - varB;
  const ratioA = (cmA / priceA) * 100;
  const ratioB = (cmB / priceB) * 100;
  const blended = round1((mixAPct / 100) * ratioA + (mixBPct / 100) * ratioB);

  const prompt =
    `A company sells two products. (Contribution margin ratio = the percentage of each sales dollar left ` +
    `over, after variable costs, to cover fixed costs and profit — i.e. (price − variable cost) ÷ price.) ` +
    `Product A sells for $${priceA} with a variable cost of $${varA}, and makes up ${mixAPct}% of unit ` +
    `sales. Product B sells for $${priceB} with a variable cost of $${varB}, and makes up the remaining ` +
    `${mixBPct}% of unit sales. What is the company's blended contribution margin ratio, weighted by sales ` +
    `mix, to 1 decimal place?`;

  const simpleAvg = round1((ratioA + ratioB) / 2);
  const distractors = [simpleAvg, round1(blended + 4), round1(Math.max(blended - 4, 1)), round1(ratioA)];

  return buildQuestion(
    "Contribution margin",
    prompt,
    blended,
    distractors,
    (v) => `${v.toFixed(1)}%`,
    `Product A margin = ($${priceA} − $${varA}) ÷ $${priceA} × 100 = ${ratioA.toFixed(1)}%. Product B ` +
      `margin = ($${priceB} − $${varB}) ÷ $${priceB} × 100 = ${ratioB.toFixed(1)}%. Blended = ${mixAPct}% × ` +
      `${ratioA.toFixed(1)}% + ${mixBPct}% × ${ratioB.toFixed(1)}% = ${blended.toFixed(1)}%.`
  );
}

function genPaybackPeriod() {
  const investment = randInt(60, 200) * 1000;
  const cashFlows = [randInt(10, 60) * 1000, randInt(10, 60) * 1000, randInt(10, 60) * 1000, randInt(10, 60) * 1000];

  let cumulative = 0;
  let paybackYear = null;
  let fractionalYear = null;
  for (let i = 0; i < cashFlows.length; i++) {
    const prevCumulative = cumulative;
    cumulative += cashFlows[i];
    if (cumulative >= investment && paybackYear === null) {
      paybackYear = i + 1;
      const remaining = investment - prevCumulative;
      fractionalYear = round1(i + remaining / cashFlows[i]);
    }
  }
  if (paybackYear === null) return genPaybackPeriod(); // regenerate if not recovered within 4 years

  const prompt =
    `A company invests $${investment.toLocaleString()} in a new project, expected to generate these ` +
    `cash flows — Year 1: $${cashFlows[0].toLocaleString()}, Year 2: $${cashFlows[1].toLocaleString()}, ` +
    `Year 3: $${cashFlows[2].toLocaleString()}, Year 4: $${cashFlows[3].toLocaleString()}. What is the ` +
    `payback period, to the nearest 0.1 year?`;

  const avgCF = cashFlows.reduce((a, b) => a + b, 0) / 4;
  const naiveSimple = round1(investment / avgCF);
  const distractors = [
    naiveSimple,
    paybackYear,
    round1(fractionalYear + 0.5),
    round1(Math.max(fractionalYear - 0.5, 0.1)),
  ];

  const cumulativeStr = cashFlows
    .map((_, i) => `Y${i + 1} $${cashFlows.slice(0, i + 1).reduce((a, b) => a + b, 0).toLocaleString()}`)
    .join(", ");

  return buildQuestion(
    "Payback period",
    prompt,
    fractionalYear,
    distractors,
    (v) => `${v.toFixed(1)} years`,
    `Cumulative cash flow: ${cumulativeStr}. The investment is recovered during year ${paybackYear}: ` +
      `payback = ${fractionalYear.toFixed(1)} years. (Dividing the investment by the average annual cash ` +
      `flow only works when cash flows are even, which they aren't here.)`
  );
}

function genTournamentBracket() {
  const bracketSize = choice([16, 32, 64, 128]);
  const totalMatches = bracketSize - 1;
  const numberOfRounds = Math.round(Math.log2(bracketSize));

  const prompt =
    `A tennis tournament starts with a Round of ${bracketSize} (that is, ${bracketSize} players) and is ` +
    `single-elimination: every match eliminates the loser, and the field is cut in half each round until ` +
    `one champion remains after the Final. How many matches are played in total, from the Round of ` +
    `${bracketSize} through to the Final?`;

  const countedRoundsNotMatches = numberOfRounds; // confused the number of rounds with the number of matches
  const firstRoundOnly = bracketSize / 2; // only counted matches in the opening round
  const usedFieldSizeDirectly = bracketSize; // forgot that one player (the eventual champion) is never eliminated
  const forgotTheFinal = bracketSize - 2; // summed the earlier rounds but dropped the Final itself
  const distractors = [countedRoundsNotMatches, firstRoundOnly, usedFieldSizeDirectly, forgotTheFinal];

  return buildQuestion(
    "Tournament brackets",
    prompt,
    totalMatches,
    distractors,
    (v) => `${Math.round(v)} matches`,
    `Every match eliminates exactly one player, and the tournament must eliminate everyone except the ` +
      `champion — ${bracketSize} − 1 = ${totalMatches} players — so there are ${totalMatches} matches in ` +
      `total, however the rounds are split up (it doesn't matter that there are ${numberOfRounds} rounds). ` +
      `Counting rounds instead of matches, counting only the first round (${firstRoundOnly} matches), or ` +
      `forgetting to include the Final itself, all give the wrong total.`
  );
}

function genMarketShareDoubling() {
  const currentSharePct = choice([3, 4, 5, 6, 8, 10, 12, 15]);
  const doublingMonths = choice([3, 4, 6, 8, 9, 12]);
  const targetSharePct = 50;
  const growthMultiple = targetSharePct / currentSharePct;
  const requiredDoublings = Math.log2(growthMultiple);
  const requiredMonths = round1(doublingMonths * requiredDoublings);

  const prompt =
    `A startup currently holds ${currentSharePct}% market share, and that share has been doubling every ` +
    `${doublingMonths} months. If that doubling rate continues, approximately how many months from now ` +
    `until the company reaches ${targetSharePct}% market share, to 1 decimal place?`;

  const roundedDoublingsUp = doublingMonths * Math.ceil(requiredDoublings); // rounded the number of doublings up to a whole number first
  const linearScale = round1(doublingMonths * (growthMultiple - 1)); // scaled the time linearly with the growth multiple instead of logarithmically
  const forgotToMultiplyByPeriod = round1(requiredDoublings); // found the number of doublings but forgot to multiply by the doubling period
  const usedNaturalLog = round1(doublingMonths * Math.log(growthMultiple)); // used natural log instead of log base 2
  const distractors = [roundedDoublingsUp, linearScale, forgotToMultiplyByPeriod, usedNaturalLog];

  return buildQuestion(
    "Doubling time",
    prompt,
    requiredMonths,
    distractors,
    (v) => `${v.toFixed(1)} months`,
    `Going from ${currentSharePct}% to ${targetSharePct}% share means the share must multiply by ` +
      `${growthMultiple.toFixed(2)}×, which takes log₂(${growthMultiple.toFixed(2)}) ≈ ` +
      `${requiredDoublings.toFixed(2)} doubling periods — not a whole number, since the target doesn't ` +
      `line up exactly with a doubling. At ${doublingMonths} months per doubling, that's ${doublingMonths} ` +
      `× ${requiredDoublings.toFixed(2)} ≈ ${requiredMonths.toFixed(1)} months.`
  );
}

/* Shipping-container questions, modelled on a Bain case interview (the
   original used a 12.036 m × 2.253 m × 2.285 m container and 1.22 m × 0.5 m ×
   0.5 m boxes, where the best loading is 180). Every attempt randomises the
   container and box sizes. The loading rule stated in the prompt — at most
   three rectangular sections made by straight dividing walls, every box in a
   section facing the same way — keeps the problem solvable by hand, and the
   answer is found by searching every orientation and every wall position that
   lines up with a combination of box sides. All lengths are handled
   internally in whole millimetres. */

const BAIN_CONTAINER_MM = [12036, 2253, 2285];
const BAIN_BOX_MM = [1220, 500, 500];

function boxOrientations(box, allowUpright) {
  const [a, b, c] = box;
  const all = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  const longest = Math.max(a, b, c);
  const seen = new Set();
  return all.filter((o) => {
    if (!allowUpright && o[2] === longest && longest > Math.min(a, b, c)) return false;
    const key = o.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Wall positions worth trying: whole multiples of a single box side. Any
// other position can slide back to the furthest edge of the boxes on its near
// side without losing a box there, which only frees space on the far side.
function wallPositions(sides, limit) {
  const positions = new Set();
  for (const s of sides) for (let x = s; x < limit; x += s) positions.add(x);
  return [...positions].sort((x, y) => x - y);
}

// One section, every box facing the same way.
function packSingle(region, orientations) {
  let best = { count: 0, sections: [] };
  for (const o of orientations) {
    const counts = o.map((side, i) => Math.floor(region[i] / side));
    const count = counts[0] * counts[1] * counts[2];
    if (count > best.count) best = { count, sections: [{ dims: region, orientation: o, counts, boxes: count }] };
  }
  return best;
}

// Every way to split a region with one wall into two sub-regions.
function forEachSplit(region, positionsByAxis, fn) {
  for (let axis = 0; axis < 3; axis++) {
    for (const p of positionsByAxis[axis]) {
      if (p >= region[axis]) break;
      const a = region.slice();
      const b = region.slice();
      a[axis] = p;
      b[axis] = region[axis] - p;
      fn(a, b);
    }
  }
}

/**
 * Best number of boxes using at most `maxSections` (1–3) sections. Returns
 * { count, sections: [{ dims, orientation, counts, boxes }] }.
 */
function packContainer(container, box, { maxSections = 3, allowUpright = true } = {}) {
  const orientations = boxOrientations(box, allowUpright);
  const positions = container.map((L) => wallPositions([...new Set(box)], L));
  const single = (region) => packSingle(region, orientations);
  const combine = (x, y) => ({ count: x.count + y.count, sections: [...x.sections, ...y.sections] });

  const twoSections = (region) => {
    let best = single(region);
    forEachSplit(region, positions, (a, b) => {
      if (single(a).count + single(b).count > best.count) best = combine(single(a), single(b));
    });
    return best;
  };

  let best = maxSections === 1 ? single(container) : twoSections(container);
  if (maxSections === 3) {
    forEachSplit(container, positions, (a, b) => {
      const singleA = single(a);
      const singleB = single(b);
      // Splitting a section in two can at most double it, so skip splits that can't win.
      if (singleA.count + singleB.count + Math.max(singleA.count, singleB.count) <= best.count) return;
      for (const o of [combine(twoSections(a), singleB), combine(singleA, twoSections(b))]) {
        if (o.count > best.count) best = o;
      }
    });
  }
  return { count: best.count, sections: best.sections.filter((s) => s.boxes > 0) };
}

const mStr = (mm) => `${+(mm / 1000).toFixed(3)} m`;

function containerDescriptionMm(c) {
  return `${mStr(c[0])} long × ${mStr(c[1])} wide × ${mStr(c[2])} high`;
}

function describeSections(sections) {
  const axisNames = ["along the length", "across the width", "up the height"];
  return sections
    .map((s) => {
      const longAxis = s.orientation.indexOf(Math.max(...s.orientation));
      return (
        `a ${mStr(s.dims[0])} × ${mStr(s.dims[1])} × ${mStr(s.dims[2])} section with the long side ` +
        `${axisNames[longAxis]} holds ${s.counts.join(" × ")} = ${s.boxes}`
      );
    })
    .join("; ");
}

const LOADING_RULE =
  `Boxes can be rotated to any orientation (including stood on end) but can't be cut or squashed. ` +
  `Loaders may split the container into at most three rectangular sections using straight dividing ` +
  `walls of no thickness; every box within a section faces the same way, but different sections can ` +
  `face different ways.`;

// Random container near a standard 40 ft box, and a long, slim box, kept only
// when mixing orientations genuinely beats the best single orientation — the
// insight this question exists to test.
function randomPackingInstance() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const container = [randInt(11950, 12100), randInt(2200, 2360), randInt(2200, 2400)];
    const short1 = randInt(40, 65) * 10;
    const short2 = choice([short1, randInt(40, 65) * 10]);
    const long = randInt(95, 140) * 10;
    const box = [long, short1, short2];
    const single = packContainer(container, box, { maxSections: 1 }).count;
    const best = packContainer(container, box);
    if (best.count >= single + 6) return { container, box, single, best };
  }
  const container = BAIN_CONTAINER_MM;
  const box = BAIN_BOX_MM;
  return { container, box, single: packContainer(container, box, { maxSections: 1 }).count, best: packContainer(container, box) };
}

function genContainerPacking() {
  const { container, box, single, best } = randomPackingInstance();
  const correct = best.count;
  const twoSectionsOnly = packContainer(container, box, { maxSections: 2 }).count;
  const lyingFlat = packContainer(container, box, { allowUpright: false }).count;
  const byVolume = Math.floor((container[0] * container[1] * container[2]) / (box[0] * box[1] * box[2]));
  // Lay every box the best single way, then fill only the slab left at the far end.
  const singleOrient = boxOrientations(box, true).find(
    (o) => Math.floor(container[0] / o[0]) * Math.floor(container[1] / o[1]) * Math.floor(container[2] / o[2]) === single
  );
  const endGap = container[0] - Math.floor(container[0] / singleOrient[0]) * singleOrient[0];
  const plusEndGap = single + (endGap > 0 ? packContainer([endGap, container[1], container[2]], box, { maxSections: 2 }).count : 0);
  const shownBox = shuffleInPlace(box.slice());

  const prompt =
    `A shipping container's internal space measures ${containerDescriptionMm(container)}. A company ` +
    `ships a product in rigid rectangular boxes measuring ${shownBox.map(mStr).join(" × ")}. ` +
    `${LOADING_RULE} What is the greatest number of boxes that fit in one container?`;

  const notes = [`every box facing the same way gives at most ${single}`];
  if (plusEndGap > single && plusEndGap < correct) notes.push(`filling the gap left at the far end only brings that to ${plusEndGap}`);
  if (twoSectionsOnly < correct && twoSectionsOnly !== plusEndGap) notes.push(`stopping at two sections gives only ${twoSectionsOnly}`);
  if (lyingFlat < correct) notes.push(`never standing a box on end gives ${lyingFlat}`);
  notes.push(`dividing volumes (≈${byVolume}) ignores the gaps that boxes can't fill`);

  return buildQuestion(
    "Container packing",
    prompt,
    correct,
    [plusEndGap, single, twoSectionsOnly, lyingFlat, byVolume, correct - 4],
    (v) => `${Math.round(v)} boxes`,
    `Mix orientations so the gap one direction leaves is filled by boxes turned another way. One best ` +
      `loading: ${describeSections(best.sections)} — ${correct} boxes in total. By contrast, ` +
      `${notes.join("; ")}.`
  );
}

function genShippingCost() {
  const container = [randInt(11950, 12100), randInt(2200, 2360), randInt(2200, 2400)];
  const box = [randInt(80, 200) * 10, randInt(45, 80) * 10, randInt(40, 80) * 10];
  const packing = packContainer(container, box);
  const perContainer = packing.count;
  const shownBox = shuffleInPlace(box.slice());
  const weeklyUnits = Math.max(randInt(14, 40) * perContainer + randInt(1, perContainer - 1), 100);
  const costPerContainer = randInt(28, 64) * 100 + 50;
  const weeksPerYear = 52;
  const containersPerWeek = Math.ceil(weeklyUnits / perContainer);
  const annualCost = containersPerWeek * costPerContainer * weeksPerYear;

  const prompt =
    `A shipping container's internal space measures ${containerDescriptionMm(container)}. A retailer ` +
    `imports a product packed in rigid boxes measuring ${shownBox.map(mStr).join(" × ")}. ${LOADING_RULE} ` +
    `It must ship ${weeklyUnits.toLocaleString()} boxes every week, each container sent costs ` +
    `$${costPerContainer.toLocaleString()} regardless of how full it is, and every week's order ships ` +
    `separately. Loading each container as full as possible, how much does the retailer spend on ` +
    `shipping over a ${weeksPerYear}-week year?`;

  // Common slips: no rounding up to whole containers, pooling a year's boxes
  // before rounding, stopping at one week, or packing the boxes in the
  // orientation their sides happen to be listed in.
  const noRoundUp = (weeklyUnits / perContainer) * costPerContainer * weeksPerYear;
  const pooledYear = Math.ceil((weeklyUnits * weeksPerYear) / perContainer) * costPerContainer;
  const asListedFit = shownBox.reduce((n, side, i) => n * Math.floor(container[i] / side), 1);
  const asListed =
    asListedFit > 0 && asListedFit !== perContainer
      ? Math.ceil(weeklyUnits / asListedFit) * costPerContainer * weeksPerYear
      : (containersPerWeek + 1) * costPerContainer * weeksPerYear;
  const distractors = [noRoundUp, asListed, pooledYear, containersPerWeek * costPerContainer, annualCost * 1.1];

  return buildQuestion(
    "Shipping cost",
    prompt,
    annualCost,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}`,
    `Best loading: ${describeSections(packing.sections)} — ${perContainer} boxes per container. ` +
      `${weeklyUnits.toLocaleString()} ÷ ${perContainer} = ${(weeklyUnits / perContainer).toFixed(2)}, which rounds UP ` +
      `to ${containersPerWeek} containers a week — a part-full container still costs the full rate. Weekly cost = ` +
      `${containersPerWeek} × $${costPerContainer.toLocaleString()} = $${(containersPerWeek * costPerContainer).toLocaleString()}; ` +
      `× ${weeksPerYear} weeks = $${annualCost.toLocaleString()}.`
  );
}

/* Counting and probability questions. Each generator picks one of several
   scenarios (with freshly randomised numbers), so the same question type
   doesn't always reduce to the same formula. */

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function permutations(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r *= n - i;
  return r;
}

function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  return Math.round(permutations(n, k) / factorial(k));
}

const COUNTING_SCENARIOS = [
  // Distinct roles: order matters (n P k).
  () => {
    const roles = shuffleInPlace(["CEO", "CFO", "COO", "CTO", "Chair", "Treasurer"]).slice(0, randInt(3, 4));
    const n = randInt(7, 12);
    const answer = permutations(n, roles.length);
    return {
      prompt:
        `A start-up's board has ${n} members. ${roles.length} different positions — ${roles.join(", ")} — must ` +
        `each be filled by a different board member. In how many different ways can the positions be filled?`,
      answer,
      distractors: [combinations(n, roles.length), Math.pow(n, roles.length), factorial(roles.length) * n, answer / 2],
      explanation:
        `The positions are different, so order matters: ${n} choices for the first, ${n - 1} for the second, and so on — ` +
        `${n}P${roles.length} = ${Array.from({ length: roles.length }, (_, i) => n - i).join(" × ")} = ` +
        `${answer.toLocaleString()}. (Treating the positions as identical gives only ${n}C${roles.length} = ` +
        `${combinations(n, roles.length).toLocaleString()}; letting one person hold several gives ${n}^${roles.length}.)`,
    };
  },
  // Team with an "at least one" constraint: complement counting.
  () => {
    const analysts = randInt(5, 9);
    const managers = randInt(3, 5);
    const k = randInt(3, 4);
    const total = combinations(analysts + managers, k);
    const noManager = combinations(analysts, k);
    const answer = total - noManager;
    const overcount = managers * combinations(analysts + managers - 1, k - 1); // pick "the" manager, then anyone
    return {
      prompt:
        `A consulting office has ${analysts} analysts and ${managers} managers. A project team of ${k} people is ` +
        `to be chosen, and it must include at least one manager. The roles within the team don't matter. How ` +
        `many different teams are possible?`,
      answer,
      distractors: [total, overcount, managers * combinations(analysts, k - 1), noManager],
      explanation:
        `Count all teams, then remove the ones with no manager. All teams: ${analysts + managers}C${k} = ` +
        `${total.toLocaleString()}. Teams of analysts only: ${analysts}C${k} = ${noManager.toLocaleString()}. ` +
        `${total.toLocaleString()} − ${noManager.toLocaleString()} = ${answer.toLocaleString()}. (Choosing "the" ` +
        `manager first and then anyone for the rest, ${managers} × ${analysts + managers - 1}C${k - 1} = ` +
        `${overcount.toLocaleString()}, counts teams with two or more managers more than once.)`,
    };
  },
  // Row seating where two people must sit together.
  () => {
    const n = randInt(5, 8);
    const answer = 2 * factorial(n - 1);
    return {
      prompt:
        `${n} colleagues are to sit in a row of ${n} seats for a panel photo. Two of them, Priya and Tom, insist ` +
        `on sitting next to each other. How many different seating arrangements are possible?`,
      answer,
      distractors: [factorial(n), factorial(n - 1), factorial(n) - answer, 2 * factorial(n - 2)],
      explanation:
        `Glue Priya and Tom into one block: that's ${n - 1} units to arrange, in ${n - 1}! = ` +
        `${factorial(n - 1).toLocaleString()} ways. The pair can sit in either order inside the block (×2), so ` +
        `${answer.toLocaleString()} arrangements. (Forgetting the ×2 gives ${factorial(n - 1).toLocaleString()}; ` +
        `${(factorial(n) - answer).toLocaleString()} is the number where they're NOT together.)`,
    };
  },
  // Fewer seats than people, one person guaranteed a seat.
  () => {
    const seats = randInt(3, 5);
    const people = seats + randInt(2, 5);
    const answer = seats * permutations(people - 1, seats - 1);
    return {
      prompt:
        `A client dinner has ${seats} numbered seats at the top table and ${people} people who could sit there. ` +
        `The managing partner must be given one of the ${seats} seats (any of them); the other seats go to any of ` +
        `the remaining people, and it matters who sits in which seat. How many different top-table arrangements ` +
        `are there?`,
      answer,
      distractors: [
        permutations(people, seats),
        permutations(people - 1, seats - 1),
        seats * combinations(people - 1, seats - 1),
        permutations(people - 1, seats),
      ],
      explanation:
        `Place the managing partner first: ${seats} seat choices. The other ${seats - 1} numbered seats are filled in ` +
        `order from the ${people - 1} others: ${people - 1}P${seats - 1} = ${permutations(people - 1, seats - 1).toLocaleString()}. ` +
        `${seats} × ${permutations(people - 1, seats - 1).toLocaleString()} = ${answer.toLocaleString()}. (With no ` +
        `restriction it would be ${people}P${seats} = ${permutations(people, seats).toLocaleString()}.)`,
    };
  },
];

function genCounting() {
  const s = choice(COUNTING_SCENARIOS)();
  return buildQuestion(
    "Counting & arrangements",
    s.prompt,
    s.answer,
    s.distractors,
    (v) => `${Math.round(v).toLocaleString()}`,
    s.explanation
  );
}

const pct1 = (p) => `${(p * 100).toFixed(1)}%`;

const PROBABILITY_SCENARIOS = [
  // Drawing without replacement: exactly one of a kind.
  () => {
    const faulty = randInt(3, 7);
    const good = randInt(9, 20);
    const total = faulty + good;
    const answer = (faulty * good) / combinations(total, 2);
    const p = faulty / total;
    return {
      prompt:
        `A crate holds ${total} units, ${faulty} of which are faulty. An inspector picks 2 units at random, ` +
        `without putting the first back. What is the probability that exactly one of the two is faulty?`,
      answer,
      distractors: [(faulty / total) * (good / (total - 1)), 2 * p * (1 - p), p, (faulty / total) * ((faulty - 1) / (total - 1))],
      explanation:
        `Faulty then good: ${faulty}/${total} × ${good}/${total - 1}; good then faulty: ${good}/${total} × ` +
        `${faulty}/${total - 1}. Both orders count, so P = 2 × ${faulty} × ${good} ÷ (${total} × ${total - 1}) = ` +
        `${pct1(answer)}. (Counting only one order gives half that; treating the draws as independent, with ` +
        `replacement, gives ${pct1(2 * p * (1 - p))}.)`,
    };
  },
  // At least one success across independent attempts.
  () => {
    const pct = randInt(12, 35);
    const n = randInt(3, 6);
    const answer = 1 - Math.pow(1 - pct / 100, n);
    return {
      prompt:
        `A sales team pitches to ${n} prospective clients this month. Each pitch independently has a ${pct}% ` +
        `chance of winning the contract. What is the probability that the team wins at least one contract?`,
      answer,
      distractors: [...((n * pct) / 100 < 1 ? [(n * pct) / 100] : []), Math.pow(pct / 100, n), Math.pow(1 - pct / 100, n), 1 - Math.pow(pct / 100, n), n * (pct / 100) * Math.pow(1 - pct / 100, n - 1)],
      explanation:
        `Use the complement: P(no wins) = (1 − ${pct / 100})^${n} = ${pct1(Math.pow(1 - pct / 100, n))}, so P(at least ` +
        `one) = 1 − that = ${pct1(answer)}. (Adding ${n} × ${pct}% double-counts outcomes with several wins; ` +
        `${pct1(n * (pct / 100) * Math.pow(1 - pct / 100, n - 1))} is the chance of exactly one.)`,
    };
  },
  // Reverse conditional probability (Bayes) across two suppliers.
  () => {
    const shareA = randInt(5, 8) * 10;
    const rateA = randInt(2, 5);
    const rateB = rateA + randInt(2, 6);
    const pA = (shareA / 100) * (rateA / 100);
    const pB = ((100 - shareA) / 100) * (rateB / 100);
    const answer = pA / (pA + pB);
    return {
      prompt:
        `A retailer buys ${shareA}% of its stock from Supplier A and the rest from Supplier B. ${rateA}% of ` +
        `Supplier A's items are returned as faulty, compared with ${rateB}% of Supplier B's. An item is returned ` +
        `as faulty. What is the probability it came from Supplier A?`,
      answer,
      distractors: [shareA / 100, rateA / (rateA + rateB), pA, 1 - answer],
      explanation:
        `Faulty from A: ${shareA}% × ${rateA}% = ${(pA * 100).toFixed(2)}% of all items. Faulty from B: ` +
        `${100 - shareA}% × ${rateB}% = ${(pB * 100).toFixed(2)}%. Given the item is faulty, P(A) = ` +
        `${(pA * 100).toFixed(2)} ÷ (${(pA * 100).toFixed(2)} + ${(pB * 100).toFixed(2)}) = ${pct1(answer)}. ` +
        `(${shareA}% ignores that B's items are more often faulty; ${pct1(pA)} is the chance an item is BOTH ` +
        `from A and faulty, before knowing it was returned.)`,
    };
  },
  // Random seating: two specific people end up next to each other.
  () => {
    const n = randInt(5, 10);
    const answer = 2 / n;
    return {
      prompt:
        `${n} candidates are seated at random in a row of ${n} chairs for an assessment-centre group exercise. ` +
        `What is the probability that two particular candidates, Ana and Ben, end up sitting next to each other?`,
      answer,
      distractors: [1 / n, 1 / (n - 1), 2 / (n - 1), 1 / combinations(n, 2)],
      explanation:
        `Arrangements with them together: treat them as one block, (${n} − 1)! × 2. All arrangements: ${n}!. ` +
        `P = 2 × (${n - 1})! ÷ ${n}! = 2/${n} = ${pct1(answer)}. (Equivalently, ${n - 1} adjacent pairs of chairs ` +
        `out of ${n}C2 = ${combinations(n, 2)} pairs.)`,
    };
  },
];

function genProbability() {
  const s = choice(PROBABILITY_SCENARIOS)();
  return buildQuestion("Probability", s.prompt, s.answer, s.distractors, pct1, s.explanation);
}

/* Permutations, both as a straight count ("how many ways can 7 people fill
   5 chairs?") and as the denominator of a probability, where the order of
   seats or digits is what makes the sample space a permutation. */

const oneIn = (p) => `1 in ${Math.round(1 / p).toLocaleString()}`;
const pct2 = (p) => `${(p * 100).toFixed(2)}%`;
const productOf = (n, k) => Array.from({ length: k }, (_, i) => n - i).join(" × ");

// Settings for the "k ordered slots, n > k candidates" scenarios, so the same
// maths turns up as chairs, race places, loading bays and so on.
const PERMUTATION_SETTINGS = [
  {
    intro: (n, k) => `A panel has ${k} chairs in a row on stage and ${n} candidates hoping to sit on it; the ${n - k} left over stand at the back.`,
    orderNote: "swapping two seated candidates counts as a different seating",
    outcomes: "seatings", assignment: "seating", slots: "chairs", who: "candidates",
    a: "Ana", b: "Ben", first: "takes the left-most chair", second: "takes the second chair from the left", both: "get a chair",
  },
  {
    intro: (n, k) => `${n} runners enter a race, and only the top ${k} finishing positions are recorded (there are no ties).`,
    orderNote: "the same runners finishing in a different order is a different result",
    outcomes: (k) => `top-${k} results`, assignment: "finishing order", slots: "places", who: "runners",
    a: "Amara", b: "Jonas", first: "finishes 1st", second: "finishes 2nd", both: (k) => `finish in the top ${k}`,
  },
  {
    intro: (n, k) => `${n} delivery vans arrive at a depot with ${k} numbered loading bays; the ${n - k} that don't get a bay wait outside.`,
    orderNote: "which van is in which bay matters",
    outcomes: "bay allocations", assignment: "allocation", slots: "bays", who: "vans",
    a: "Van A", b: "Van B", first: "gets bay 1", second: "gets bay 2", both: "get a bay",
  },
  {
    intro: (n, k) => `A firm has ${k} back-to-back interview slots on Monday and ${n} shortlisted candidates, so ${n - k} will be seen later in the week.`,
    orderNote: "who is seen in which slot matters",
    outcomes: "Monday schedules", assignment: "schedule", slots: "slots", who: "candidates",
    a: "Priya", b: "Tom", first: "gets the first slot", second: "gets the second slot", both: "are interviewed on Monday",
  },
  {
    intro: (n, k) => `A shop window has ${k} display positions from left to right, and the manager has ${n} different products to choose from.`,
    orderNote: "the same products in a different arrangement is a different display",
    outcomes: "window displays", assignment: "display", slots: "positions", who: "products",
    a: "the new watch", b: "the leather bag", first: "is in position 1", second: "is in position 2", both: "are in the window",
  },
  {
    intro: (n, k) => `${n} team members volunteer for ${k} speaking slots at a conference, and the talks run in a fixed order.`,
    orderNote: "the order of the speakers matters",
    outcomes: "speaker line-ups", assignment: "line-up", slots: "slots", who: "volunteers",
    a: "Mia", b: "Leo", first: "speaks first", second: "speaks second", both: "get to speak",
  },
];

// Settings use either fixed text or a function of the slot count.
const settingText = (value, k) => (typeof value === "function" ? value(k) : value);

const PERMUTATION_SCENARIOS = [
  // Straight count: n candidates into k ordered slots (always fewer slots than candidates).
  () => {
    const set = choice(PERMUTATION_SETTINGS);
    const k = randInt(3, 6);
    const n = k + randInt(2, 5);
    const answer = permutations(n, k);
    return {
      prompt: `${set.intro(n, k)} Order matters — ${set.orderNote}. How many different ${settingText(set.outcomes, k)} are possible?`,
      answer,
      format: (v) => Math.round(v).toLocaleString(),
      distractors: [combinations(n, k), Math.pow(n, k), factorial(k), permutations(n, k - 1)],
      explanation:
        `Fill the ${set.slots} one at a time: ${n} choices for the first, ${n - 1} for the second, and so on for ${k} ` +
        `${set.slots} — ${n}P${k} = ${n}! ÷ (${n} − ${k})! = ${productOf(n, k)} = ${answer.toLocaleString()}. (${n}C${k} = ` +
        `${combinations(n, k).toLocaleString()} only counts WHICH ${set.who} are chosen, not their order; ${n}^${k} ` +
        `would let the same one fill several ${set.slots}.)`,
    };
  },
  // Two named candidates in the first two slots.
  () => {
    const set = choice(PERMUTATION_SETTINGS);
    const k = randInt(3, 6);
    const n = k + randInt(2, 4);
    const answer = permutations(n - 2, k - 2) / permutations(n, k);
    return {
      prompt:
        `${set.intro(n, k)} Every possible ${set.assignment} is equally likely. What is the probability that ` +
        `${set.a} ${set.first} and ${set.b} ${set.second}?`,
      answer,
      format: oneIn,
      distractors: [1 / permutations(n, k), 2 / (n * (n - 1)), 1 / (n * n), 1 / combinations(n, 2)],
      explanation:
        `Total ${set.assignment}s: ${n}P${k} = ${permutations(n, k).toLocaleString()}. With ${set.a} and ${set.b} fixed in ` +
        `the first two ${set.slots}, the remaining ${k - 2} ${k - 2 === 1 ? "is" : "are"} filled from the other ${n - 2}: ${n - 2}P${k - 2} = ` +
        `${permutations(n - 2, k - 2).toLocaleString()}. P = ${permutations(n - 2, k - 2).toLocaleString()} ÷ ` +
        `${permutations(n, k).toLocaleString()} = 1/(${n} × ${n - 1}) = ${oneIn(answer)}. (Allowing either order would ` +
        `double it; 1/${n}P${k} is the chance of one exact full ${set.assignment}.)`,
    };
  },
  // Both named candidates get one of the slots.
  () => {
    const set = choice(PERMUTATION_SETTINGS);
    const k = randInt(3, 6);
    const n = k + randInt(2, 5);
    const answer = (k * (k - 1)) / (n * (n - 1));
    return {
      prompt:
        `${set.intro(n, k)} Every possible ${set.assignment} is equally likely. What is the probability that both ` +
        `${set.a} and ${set.b} ${settingText(set.both, k)}?`,
      answer,
      format: pct1,
      distractors: [Math.pow(k / n, 2), k / n, (k * (k - 1)) / (n * n), 2 / n],
      explanation:
        `${set.assignment[0].toUpperCase() + set.assignment.slice(1)}s including both: place the two of them in order ` +
        `(${k} × ${k - 1} ways), then fill the other ${k - 2} ${set.slots} from the remaining ${n - 2}: ${k} × ${k - 1} × ` +
        `${n - 2}P${k - 2}. Dividing by ${n}P${k} leaves (${k} × ${k - 1}) ÷ (${n} × ${n - 1}) = ${pct1(answer)}. ` +
        `(Squaring ${k}/${n} treats the two as independent, but once one is in there are fewer ${set.slots} left for ` +
        `the other.)`,
    };
  },
  // Only one of the k! orders of a chosen group is "in order".
  () => {
    const k = randInt(4, 6);
    const n = k + randInt(2, 5);
    const answer = 1 / factorial(k);
    return {
      prompt:
        `From a team of ${n} (all different heights), ${k} are picked at random and seated in a row of ${k} ` +
        `chairs in a random order. What is the probability that the ${k} seated people end up in increasing ` +
        `order of height from left to right?`,
      answer,
      format: oneIn,
      distractors: [1 / permutations(n, k), 1 / combinations(n, k), 2 / factorial(k), 1 / k],
      explanation:
        `Whoever the ${k} people are, they can sit in ${k}! = ${factorial(k)} equally likely orders, and exactly one ` +
        `of them runs shortest to tallest — so P = 1/${k}! = ${oneIn(answer)}. Which ${k} are picked doesn't matter. ` +
        `(Equivalently: ${n}C${k} ordered-by-height seatings out of ${n}P${k} total.)`,
    };
  },
  // Guessing a code of distinct digits.
  () => {
    const k = randInt(3, 4);
    const tries = randInt(2, 9) * 10;
    const total = permutations(10, k);
    const answer = tries / total;
    return {
      prompt:
        `An office safe uses a ${k}-digit code made of ${k} DIFFERENT digits (0–9, no repeats), and the order ` +
        `of the digits matters. Someone tries ${tries} different codes at random. What is the probability they ` +
        `open the safe?`,
      answer,
      format: pct2,
      distractors: [tries / Math.pow(10, k), tries / combinations(10, k), 1 / total, tries / permutations(10, k - 1)],
      explanation:
        `Possible codes: 10P${k} = ${productOf(10, k)} = ${total.toLocaleString()} (not 10^${k} = ` +
        `${Math.pow(10, k).toLocaleString()}, since digits can't repeat; not 10C${k}, since order matters). ` +
        `${tries} distinct guesses cover ${tries} of them: ${tries} ÷ ${total.toLocaleString()} = ${pct2(answer)}.`,
    };
  },
];

function genPermutations() {
  const s = choice(PERMUTATION_SCENARIOS)();
  return buildQuestion("Permutations & probability", s.prompt, s.answer, s.distractors, s.format, s.explanation);
}

/* ---------- question generators (close reading) ---------- */
/* These require catching a detail in the wording — a negation, a direction
   of adjustment, a unit mismatch, or an irrelevant distraction — not just
   running the obvious calculation. */

function genMarkupVsMargin() {
  const cost = randInt(20, 80) * 5;
  const targetMarginPct = choice([20, 25, 30, 35, 40, 45]);
  const requiredMarkupPct = round1((targetMarginPct / (100 - targetMarginPct)) * 100);
  const stickerPrice = round2(cost * (1 + requiredMarkupPct / 100));
  const clearanceDiscountPct = choice([10, 15, 20, 25]);
  const finalPrice = round2(stickerPrice * (1 - clearanceDiscountPct / 100));

  const prompt =
    `A retailer buys a product for $${cost} and wants to achieve a gross margin of ${targetMarginPct}% of ` +
    `the selling price (remember: margin is a percentage of the selling price, markup is a percentage of ` +
    `cost — they are not the same number). It prices the product by applying the markup on cost that ` +
    `achieves that margin, then later puts it on clearance at ${clearanceDiscountPct}% off that marked-up ` +
    `price. What is the final clearance price, to the nearest cent?`;

  const skippedMarkupConversion = round2(cost * (1 + targetMarginPct / 100) * (1 - clearanceDiscountPct / 100)); // used the margin % as if it were the markup %
  const discountOffCostNotPrice = round2(stickerPrice - cost * (clearanceDiscountPct / 100)); // took the discount off cost instead of off the sticker price
  const forgotDiscount = stickerPrice; // never applied the clearance step at all
  const distractors = [skippedMarkupConversion, discountOffCostNotPrice, forgotDiscount, round2(finalPrice + 2)];

  return buildQuestion(
    "Reading carefully: margin vs. markup",
    prompt,
    finalPrice,
    distractors,
    (v) => `$${v.toFixed(2)}`,
    `Margin and markup relate by markup = margin ÷ (1 − margin): markup = ${targetMarginPct}% ÷ ` +
      `(100% − ${targetMarginPct}%) × 100 = ${requiredMarkupPct.toFixed(1)}%. Marked-up price = $${cost} × ` +
      `(1 + ${requiredMarkupPct.toFixed(1)}/100) = $${stickerPrice.toFixed(2)}. Clearance price = ` +
      `$${stickerPrice.toFixed(2)} × (1 − ${clearanceDiscountPct}/100) = $${finalPrice.toFixed(2)}. Using the ` +
      `${targetMarginPct}% margin figure directly as the markup (instead of converting it first) gives the ` +
      `wrong sticker price before the discount is even applied.`
  );
}

function genReverseGrowth() {
  const threeYearsAgo = randInt(40, 300) * 10;
  const pctOptions = [5, 8, 10, 12, 15, 20];
  const growthPct1 = choice(pctOptions);
  const growthPct2 = choice(pctOptions);
  const growthPct3 = choice(pctOptions);
  const dir2 = choice([1, 1, -1]); // occasionally a decline partway through, so the direction can't be assumed
  const twoYearsAgo = Math.round(threeYearsAgo * (1 + growthPct1 / 100));
  const oneYearAgo = Math.round(twoYearsAgo * (1 + (dir2 * growthPct2) / 100));
  const currentYear = Math.round(oneYearAgo * (1 + growthPct3 / 100));
  const verb2 = dir2 === 1 ? "grew" : "fell";

  const prompt =
    `A division's revenue grew by ${growthPct1}% three years ago, then ${verb2} by ${growthPct2}% the ` +
    `following year, then grew by ${growthPct3}% this past year, reaching $${currentYear.toLocaleString()}k ` +
    `today. What was the division's revenue three years ago, to the nearest $1,000?`;

  const distractors = [
    Math.round(currentYear / (1 + (growthPct1 + dir2 * growthPct2 + growthPct3) / 100)), // adds the percentages instead of compounding them
    twoYearsAgo, // stopped one reversal step early
    oneYearAgo, // stopped two reversal steps early
    Math.round(threeYearsAgo * (1 + growthPct1 / 100)), // reversed the first step in the wrong direction
  ];

  return buildQuestion(
    "Reading carefully: working backward",
    prompt,
    threeYearsAgo,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}k`,
    `Working backward: one year ago = $${currentYear.toLocaleString()}k ÷ (1 + ${growthPct3}/100) = ` +
      `$${oneYearAgo.toLocaleString()}k. Two years ago = $${oneYearAgo.toLocaleString()}k ÷ ` +
      `(1 + ${dir2 * growthPct2}/100) = $${twoYearsAgo.toLocaleString()}k. Three years ago = ` +
      `$${twoYearsAgo.toLocaleString()}k ÷ (1 + ${growthPct1}/100) = $${threeYearsAgo.toLocaleString()}k. ` +
      `Stopping early, or adding the percentages instead of undoing each year's compounding separately, ` +
      `both give the wrong answer${dir2 === -1 ? " — and the middle year was a decline, not growth, so it " +
      "reverses the other way" : ""}.`
  );
}

function genSecondHighestWithDistraction() {
  const regions = ["Northeast", "Southeast", "Midwest", "Southwest", "West"];
  const shuffledRegions = shuffleInPlace([...regions]);
  let q1Revenues;
  do {
    q1Revenues = shuffledRegions.map(() => randInt(30, 150) * 10);
  } while (new Set(q1Revenues).size !== q1Revenues.length);

  const growthOptions = [-10, -5, 5, 8, 10, 15, 20, 25];
  let growthRates;
  do {
    growthRates = shuffledRegions.map(() => choice(growthOptions));
  } while (new Set(growthRates).size !== growthRates.length);

  const q2Revenues = q1Revenues.map((r, i) => Math.round(r * (1 + growthRates[i] / 100)));

  const sortedIdx = q2Revenues.map((_, i) => i).sort((a, b) => q2Revenues[b] - q2Revenues[a]);
  if (q2Revenues[sortedIdx[0]] === q2Revenues[sortedIdx[1]]) return genSecondHighestWithDistraction(); // avoid an ambiguous tie for first place

  const highestIdx = sortedIdx[0];
  const secondIdx = sortedIdx[1];
  const gap = q2Revenues[highestIdx] - q2Revenues[secondIdx];
  const headcount = randInt(200, 900);
  const foundedYear = randInt(1998, 2019);

  const q1RankedIdx = q1Revenues.map((_, i) => i).sort((a, b) => q1Revenues[b] - q1Revenues[a]);

  const prompt =
    `A retailer's five regions reported the following Q1 revenue, alongside each region's revenue growth ` +
    `rate from Q1 to Q2: ` +
    `${shuffledRegions.map((r, i) => `${r} $${q1Revenues[i].toLocaleString()}k (${growthRates[i] >= 0 ? "+" : ""}${growthRates[i]}%)`).join(", ")}. ` +
    `The company, founded in ${foundedYear}, now employs around ${headcount} people across all regions. ` +
    `What is the gap in Q2 revenue between the highest-performing and second-highest-performing region?`;

  const distractors = [
    q1Revenues[q1RankedIdx[0]] - q1Revenues[q1RankedIdx[1]], // ranked (and measured) by Q1 revenue instead of Q2
    Math.abs(q2Revenues[q1RankedIdx[0]] - q2Revenues[q1RankedIdx[1]]), // ranked by Q1, but measured in Q2 dollars
    gap + 10,
    Math.max(gap - 10, 1),
  ];

  return buildQuestion(
    "Reading carefully: ranking",
    prompt,
    gap,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}k`,
    `Q2 revenue = Q1 × (1 + growth rate): ` +
      `${shuffledRegions.map((r, i) => `${r} $${q2Revenues[i].toLocaleString()}k`).join(", ")}. Ranked highest ` +
      `to lowest by Q2: ${sortedIdx.map((i) => `${shuffledRegions[i]} ($${q2Revenues[i].toLocaleString()}k)`).join(", ")}. ` +
      `The headcount and founding year aren't relevant, and ranking by Q1 instead of Q2 picks the wrong ` +
      `regions. Gap = $${q2Revenues[highestIdx].toLocaleString()}k − $${q2Revenues[secondIdx].toLocaleString()}k ` +
      `= $${gap.toLocaleString()}k.`
  );
}

function genUnitConversionTrap() {
  const fullTimeDailyCost = randInt(150, 400) * 10;
  const contractorDailyCost = randInt(80, 250) * 10;
  const weeksPerYear = choice([48, 50, 52]);
  const fullTimeDaysPerWeek = 5;
  const contractorDaysPerWeek = 3;

  const fullTimeAnnual = fullTimeDailyCost * fullTimeDaysPerWeek * weeksPerYear;
  const contractorAnnual = contractorDailyCost * contractorDaysPerWeek * weeksPerYear;
  const annualCost = fullTimeAnnual + contractorAnnual;

  const prompt =
    `A regional office pays its full-time staff $${fullTimeDailyCost.toLocaleString()} per business day in ` +
    `total, and its contractors $${contractorDailyCost.toLocaleString()} per day in total — but contractors ` +
    `only work ${contractorDaysPerWeek} days a week, not the full working week. Full-time staff work ` +
    `${fullTimeDaysPerWeek} days a week. The office operates for ${weeksPerYear} weeks a year (it's closed ` +
    `the rest of the year, for both groups). What is the office's total annual staffing cost?`;

  const treatedAllAsFullTime = (fullTimeDailyCost + contractorDailyCost) * fullTimeDaysPerWeek * weeksPerYear; // applied the 5-day week to contractors too
  const treatedAllAsContractor = (fullTimeDailyCost + contractorDailyCost) * contractorDaysPerWeek * weeksPerYear; // applied the 3-day week to full-time staff too
  const used52Weeks =
    fullTimeDailyCost * fullTimeDaysPerWeek * 52 + contractorDailyCost * contractorDaysPerWeek * 52; // ignored the office's actual operating weeks
  const forgotContractors = fullTimeAnnual; // left the contractors out entirely
  const distractors = [treatedAllAsFullTime, treatedAllAsContractor, used52Weeks, forgotContractors];

  return buildQuestion(
    "Reading carefully: units",
    prompt,
    annualCost,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}`,
    `Full-time cost per year = $${fullTimeDailyCost.toLocaleString()} × ${fullTimeDaysPerWeek} days × ` +
      `${weeksPerYear} weeks = $${fullTimeAnnual.toLocaleString()}. Contractor cost per year = ` +
      `$${contractorDailyCost.toLocaleString()} × ${contractorDaysPerWeek} days × ${weeksPerYear} weeks = ` +
      `$${contractorAnnual.toLocaleString()}. Total = $${annualCost.toLocaleString()}. Applying one group's ` +
      `schedule to the other, using 52 weeks instead of the office's ${weeksPerYear}, or dropping the ` +
      `contractors altogether all give the wrong total.`
  );
}

function genThresholdCommission() {
  const baseSalary = randInt(20, 60) * 100;
  const threshold = randInt(50, 150) * 100;
  const totalSales = threshold + randInt(20, 200) * 100;
  const commissionPct = choice([5, 8, 10, 12, 15]);
  const excessSales = totalSales - threshold;
  const commission = Math.round((excessSales * commissionPct) / 100);
  const totalPay = baseSalary + commission;

  const prompt =
    `A sales rep earns a monthly base salary of $${baseSalary.toLocaleString()}, plus a ${commissionPct}% ` +
    `commission — but only on sales above a $${threshold.toLocaleString()} monthly threshold (there is no ` +
    `commission on the first $${threshold.toLocaleString()} of sales). This month the rep sold ` +
    `$${totalSales.toLocaleString()}. What is the rep's total pay for the month?`;

  const commissionOnAllSales = baseSalary + Math.round((totalSales * commissionPct) / 100); // applied the rate to every dollar of sales, not just the excess
  const commissionOnThresholdOnly = baseSalary + Math.round((threshold * commissionPct) / 100); // commissioned the threshold amount instead of the excess over it
  const forgotBaseSalary = commission; // left out the base salary entirely
  const distractors = [commissionOnAllSales, commissionOnThresholdOnly, forgotBaseSalary, totalPay + 50];

  return buildQuestion(
    "Reading carefully: threshold-based pay",
    prompt,
    totalPay,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}`,
    `Commission only applies to the $${excessSales.toLocaleString()} of sales above the ` +
      `$${threshold.toLocaleString()} threshold: $${excessSales.toLocaleString()} × ${commissionPct}% = ` +
      `$${commission.toLocaleString()}. Total pay = $${baseSalary.toLocaleString()} base + ` +
      `$${commission.toLocaleString()} commission = $${totalPay.toLocaleString()}. Applying the commission ` +
      `rate to the full sales figure, or to the threshold itself, both misstate the true commission.`
  );
}

const STANDARD_GENERATORS = [
  genWeightedAverage,
  genOppositeSpeed,
  genSimultaneous,
  genPercentSuccessive,
  genRatio,
  genWorkRate,
  genCompoundGrowth,
  genGrowthForecast,
  genMixture,
  genCatchUp,
  genGrossMargin,
  genBreakeven,
  genContributionMarginRatio,
  genPaybackPeriod,
  genTournamentBracket,
  genMarketShareDoubling,
  genContainerPacking,
  genShippingCost,
  genCounting,
  genProbability,
  genPermutations,
];

const CLOSE_READING_GENERATORS = [
  genMarkupVsMargin,
  genReverseGrowth,
  genSecondHighestWithDistraction,
  genUnitConversionTrap,
  genThresholdCommission,
];

/* ---------- question generators (logic games) ---------- */
/* A classic LSAT-style Logic Game: a scheduling or grouping constraint-
   satisfaction puzzle. Six people are assigned to three groups (two per
   group) under a handful of stated rules; the question asks which one of
   four candidate assignments is consistent with every rule. This is the
   same structure computer science calls a constraint satisfaction problem
   (CSP) and operations research calls a staff-scheduling problem — here
   solved by brute-force verification against each rule rather than a
   general-purpose solver, since there are only 90 possible groupings. */

const LOGIC_GAME_PEOPLE_POOL = ["Amir", "Bella", "Carlos", "Dana", "Elin", "Farah", "Gus", "Hana"];

function logicGameIndexOf(groups) {
  return (person) => groups.findIndex((g) => g.includes(person));
}

function logicGameFormat(groupShortLabels, groups) {
  return groupShortLabels.map((label, i) => `${label}: ${[...groups[i]].sort().join(", ")}`).join(" | ");
}

function logicGameKey(groups) {
  return groups.map((g) => [...g].sort().join(",")).join("|");
}

// "Exactly one of X and Y is in group K" — forces looking up both people's
// actual groups and comparing each to a third, named group, rather than just
// comparing the two people to each other.
function buildExactlyOneInGroupConstraint(actualGroups, x, y) {
  const idxOf = logicGameIndexOf(actualGroups);
  const ix = idxOf(x);
  const iy = idxOf(y);
  if (ix === iy) return null; // "exactly one" can never hold if they're already in the same group
  const k = choice([ix, iy]);
  return {
    check: (gi) => (gi(x) === k) !== (gi(y) === k),
    describe: (labels) => `Exactly one of ${x} and ${y} is assigned to ${labels.names[k]}.`,
  };
}

// "At most one of X, Y, Z is in group K" — a counting rule over three people
// and one named group, rather than a same/different comparison between two.
function buildAtMostOneInGroupConstraint(actualGroups, trio) {
  const idxOf = logicGameIndexOf(actualGroups);
  for (const k of shuffleInPlace([0, 1, 2])) {
    const count = trio.filter((p) => idxOf(p) === k).length;
    // Always satisfiable for some k: three people spread over three groups
    // can't have two-or-more in every single group at once.
    if (count <= 1) {
      return {
        check: (gi) => trio.filter((p) => gi(p) === k).length <= 1,
        describe: (labels) => `At most one of ${trio.join(", ")} is assigned to ${labels.names[k]}.`,
      };
    }
  }
  return null;
}

function buildLogicGameConstraints(people, groups, ordered) {
  const idxOf = logicGameIndexOf(groups);
  const pairs = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) pairs.push([people[i], people[j]]);
  }
  shuffleInPlace(pairs);

  const used = new Set();
  const pickPair = () => {
    for (const [x, y] of pairs) {
      const key = `${x}|${y}`;
      if (!used.has(key)) {
        used.add(key);
        return [x, y];
      }
    }
    return pairs[randInt(0, pairs.length - 1)];
  };

  const constraints = [];

  let exactlyOne = null;
  for (let tries = 0; tries < 20 && !exactlyOne; tries++) {
    const [x, y] = pickPair();
    exactlyOne = buildExactlyOneInGroupConstraint(groups, x, y);
  }
  if (!exactlyOne) exactlyOne = buildExactlyOneInGroupConstraint(groups, groups[0][0], groups[1][0]);
  constraints.push(exactlyOne);

  const trio = shuffleInPlace([...people]).slice(0, 3);
  constraints.push(buildAtMostOneInGroupConstraint(groups, trio));

  const [p3x, p3y] = pickPair();
  const [early, late] = idxOf(p3x) < idxOf(p3y) ? [p3x, p3y] : [p3y, p3x];
  constraints.push({
    check: (gi) => gi(early) < gi(late),
    describe: (labels) =>
      ordered
        ? `${early} is scheduled in an earlier ${labels.noun} than ${late}.`
        : `${early} is on a lower-numbered ${labels.noun} than ${late}.`,
  });

  const [p4x, p4y] = pickPair();
  const gx = idxOf(p4x);
  const gy = idxOf(p4y);
  constraints.push({
    check: (gi) => (gi(p4x) === gx ? gi(p4y) === gy : true),
    describe: (labels) => `If ${p4x} is in ${labels.names[gx]}, then ${p4y} is in ${labels.names[gy]}.`,
  });

  return constraints;
}

// A quantitative constraint that compares a numeric attribute (summed per
// group) between two groups, rather than just people's positions — so a
// candidate option can't be checked off by eyeballing one rule at a time;
// the actual totals have to be worked out first.
function buildQuantitativeConstraint(people, groups, attrOf) {
  const idxOf = logicGameIndexOf(groups);
  const sumsFor = (gi) => {
    const sums = [0, 0, 0];
    people.forEach((p) => {
      sums[gi(p)] += attrOf[p];
    });
    return sums;
  };
  const actualSums = sumsFor(idxOf);

  const pairs = shuffleInPlace([
    [0, 1],
    [0, 2],
    [1, 2],
  ]);
  for (const [a, b] of pairs) {
    if (actualSums[a] === actualSums[b]) continue;
    const [greater, lesser] = actualSums[a] > actualSums[b] ? [a, b] : [b, a];
    return {
      check: (gi) => {
        const sums = sumsFor(gi);
        return sums[greater] > sums[lesser];
      },
      describe: (labels) =>
        `The combined years of experience of everyone in ${labels.names[greater]} is greater than the ` +
        `combined years of experience of everyone in ${labels.names[lesser]}.`,
    };
  }
  return null; // all three group sums tied — caller should reroll the attribute values
}

function genLogicGame() {
  const templates = [
    {
      ordered: true,
      personNoun: "employees",
      groupNoun: "shift",
      groupLabels: ["the Morning shift", "the Afternoon shift", "the Evening shift"],
      groupShortLabels: ["Morning", "Afternoon", "Evening"],
      intro: (peopleLabels) =>
        `Six employees — ${peopleLabels.join(", ")} — must each be assigned to one of three shifts: ` +
        `Morning, Afternoon, or Evening. Exactly two employees are assigned to each shift. (Each ` +
        `employee's years of experience is shown in parentheses.)`,
    },
    {
      ordered: false,
      personNoun: "consultants",
      groupNoun: "team",
      groupLabels: ["Team 1", "Team 2", "Team 3"],
      groupShortLabels: ["Team 1", "Team 2", "Team 3"],
      intro: (peopleLabels) =>
        `Six consultants — ${peopleLabels.join(", ")} — must each be assigned to one of three project ` +
        `teams: Team 1, Team 2, or Team 3. Exactly two consultants are assigned to each team. (Each ` +
        `consultant's years of experience is shown in parentheses.)`,
    },
  ];
  const template = choice(templates);

  const people = shuffleInPlace([...LOGIC_GAME_PEOPLE_POOL]).slice(0, 6);
  const shuffled = shuffleInPlace([...people]);
  const groups = [shuffled.slice(0, 2), shuffled.slice(2, 4), shuffled.slice(4, 6)];
  const idxOf = logicGameIndexOf(groups);

  const constraints = buildLogicGameConstraints(people, groups, template.ordered);

  const attrOf = {};
  people.forEach((p) => {
    attrOf[p] = randInt(1, 15);
  });
  const quantConstraint = buildQuantitativeConstraint(people, groups, attrOf);
  if (!quantConstraint) return genLogicGame(); // all group totals tied — reroll
  constraints.push(quantConstraint);

  const labels = { noun: template.groupNoun, names: template.groupLabels };
  const satisfiesAll = (gi) => constraints.every((c) => c.check(gi));

  if (!satisfiesAll(idxOf)) return genLogicGame(); // shouldn't happen, but regenerate defensively

  const correctString = logicGameFormat(template.groupShortLabels, groups);
  const seenKeys = new Set([logicGameKey(groups)]);
  let distractorCandidates = []; // { groups, failVector } — failVector[i] = true if this candidate breaks rule i

  // No single rule should be enough, on its own, to rule out every wrong
  // answer: that would let someone eliminate options by checking just one
  // rule. So reject any trio of distractors that all happen to break the
  // same rule, and keep searching (with limited backtracking) until none do.
  const sharesCommonFailedRule = (trio) =>
    constraints.some((_, i) => trio.every((d) => d.failVector[i]));

  let attempts = 0;
  let stuckAttempts = 0;
  while (distractorCandidates.length < 3 && attempts < 600) {
    attempts++;
    const candidate = groups.map((g) => [...g]);
    const swaps = choice([1, 1, 2]);
    for (let s = 0; s < swaps; s++) {
      const gA = randInt(0, 2);
      let gB = randInt(0, 2);
      while (gB === gA) gB = randInt(0, 2);
      const pA = randInt(0, candidate[gA].length - 1);
      const pB = randInt(0, candidate[gB].length - 1);
      const tmp = candidate[gA][pA];
      candidate[gA][pA] = candidate[gB][pB];
      candidate[gB][pB] = tmp;
    }
    const key = logicGameKey(candidate);
    if (seenKeys.has(key)) continue;
    const candidateIdx = logicGameIndexOf(candidate);
    if (satisfiesAll(candidateIdx)) continue; // would be a second correct answer
    const failVector = constraints.map((c) => !c.check(candidateIdx));
    const trial = [...distractorCandidates, { groups: candidate, failVector }];
    if (trial.length === 3 && sharesCommonFailedRule(trial)) {
      stuckAttempts++;
      if (stuckAttempts > 150 && distractorCandidates.length > 0) {
        distractorCandidates.pop(); // backtrack: our last pick is blocking every remaining option
        stuckAttempts = 0;
      }
      continue;
    }
    seenKeys.add(key);
    distractorCandidates.push({ groups: candidate, failVector });
    stuckAttempts = 0;
  }
  if (distractorCandidates.length < 3) return genLogicGame(); // couldn't find enough distinct wrong options

  const distractorStrings = distractorCandidates.map((d) => logicGameFormat(template.groupShortLabels, d.groups));

  const peopleLabels = people.map((p) => `${p} (${attrOf[p]} yrs)`);

  const prompt =
    `${template.intro(peopleLabels)}\n\n` +
    `Rules:\n` +
    constraints.map((c, i) => `${i + 1}. ${c.describe(labels)}`).join("\n") +
    `\n\nWhich one of the following could be an accurate assignment of ${template.personNoun} to ` +
    `${template.groupNoun}s?`;

  const explanation =
    `${correctString} satisfies every rule above. Check each option against all ${constraints.length} rules ` +
    `in turn — every incorrect option breaks at least one of them.`;

  return buildQuestion(
    `Logic game: ${template.ordered ? "scheduling" : "grouping"}`,
    prompt,
    correctString,
    distractorStrings,
    (v) => v,
    explanation
  );
}

const LOGIC_GAME_GENERATORS = [genLogicGame];

function buildQuestionSet() {
  // TOTAL_QUESTIONS/CLOSE_READING_COUNT/LOGIC_GAME_COUNT are sized to match
  // every generator currently defined, so each playthrough includes one of
  // every question type in circulation (shuffled into a different order and
  // with freshly randomised numbers each time).
  const logicGamePicks = sampleGenerators(LOGIC_GAME_GENERATORS, Math.min(LOGIC_GAME_COUNT, LOGIC_GAME_GENERATORS.length));
  const closeReadingPicks = sampleGenerators(CLOSE_READING_GENERATORS, Math.min(CLOSE_READING_COUNT, CLOSE_READING_GENERATORS.length));
  const standardCount = TOTAL_QUESTIONS - logicGamePicks.length - closeReadingPicks.length;
  const standardPicks = sampleGenerators(STANDARD_GENERATORS, Math.min(standardCount, STANDARD_GENERATORS.length));
  const questions = [...logicGamePicks, ...closeReadingPicks, ...standardPicks].map((gen) => Object.assign(gen(), { typeId: gen.name }));
  return shuffleInPlace(questions);
}

/* ---------- shared question bank ---------- */
/* Quick Quiz draws from this, tagging each question with its generator's
   name so per-type stats (stats.js) line up across quizzes. */

window.NumericalReasoningBank = {
  id: "numerical",
  targetSecondsPerQuestion: 60,
  generators: [...LOGIC_GAME_GENERATORS, ...CLOSE_READING_GENERATORS, ...STANDARD_GENERATORS],
};

// On the Quick Quiz page only the bank is needed, not this quiz's own UI.
if (document.body.hasAttribute("data-question-bank-only")) return;

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
  questionShownAt: null, // when the current question appeared, for per-type timing stats
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
  state.questionShownAt = Date.now();

  el.questionCounter.textContent = `Question ${state.index + 1} of ${TOTAL_QUESTIONS}`;
  el.progressFill.style.width = `${((state.index + 1) / TOTAL_QUESTIONS) * 100}%`;
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
  window.QuestionStats.record("numerical", q, state.answers[state.index].correct, (Date.now() - state.questionShownAt) / 1000);

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
  if (timedOut && !state.confirmed) {
    // The question on screen when time ran out counts as missed.
    window.QuestionStats.record("numerical", state.questions[state.index], false, (Date.now() - state.questionShownAt) / 1000);
  }

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

  if (score >= TOTAL_QUESTIONS * 0.8) {
    el.resultsHeadline.textContent = "Strong result";
  } else if (score >= TOTAL_QUESTIONS * 0.5) {
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

  // gridlines + y-axis labels, spaced to fit however many questions there are
  progressChartTicks(TOTAL_QUESTIONS).forEach((tick) => {
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
})();
