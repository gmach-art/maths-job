"use strict";

const TARGET_SECONDS = 11 * 60; // recommended completion time
const TOTAL_QUESTIONS = 10;
const CLOSE_READING_COUNT = 4;
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
  // One LSAT-style logic game every attempt, a handful of close-reading
  // questions (details that are easy to miss), and a random spread of
  // standard case-math and word problems to fill out the rest — so every
  // playthrough is different.
  const logicGamePicks = sampleGenerators(LOGIC_GAME_GENERATORS, Math.min(LOGIC_GAME_COUNT, LOGIC_GAME_GENERATORS.length));
  const closeReadingPicks = sampleGenerators(CLOSE_READING_GENERATORS, Math.min(CLOSE_READING_COUNT, CLOSE_READING_GENERATORS.length));
  const standardCount = TOTAL_QUESTIONS - logicGamePicks.length - closeReadingPicks.length;
  const standardPicks = sampleGenerators(STANDARD_GENERATORS, Math.min(standardCount, STANDARD_GENERATORS.length));
  const questions = [...logicGamePicks, ...closeReadingPicks, ...standardPicks].map((gen) => gen());
  return shuffleInPlace(questions);
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
