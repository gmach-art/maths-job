"use strict";

const TARGET_SECONDS = 11 * 60; // recommended completion time
const TOTAL_QUESTIONS = 10;
const CLOSE_READING_COUNT = 4;
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

function genAlgebra() {
  const a = randInt(3, 9);
  const p = randInt(4, 15);
  const x = randInt(6, 48);
  const b = randInt(5, 120);
  const c = a * (x + p) - b;

  const prompt =
    `A recruiter poses a brain-teaser: "Think of a number, add ${p}, multiply the result by ${a}, ` +
    `then subtract ${b}. The result is ${c}." What number was the candidate thinking of?`;

  const distractors = [x + p, Math.round((c + b - p) / a), Math.round(c / a), Math.max(x - p, 0)];

  return buildQuestion(
    "Algebra",
    prompt,
    x,
    distractors,
    (v) => String(Math.round(v)),
    `${a} × (x + ${p}) − ${b} = ${c}, so x + ${p} = (${c} + ${b}) ÷ ${a} = ${x + p}, and x = ${x + p} − ${p} = ${x}.`
  );
}

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
  const distance = randInt(180, 420);
  const closing = speed1 + speed2;
  const time = round2(distance / closing);

  const prompt =
    `Two delivery trucks leave warehouses that are ${distance} miles apart and drive directly ` +
    `toward each other along the same road. Truck A travels at ${speed1} mph and Truck B travels ` +
    `at ${speed2} mph. Assuming both maintain a constant speed, how long after they set off will ` +
    `they meet, to 2 decimal places?`;

  const distractors = [
    round2(distance / speed1),
    round2(time + 0.15),
    round2(Math.max(time - 0.15, 0.05)),
    round2(time * 1.2),
  ];

  return buildQuestion(
    "Speed & distance (opposite directions)",
    prompt,
    time,
    distractors,
    (v) => `${v.toFixed(2)} hours`,
    `Closing speed = ${speed1} + ${speed2} = ${closing} mph. Time = distance ÷ closing speed = ` +
      `${distance} ÷ ${closing} = ${time.toFixed(2)} hours.`
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
  const rA = randInt(2, 6);
  const rB = randInt(2, 6);
  const rC = randInt(2, 6);
  const totalPart = randInt(4, 12);
  const amountA = rA * totalPart;
  const amountB = rB * totalPart;
  const amountC = rC * totalPart;

  const prompt =
    `A bakery's recipe uses flour, sugar, and butter in the ratio ${rA}:${rB}:${rC}. If a batch uses ` +
    `${amountA} kg of flour, how much butter is needed, in kg?`;

  const swapped = Math.round((amountA * rB) / rA);
  const distractors = [swapped, amountB, amountC + rC, Math.max(amountC - rC, 1)];

  return buildQuestion(
    "Ratios",
    prompt,
    amountC,
    distractors,
    (v) => `${Math.round(v)} kg`,
    `Butter = flour × (${rC}/${rA}) = ${amountA} × ${rC} ÷ ${rA} = ${amountC} kg. (Sugar's ratio, ${rB}, ` +
      `isn't needed here.)`
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
    `A company sells two products. Product A sells for $${priceA} with a variable cost of $${varA}, and ` +
    `makes up ${mixAPct}% of unit sales. Product B sells for $${priceB} with a variable cost of $${varB}, ` +
    `and makes up the remaining ${mixBPct}% of unit sales. What is the company's blended contribution ` +
    `margin ratio, weighted by sales mix, to 1 decimal place?`;

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

/* ---------- question generators (close reading) ---------- */
/* These require catching a detail in the wording — a negation, a direction
   of adjustment, a unit mismatch, or an irrelevant distraction — not just
   running the obvious calculation. */

function genMarkupVsMargin() {
  const cost = randInt(20, 80) * 5;
  const targetMarginPct = choice([20, 25, 30, 35, 40, 45]);
  const requiredMarkupPct = round1((targetMarginPct / (100 - targetMarginPct)) * 100);

  const prompt =
    `A retailer buys a product for $${cost} and wants to achieve a gross margin of ${targetMarginPct}% of ` +
    `the selling price. What markup on cost must it apply, to 1 decimal place?`;

  const distractors = [
    targetMarginPct,
    round1(targetMarginPct + 5),
    round1(requiredMarkupPct + 5),
    round1(Math.max(requiredMarkupPct - 5, 1)),
  ];

  return buildQuestion(
    "Reading carefully: margin vs. markup",
    prompt,
    requiredMarkupPct,
    distractors,
    (v) => `${v.toFixed(1)}%`,
    `Margin and markup relate by markup = margin ÷ (1 − margin). Markup = ${targetMarginPct}% ÷ ` +
      `(100% − ${targetMarginPct}%) × 100 = ${requiredMarkupPct.toFixed(1)}% — higher than the ` +
      `${targetMarginPct}% margin target, since markup is measured against the smaller cost base, not ` +
      `the selling price.`
  );
}

function genReverseGrowth() {
  const twoYearsAgo = randInt(40, 300) * 10;
  const growthPct1 = choice([5, 8, 10, 12, 15, 20]);
  const growthPct2 = choice([5, 8, 10, 12, 15, 20]);
  const oneYearAgo = Math.round(twoYearsAgo * (1 + growthPct1 / 100));
  const currentYear = Math.round(oneYearAgo * (1 + growthPct2 / 100));

  const prompt =
    `A division's revenue grew by ${growthPct1}% two years ago and then by ${growthPct2}% this past ` +
    `year, reaching $${currentYear.toLocaleString()}k today. What was the division's revenue two years ` +
    `ago, to the nearest $1,000?`;

  const distractors = [
    Math.round(currentYear / (1 + (growthPct1 + growthPct2) / 100)),
    oneYearAgo,
    twoYearsAgo + 10,
    Math.max(twoYearsAgo - 10, 1),
  ];

  return buildQuestion(
    "Reading carefully: working backward",
    prompt,
    twoYearsAgo,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}k`,
    `Working backward: one year ago = $${currentYear.toLocaleString()}k ÷ (1 + ${growthPct2}/100) = ` +
      `$${oneYearAgo.toLocaleString()}k. Two years ago = $${oneYearAgo.toLocaleString()}k ÷ ` +
      `(1 + ${growthPct1}/100) = $${twoYearsAgo.toLocaleString()}k. Stopping after undoing only one year's ` +
      `growth gives the wrong answer.`
  );
}

function genSecondHighestWithDistraction() {
  const regions = ["Northeast", "Southeast", "Midwest", "Southwest", "West"];
  const shuffledRegions = shuffleInPlace([...regions]);
  let revenues;
  do {
    revenues = shuffledRegions.map(() => randInt(30, 150) * 10);
  } while (new Set(revenues).size !== revenues.length);

  const sortedIdx = revenues.map((_, i) => i).sort((a, b) => revenues[b] - revenues[a]);
  const highestIdx = sortedIdx[0];
  const secondIdx = sortedIdx[1];
  const gap = revenues[highestIdx] - revenues[secondIdx];
  const headcount = randInt(200, 900);
  const foundedYear = randInt(1998, 2019);

  const prompt =
    `A retailer's five regions reported the following quarterly revenue: ` +
    `${shuffledRegions.map((r, i) => `${r} $${revenues[i].toLocaleString()}k`).join(", ")}. The company, ` +
    `founded in ${foundedYear}, now employs around ${headcount} people across all regions. What is the ` +
    `gap in revenue between the highest-performing and second-highest-performing region?`;

  const distractors = [
    revenues[highestIdx],
    revenues[secondIdx],
    gap + 10,
    Math.max(gap - 10, 1),
  ];

  return buildQuestion(
    "Reading carefully: ranking",
    prompt,
    gap,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}k`,
    `Ranked highest to lowest: ${sortedIdx.map((i) => `${shuffledRegions[i]} ($${revenues[i].toLocaleString()}k)`).join(", ")}. ` +
      `The headcount and founding year aren't relevant. Gap = $${revenues[highestIdx].toLocaleString()}k − ` +
      `$${revenues[secondIdx].toLocaleString()}k = $${gap.toLocaleString()}k.`
  );
}

function genExcludingOneOff() {
  const reportedProfit = randInt(50, 300) * 10;
  const charge = randInt(10, 60) * 10;
  const gain = randInt(10, 60) * 10;
  const underlyingProfit = reportedProfit + charge - gain;

  const prompt =
    `A company reported net profit of $${reportedProfit.toLocaleString()}k this year. This figure ` +
    `includes both a $${charge.toLocaleString()}k one-off restructuring charge (which reduced reported ` +
    `profit) and a $${gain.toLocaleString()}k one-off gain from an asset sale (which boosted reported ` +
    `profit). What was the company's underlying profit, excluding both one-off items?`;

  const distractors = [
    reportedProfit,
    reportedProfit + charge + gain,
    reportedProfit - charge + gain,
    underlyingProfit + 30,
  ];

  return buildQuestion(
    "Reading carefully: one-off items",
    prompt,
    underlyingProfit,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}k`,
    `Add back the charge and subtract out the gain: $${reportedProfit.toLocaleString()}k + ` +
      `$${charge.toLocaleString()}k − $${gain.toLocaleString()}k = $${underlyingProfit.toLocaleString()}k.`
  );
}

function genUnitConversionTrap() {
  const dailyCost = randInt(150, 600) * 10;
  const daysPerWeek = 5;
  const weeksPerYear = 50;
  const annualCost = dailyCost * daysPerWeek * weeksPerYear;

  const prompt =
    `A regional office spends $${dailyCost.toLocaleString()} per business day on logistics. The office ` +
    `operates ${daysPerWeek} days a week for ${weeksPerYear} weeks a year (it's closed the rest of the ` +
    `year). What is the annual logistics cost?`;

  const distractors = [
    dailyCost * 365,
    dailyCost * daysPerWeek * 52,
    dailyCost * 7 * weeksPerYear,
    Math.round(annualCost / 12),
  ];

  return buildQuestion(
    "Reading carefully: units",
    prompt,
    annualCost,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}`,
    `$${dailyCost.toLocaleString()} × ${daysPerWeek} days × ${weeksPerYear} weeks = ` +
      `$${annualCost.toLocaleString()} per year. Common mistakes: using 365 calendar days, 52 weeks ` +
      `instead of the office's ${weeksPerYear} operating weeks, or counting weekends.`
  );
}

const STANDARD_GENERATORS = [
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
  genGrossMargin,
  genBreakeven,
  genContributionMarginRatio,
  genPaybackPeriod,
];

const CLOSE_READING_GENERATORS = [
  genMarkupVsMargin,
  genReverseGrowth,
  genSecondHighestWithDistraction,
  genExcludingOneOff,
  genUnitConversionTrap,
];

function buildQuestionSet() {
  // A handful of close-reading questions every attempt (details that are
  // easy to miss), plus a random spread of standard case-math and word
  // problems to fill out the rest — so every playthrough is different.
  const closeReadingPicks = sampleGenerators(CLOSE_READING_GENERATORS, Math.min(CLOSE_READING_COUNT, CLOSE_READING_GENERATORS.length));
  const standardCount = TOTAL_QUESTIONS - closeReadingPicks.length;
  const standardPicks = sampleGenerators(STANDARD_GENERATORS, Math.min(standardCount, STANDARD_GENERATORS.length));
  const questions = [...closeReadingPicks, ...standardPicks].map((gen) => gen());
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
