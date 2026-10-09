"use strict";

const TARGET_SECONDS = 18 * 60; // recommended completion time
const TOTAL_QUESTIONS = 15;
const CLOSE_READING_COUNT = 4;
const HISTORY_KEY = "dataAnalysisTrainerHistory";
const HISTORY_LIMIT = 30;

/* ---------- small utilities ---------- */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function round1(n) {
  return Math.round(n * 10) / 10;
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
 * Builds a shuffled multiple-choice question from a correct value and a list
 * of plausible wrong values (numbers or, for "which category" questions,
 * strings). Distractors that would format identically to the correct answer
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

function withChart(question, chartRender) {
  question.chartRender = chartRender;
  return question;
}

/* ---------- chart rendering (inline SVG / HTML, no libraries) ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  return node;
}

function svgTitle(text) {
  const t = svgEl("title");
  t.textContent = text;
  return t;
}

function chartTitleEl(title) {
  const p = document.createElement("p");
  p.className = "chart-title";
  p.textContent = title;
  return p;
}

function legendEl(items) {
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  items.forEach(({ label, colorVar }) => {
    const item = document.createElement("span");
    item.className = "chart-legend-item";
    item.innerHTML = `<span class="chart-legend-swatch" style="background:${colorVar}"></span>${label}`;
    legend.appendChild(item);
  });
  return legend;
}

function niceStep(rough) {
  if (!isFinite(rough) || rough <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / magnitude;
  let niceNorm;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * magnitude;
}

/** Nice axis bounds (0 always included) for a set of values that may be negative. */
function chartScale(values) {
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const span = maxVal - minVal || 1;
  const step = niceStep(span / 4);
  const top = Math.ceil(maxVal / step) * step || step;
  const bottom = Math.floor(minVal / step) * step;
  return { top, bottom, step };
}

/** Bar path from a baseline y (yBase) to a value's y (yVal), rounding the end far from the baseline. */
function signedBarPath(x, w, yBase, yVal, r) {
  const yTop = Math.min(yBase, yVal);
  const yBottom = Math.max(yBase, yVal);
  const rr = Math.max(0, Math.min(r, w / 2, yBottom - yTop));
  if (rr < 0.5) {
    return `M ${x} ${yBottom} L ${x} ${yTop} L ${x + w} ${yTop} L ${x + w} ${yBottom} Z`;
  }
  if (yVal < yBase) {
    // value above the baseline: round the top (far) end
    return [
      `M ${x} ${yBottom}`,
      `L ${x} ${yTop + rr}`,
      `Q ${x} ${yTop} ${x + rr} ${yTop}`,
      `L ${x + w - rr} ${yTop}`,
      `Q ${x + w} ${yTop} ${x + w} ${yTop + rr}`,
      `L ${x + w} ${yBottom}`,
      "Z",
    ].join(" ");
  }
  // value below the baseline: round the bottom (far) end
  return [
    `M ${x} ${yTop}`,
    `L ${x} ${yBottom - rr}`,
    `Q ${x} ${yBottom} ${x + rr} ${yBottom}`,
    `L ${x + w - rr} ${yBottom}`,
    `Q ${x + w} ${yBottom} ${x + w} ${yBottom - rr}`,
    `L ${x + w} ${yTop}`,
    "Z",
  ].join(" ");
}

function chartGridlines(svg, { marginLeft, width, marginRight, top, bottom, step, yFor, valueFormat }) {
  for (let t = bottom; t <= top + step / 2; t += step) {
    const y = yFor(t).toFixed(1);
    svg.appendChild(svgEl("line", { x1: marginLeft, x2: width - marginRight, y1: y, y2: y, class: "chart-gridline" }));
    const label = svgEl("text", {
      x: marginLeft - 8,
      y,
      "text-anchor": "end",
      "dominant-baseline": "middle",
      class: "chart-axis-label",
    });
    label.textContent = valueFormat(t);
    svg.appendChild(label);
  }
}

function renderBarChart(container, { title, categories, values, valueFormat }) {
  container.innerHTML = "";
  if (title) container.appendChild(chartTitleEl(title));

  const width = 560;
  const height = 250;
  const marginLeft = 50;
  const marginRight = 12;
  const marginTop = 22;
  const marginBottom = 34;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const { top, bottom, step } = chartScale(values);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "chart-svg",
    role: "img",
    "aria-label": title || "Bar chart",
  });
  const yFor = (v) => marginTop + plotH - ((v - bottom) / (top - bottom)) * plotH;

  chartGridlines(svg, { marginLeft, width, marginRight, top, bottom, step, yFor, valueFormat });

  const yZero = yFor(0);
  if (bottom < 0) {
    svg.appendChild(
      svgEl("line", { x1: marginLeft, x2: width - marginRight, y1: yZero.toFixed(1), y2: yZero.toFixed(1), class: "chart-baseline" })
    );
  }

  const n = values.length;
  const slot = plotW / n;
  const barW = Math.min(48, slot * 0.55);

  values.forEach((v, i) => {
    const cx = marginLeft + slot * i + slot / 2;
    const x = cx - barW / 2;
    const yVal = yFor(v);

    const path = svgEl("path", { d: signedBarPath(x, barW, yZero, yVal, 4), fill: "var(--series-1)" });
    path.appendChild(svgTitle(`${categories[i]}: ${valueFormat(v)}`));
    svg.appendChild(path);

    const labelY = v >= 0 ? yVal - 6 : yVal + 14;
    const valueLabel = svgEl("text", { x: cx, y: labelY.toFixed(1), class: "chart-value-label" });
    valueLabel.textContent = valueFormat(v);
    svg.appendChild(valueLabel);

    const catLabel = svgEl("text", {
      x: cx,
      y: height - marginBottom + 16,
      "text-anchor": "middle",
      class: "chart-axis-label",
    });
    catLabel.textContent = categories[i];
    svg.appendChild(catLabel);
  });

  container.appendChild(svg);
}

function renderLineChart(container, { title, periods, series, valueFormat }) {
  container.innerHTML = "";
  if (title) container.appendChild(chartTitleEl(title));

  const width = 560;
  const height = 250;
  const marginLeft = 50;
  const marginRight = 30;
  const marginTop = 26;
  const marginBottom = 34;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const allValues = series.flatMap((s) => s.values);
  const { top, bottom, step } = chartScale(allValues);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "chart-svg",
    role: "img",
    "aria-label": title || "Line chart",
  });
  const n = periods.length;
  const xFor = (i) => marginLeft + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yFor = (v) => marginTop + plotH - ((v - bottom) / (top - bottom)) * plotH;

  chartGridlines(svg, { marginLeft, width, marginRight, top, bottom, step, yFor, valueFormat });

  periods.forEach((p, i) => {
    const label = svgEl("text", {
      x: xFor(i).toFixed(1),
      y: height - marginBottom + 16,
      "text-anchor": "middle",
      class: "chart-axis-label",
    });
    label.textContent = p;
    svg.appendChild(label);
  });

  series.forEach((s, sIdx) => {
    let d = "";
    s.values.forEach((v, i) => {
      d += `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)} `;
    });
    const path = svgEl("path", { d: d.trim(), class: "chart-line", stroke: s.colorVar, fill: "none" });
    svg.appendChild(path);

    s.values.forEach((v, i) => {
      const marker = svgEl("circle", { cx: xFor(i).toFixed(1), cy: yFor(v).toFixed(1), r: 4, class: "chart-marker", fill: s.colorVar });
      marker.appendChild(svgTitle(`${s.label ? s.label + " – " : ""}${periods[i]}: ${valueFormat(v)}`));
      svg.appendChild(marker);

      const offset = sIdx === 0 ? -10 : 16;
      const vLabel = svgEl("text", { x: xFor(i).toFixed(1), y: (yFor(v) + offset).toFixed(1), class: "chart-value-label" });
      vLabel.textContent = valueFormat(v);
      svg.appendChild(vLabel);
    });
  });

  container.appendChild(svg);

  if (series.length > 1) {
    container.appendChild(legendEl(series.map((s) => ({ label: s.label, colorVar: s.colorVar }))));
  }
}

function renderPieChart(container, { title, segments, sliceLabelFormat }) {
  container.innerHTML = "";
  if (title) container.appendChild(chartTitleEl(title));

  const width = 300;
  const height = 240;
  const cx = 120;
  const cy = 120;
  const r = 96;
  const total = segments.reduce((a, s) => a + s.value, 0);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "chart-svg",
    role: "img",
    "aria-label": title || "Pie chart",
  });

  let angle = -Math.PI / 2;
  segments.forEach((seg, i) => {
    const frac = seg.value / total;
    const nextAngle = angle + frac * 2 * Math.PI;
    const x0 = cx + r * Math.cos(angle);
    const y0 = cy + r * Math.sin(angle);
    const x1 = cx + r * Math.cos(nextAngle);
    const y1 = cy + r * Math.sin(nextAngle);
    const largeArc = nextAngle - angle > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    const path = svgEl("path", { d, fill: `var(--series-${i + 1})`, stroke: "var(--surface)", "stroke-width": 2 });
    path.appendChild(svgTitle(`${seg.label}: ${sliceLabelFormat(seg.value, frac * 100)}`));
    svg.appendChild(path);
    angle = nextAngle;
  });

  container.appendChild(svg);
  container.appendChild(
    legendEl(
      segments.map((seg, i) => ({
        label: `${seg.label} (${sliceLabelFormat(seg.value, (seg.value / total) * 100)})`,
        colorVar: `var(--series-${i + 1})`,
      }))
    )
  );
}

function renderStackedBarChart(container, { title, categories, series, valueFormat }) {
  container.innerHTML = "";
  if (title) container.appendChild(chartTitleEl(title));

  const width = 560;
  const height = 250;
  const marginLeft = 50;
  const marginRight = 12;
  const marginTop = 22;
  const marginBottom = 34;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const totals = categories.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const { top, bottom, step } = chartScale(totals);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "chart-svg",
    role: "img",
    "aria-label": title || "Stacked bar chart",
  });
  const yFor = (v) => marginTop + plotH - ((v - bottom) / (top - bottom)) * plotH;

  chartGridlines(svg, { marginLeft, width, marginRight, top, bottom, step, yFor, valueFormat });

  const n = categories.length;
  const slot = plotW / n;
  const barW = Math.min(56, slot * 0.6);

  categories.forEach((cat, i) => {
    const cx = marginLeft + slot * i + slot / 2;
    const x = cx - barW / 2;
    let cumulative = 0;

    series.forEach((s, sIdx) => {
      const v = s.values[i];
      const yBottom = yFor(cumulative);
      const yTop = yFor(cumulative + v);
      const gap = sIdx > 0 ? 1 : 0;
      const isTop = sIdx === series.length - 1;
      const d = isTop
        ? signedBarPath(x, barW, yBottom, yTop + gap, 4)
        : `M ${x} ${yBottom} L ${x} ${yTop + gap} L ${x + barW} ${yTop + gap} L ${x + barW} ${yBottom} Z`;
      const path = svgEl("path", { d, fill: s.colorVar });
      path.appendChild(svgTitle(`${cat} – ${s.label}: ${valueFormat(v)}`));
      svg.appendChild(path);
      cumulative += v;
    });

    const totalLabel = svgEl("text", { x: cx, y: (yFor(cumulative) - 6).toFixed(1), class: "chart-value-label" });
    totalLabel.textContent = valueFormat(cumulative);
    svg.appendChild(totalLabel);

    const catLabel = svgEl("text", {
      x: cx,
      y: height - marginBottom + 16,
      "text-anchor": "middle",
      class: "chart-axis-label",
    });
    catLabel.textContent = cat;
    svg.appendChild(catLabel);
  });

  container.appendChild(svg);
  container.appendChild(legendEl(series.map((s) => ({ label: s.label, colorVar: s.colorVar }))));
}

function renderDataTable(container, { title, columns, rows }) {
  container.innerHTML = "";
  if (title) container.appendChild(chartTitleEl(title));

  const wrap = document.createElement("div");
  wrap.className = "data-table-wrap";
  const table = document.createElement("table");
  table.className = "data-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    r.forEach((cellText) => {
      const td = document.createElement("td");
      td.textContent = cellText;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

/** Renders two or more panels (chart or table) stacked in one container, each
 * visually separated, so a question can present a second, clearly labelled
 * data source alongside the one actually needed to answer it. */
function renderMultiPanel(container, panelRenderers) {
  container.innerHTML = "";
  panelRenderers.forEach((renderFn) => {
    const panel = document.createElement("div");
    panel.className = "chart-panel";
    container.appendChild(panel);
    renderFn(panel);
  });
}

/* ---------- companion data panels ---------- */
/* A second chart or table from the same scenario (same categories/periods),
   always drawn from genuinely financial/operational metrics — cost, price,
   units, prior-year revenue, growth rate, budget — the same vocabulary used
   when a question's calculation actually needs a second source. Sometimes
   this panel is required; sometimes it isn't, and which role it plays isn't
   given away by its content, position, or any label. */

function panelValueTable(categories, categoryNoun, metricLabel, min, max, formatFn) {
  const rows = categories.map((c) => [c, formatFn(randInt(min, max))]);
  return (container) =>
    renderDataTable(container, {
      title: `${metricLabel} by ${categoryNoun}`,
      columns: [categoryNoun, metricLabel],
      rows,
    });
}

function panelValueBar(categories, categoryNoun, metricLabel, min, max, formatFn) {
  const values = categories.map(() => randInt(min, max));
  return (container) =>
    renderBarChart(container, {
      title: `${metricLabel} by ${categoryNoun}`,
      categories,
      values,
      valueFormat: formatFn,
    });
}

function pickCompanionPanel(categories, categoryNoun) {
  const options = [
    () => panelValueTable(categories, categoryNoun, "Cost ($m)", 20, 400, (v) => `$${v}m`),
    () => panelValueTable(categories, categoryNoun, "Price per unit ($)", 8, 120, (v) => `$${v}`),
    () => panelValueBar(categories, categoryNoun, "Units sold (000s)", 30, 600, (v) => `${v}k`),
    () => panelValueTable(categories, categoryNoun, "Prior-year revenue ($m)", 20, 400, (v) => `$${v}m`),
    () => panelValueBar(categories, categoryNoun, "YoY growth rate (%)", -10, 35, (v) => `${v > 0 ? "+" : ""}${v}%`),
    () => panelValueBar(categories, categoryNoun, "Operating budget ($m)", 10, 250, (v) => `$${v}m`),
  ];
  return choice(options)();
}

/** Renders two panels in a random order, so whichever one is actually needed
 * to answer the question isn't always the one shown first. */
function renderTwoPanelsRandomOrder(container, panelA, panelB) {
  const panels = Math.random() < 0.5 ? [panelA, panelB] : [panelB, panelA];
  renderMultiPanel(container, panels);
}

/* ---------- question generators ---------- */
/* Every generator builds two fresh, labelled data panels and a question
   about them, covering the kinds of data-analysis questions used in
   consulting numerical reasoning tests (Bain SOVA, BCG online test, etc.).
   About half require combining BOTH panels (a rate from one and a base from
   the other, a share and a total, two related series); the rest need only
   one, with a plausible financial companion alongside it. Numbers are kept
   deliberately non-round so they can't be estimated at a glance. */

function genRevenueFromUnitsPrice() {
  const products = ["Product A", "Product B", "Product C", "Product D", "Product E"];
  const units = products.map(() => randInt(40, 220));
  const prices = products.map(() => randInt(15, 90));
  const idx = randInt(0, products.length - 1);
  const otherIdx = (idx + 1) % products.length;
  const correct = units[idx] * prices[idx];

  const prompt = `What was total revenue for ${products[idx]}, in $000s?`;

  const distractors = [
    units[idx] * prices[otherIdx],
    units[otherIdx] * prices[idx],
    Math.round(correct * 1.15),
    Math.round(correct * 0.85),
  ];

  const q = buildQuestion(
    "Combining two sources: units × price",
    prompt,
    correct,
    distractors,
    (v) => `$${Math.round(v).toLocaleString()}k`,
    `${products[idx]}: ${units[idx]}k units × $${prices[idx]} per unit = $${correct.toLocaleString()}k.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderBarChart(c, {
          title: "Units sold (000s) by product",
          categories: products,
          values: units,
          valueFormat: (v) => `${Math.round(v)}k`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Price per unit ($) by product",
          columns: ["Product", "Price"],
          rows: products.map((p, i) => [p, `$${prices[i]}`]),
        })
    )
  );
}

function genMarginFromRevenueCost() {
  const divisions = ["Retail", "Corporate", "Wholesale", "Digital", "International"];
  const revenue = divisions.map(() => randInt(37, 197));
  const cost = revenue.map((r) => Math.round(r * (randInt(55, 92) / 100)));
  const idx = randInt(0, divisions.length - 1);
  const profit = revenue[idx] - cost[idx];
  const margin = round1((profit / revenue[idx]) * 100);

  const prompt = `What was the profit margin for ${divisions[idx]} (profit as a percentage of revenue), to 1 decimal place?`;

  const distractors = [
    round1((cost[idx] / revenue[idx]) * 100),
    round1(margin + 6),
    round1(Math.max(margin - 6, 1)),
    round1((profit / cost[idx]) * 100),
  ];

  const q = buildQuestion(
    "Combining two sources: margin",
    prompt,
    margin,
    distractors,
    (v) => `${v.toFixed(1)}%`,
    `${divisions[idx]}: revenue $${revenue[idx]}m − cost $${cost[idx]}m = profit $${profit}m. Margin = ` +
      `$${profit}m ÷ $${revenue[idx]}m × 100 = ${margin.toFixed(1)}%.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderBarChart(c, {
          title: "Revenue ($m) by division",
          categories: divisions,
          values: revenue,
          valueFormat: (v) => `$${Math.round(v)}m`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Cost ($m) by division",
          columns: ["Division", "Cost"],
          rows: divisions.map((d, i) => [d, `$${cost[i]}m`]),
        })
    )
  );
}

function genPricePerUnitFromRevenueUnits() {
  const stores = ["Store 1", "Store 2", "Store 3", "Store 4", "Store 5"];
  const revenue = stores.map(() => randInt(180, 920));
  const units = stores.map(() => randInt(2500, 9500));
  const idx = randInt(0, stores.length - 1);
  const otherIdx = (idx + 1) % stores.length;
  const correct = round1((revenue[idx] * 1000) / units[idx]);

  const prompt = `What was the average price per unit at ${stores[idx]}, to the nearest cent?`;

  const distractors = [
    round1((revenue[otherIdx] * 1000) / units[idx]),
    round1((revenue[idx] * 1000) / units[otherIdx]),
    round1(correct + 5),
    round1(Math.max(correct - 5, 0.5)),
  ];

  const q = buildQuestion(
    "Combining two sources: price per unit",
    prompt,
    correct,
    distractors,
    (v) => `$${v.toFixed(2)}`,
    `${stores[idx]}: $${revenue[idx]}k revenue ÷ ${units[idx].toLocaleString()} units = $${correct.toFixed(2)} ` +
      `per unit.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderBarChart(c, {
          title: "Revenue ($000s) by store",
          categories: stores,
          values: revenue,
          valueFormat: (v) => `$${Math.round(v)}k`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Units sold by store",
          columns: ["Store", "Units"],
          rows: stores.map((s, i) => [s, units[i].toLocaleString()]),
        })
    )
  );
}

function genBlendedMarginFromShareAndMargin() {
  const segments = ["Retail", "Corporate", "Online", "Wholesale"];
  let shares;
  do {
    const raw = segments.map(() => randInt(10, 45));
    const sum = raw.reduce((a, b) => a + b, 0);
    shares = raw.map((v) => Math.round((v / sum) * 100));
    shares[0] += 100 - shares.reduce((a, b) => a + b, 0);
  } while (shares.some((s) => s <= 0));
  const margins = segments.map(() => randInt(4, 38));

  const weighted = round1(segments.reduce((sum, _, i) => sum + (shares[i] / 100) * margins[i], 0));
  const simpleAvg = round1(margins.reduce((a, b) => a + b, 0) / margins.length);

  const prompt = `What is the company's overall profit margin, weighted by revenue share, to 1 decimal place?`;

  const distractors = [simpleAvg, round1(weighted + 3), round1(Math.max(weighted - 3, 1)), Math.max(...margins)];

  const q = buildQuestion(
    "Combining two sources: weighted average",
    prompt,
    weighted,
    distractors,
    (v) => `${v.toFixed(1)}%`,
    `Weighted margin = ${segments.map((s, i) => `${shares[i]}%×${margins[i]}%`).join(" + ")} = ${weighted.toFixed(1)}%.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderPieChart(c, {
          title: "Revenue share by segment",
          segments: segments.map((label, i) => ({ label, value: shares[i] })),
          sliceLabelFormat: (v) => `${Math.round(v)}%`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Profit margin by segment",
          columns: ["Segment", "Margin"],
          rows: segments.map((s, i) => [s, `${margins[i]}%`]),
        })
    )
  );
}

function genCompanyRevenueFromShareAndMarketSize() {
  const segments = ["Consumer", "Enterprise", "Government", "International", "Other"];
  let shares;
  do {
    const raw = segments.map(() => randInt(6, 32));
    const sum = raw.reduce((a, b) => a + b, 0);
    shares = raw.map((v) => Math.round((v / sum) * 100));
    shares[0] += 100 - shares.reduce((a, b) => a + b, 0);
  } while (shares.some((s) => s <= 0));

  const years = ["2022", "2023", "2024"];
  const totalRevenue = [randInt(230, 870)];
  for (let i = 1; i < years.length; i++) {
    totalRevenue.push(Math.round(totalRevenue[i - 1] * (1 + randInt(2, 18) / 100)));
  }
  const yIdx = randInt(0, years.length - 1);
  const idx = randInt(0, segments.length - 1);
  const otherIdx = (idx + 1) % segments.length;
  const correct = Math.round((shares[idx] / 100) * totalRevenue[yIdx]);

  const prompt =
    `Assuming the same breakdown applied in ${years[yIdx]}, what was the approximate ${segments[idx]} ` +
    `segment's revenue that year?`;

  const distractors = [
    Math.round((shares[otherIdx] / 100) * totalRevenue[yIdx]),
    Math.round((shares[idx] / 100) * totalRevenue[(yIdx + 1) % years.length]),
    Math.round(correct * 1.2),
    Math.round(correct * 0.8),
  ];

  const q = buildQuestion(
    "Combining two sources: share × total",
    prompt,
    correct,
    distractors,
    (v) => `$${Math.round(v)}m`,
    `${years[yIdx]} total revenue = $${totalRevenue[yIdx]}m. ${segments[idx]} = ${shares[idx]}% × ` +
      `$${totalRevenue[yIdx]}m = $${correct}m.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderPieChart(c, {
          title: "Revenue breakdown by segment",
          segments: segments.map((label, i) => ({ label, value: shares[i] })),
          sliceLabelFormat: (v) => `${Math.round(v)}%`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Total company revenue ($m) by year",
          columns: ["Year", "Revenue"],
          rows: years.map((y, i) => [y, `$${totalRevenue[i]}m`]),
        })
    )
  );
}

function genAbsoluteGrowthFromRateAndBase() {
  const regions = ["North", "South", "East", "West", "Central"];
  const growthPct = regions.map(() => randInt(-12, 32));
  const priorRevenue = regions.map(() => randInt(180, 920));
  const idx = randInt(0, regions.length - 1);
  const dollarGrowth = Math.round(priorRevenue[idx] * (growthPct[idx] / 100));

  const prompt = `What was ${regions[idx]}'s absolute change in revenue this year, in $000s?`;

  const distractors = [
    priorRevenue[idx],
    Math.round(priorRevenue[idx] * (1 + growthPct[idx] / 100)),
    Math.round(dollarGrowth * 1.3),
    Math.round(dollarGrowth * 0.7),
  ];

  const q = buildQuestion(
    "Combining two sources: growth in dollars",
    prompt,
    dollarGrowth,
    distractors,
    (v) => `${v > 0 ? "+" : ""}$${Math.round(v)}k`,
    `${regions[idx]}: $${priorRevenue[idx]}k × ${growthPct[idx]}% = ${dollarGrowth > 0 ? "+" : ""}$${dollarGrowth}k.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderBarChart(c, {
          title: "Year-on-year revenue growth (%) by region",
          categories: regions,
          values: growthPct,
          valueFormat: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Last year's revenue ($000s) by region",
          columns: ["Region", "Revenue"],
          rows: regions.map((r, i) => [r, `$${priorRevenue[i]}k`]),
        })
    )
  );
}

function genPeakProfitFromRevenueAndCosts() {
  const startYear = randInt(2019, 2021);
  const years = [0, 1, 2, 3, 4].map((i) => String(startYear + i));
  const revenue = [randInt(60, 100)];
  const costs = [Math.round(revenue[0] * (0.6 + Math.random() * 0.25))];
  for (let i = 1; i < years.length; i++) {
    revenue.push(revenue[i - 1] + randInt(-5, 20));
    costs.push(Math.max(5, costs[i - 1] + randInt(-8, 15)));
  }
  const profits = years.map((_, i) => revenue[i] - costs[i]);
  const sortedProfits = [...profits].sort((a, b) => b - a);
  if (sortedProfits[0] === sortedProfits[1]) return genPeakProfitFromRevenueAndCosts(); // avoid an ambiguous tie

  let bestIdx = 0;
  profits.forEach((p, i) => {
    if (p > profits[bestIdx]) bestIdx = i;
  });
  const peakProfit = profits[bestIdx];

  const prompt = `What was profit (revenue minus costs) in the year it peaked?`;

  const distractors = [...profits.filter((_, i) => i !== bestIdx), peakProfit + 5, peakProfit - 5];

  const q = buildQuestion(
    "Combining two sources: peak profit",
    prompt,
    peakProfit,
    distractors,
    (v) => `$${Math.round(v)}m`,
    `Profit each year = revenue − costs: ${years.map((y, i) => `${y}: $${profits[i]}m`).join(", ")}. The highest ` +
      `is ${years[bestIdx]} at $${peakProfit}m.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderLineChart(c, {
          title: "Annual revenue ($m)",
          periods: years,
          series: [{ label: "Revenue", values: revenue, colorVar: "var(--series-1)" }],
          valueFormat: (v) => `$${Math.round(v)}m`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Annual costs ($m) by year",
          columns: ["Year", "Costs"],
          rows: years.map((y, i) => [y, `$${costs[i]}m`]),
        })
    )
  );
}

function genBarPercentChange() {
  const startYear = randInt(2017, 2020);
  const years = [0, 1, 2, 3, 4, 5].map((i) => String(startYear + i));
  const values = [randInt(41, 93)];
  for (let i = 1; i < years.length; i++) {
    const pct = randInt(-18, 27);
    values.push(Math.round(values[i - 1] * (1 + pct / 100)));
  }
  const idx = randInt(2, years.length - 1);
  const base = values[idx - 2];
  const curr = values[idx];
  const pctChange = round1(((curr - base) / base) * 100);
  const oneYearPct = round1(((values[idx] - values[idx - 1]) / values[idx - 1]) * 100);

  const prompt =
    `What was the percentage change in revenue from ${years[idx - 2]} to ${years[idx]} (two years later), to ` +
    `1 decimal place?`;

  const distractors = [round1(-pctChange), oneYearPct, round1(pctChange + 3), round1(pctChange - 3)];

  const q = buildQuestion(
    "Bar chart: percentage change",
    prompt,
    pctChange,
    distractors,
    (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    `Change = ($${curr}m − $${base}m) ÷ $${base}m × 100 = ${pctChange.toFixed(1)}%, comparing ${years[idx - 2]} ` +
      `directly to ${years[idx]} (not just the latest year's ${oneYearPct.toFixed(1)}% change).`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderBarChart(c, {
          title: `Annual revenue ($m), ${years[0]}–${years[years.length - 1]}`,
          categories: years,
          values,
          valueFormat: (v) => `$${Math.round(v)}m`,
        }),
      pickCompanionPanel(years, "Year")
    )
  );
}

function genLineCAGR() {
  const startYear = randInt(2018, 2020);
  const years = [0, 1, 2, 3, 4].map((i) => String(startYear + i));
  const startVal = randInt(187, 683);
  const cagrPct = choice([4, 6, 8, 9, 11, 13, 16, 19, 22]);
  const values = years.map((_, i) => Math.round(startVal * Math.pow(1 + cagrPct / 100, i)));

  const prompt = `What is the compound annual growth rate (CAGR) over this period, to the nearest whole percent?`;

  const totalGrowthPct = round1((values[values.length - 1] / values[0] - 1) * 100);
  const avgAnnualNaive = Math.round(totalGrowthPct / (years.length - 1));
  const distractors = [avgAnnualNaive, cagrPct + 3, Math.max(cagrPct - 3, 1), Math.round(totalGrowthPct)];

  const q = buildQuestion(
    "Line chart: CAGR",
    prompt,
    cagrPct,
    distractors,
    (v) => `${Math.round(v)}%`,
    `CAGR = (End ÷ Start)^(1 ÷ years) − 1 = ($${values[values.length - 1]}m ÷ $${values[0]}m)^(1/${years.length - 1}) ` +
      `− 1 ≈ ${cagrPct}%.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderLineChart(c, {
          title: `Company valuation ($m), ${years[0]}–${years[years.length - 1]}`,
          periods: years,
          series: [{ label: "Valuation", values, colorVar: "var(--series-1)" }],
          valueFormat: (v) => `$${Math.round(v)}m`,
        }),
      pickCompanionPanel(years, "Year")
    )
  );
}

function genStackedBar() {
  const years = ["2022", "2023", "2024", "2025"];
  const products = ["Product A", "Product B", "Product C", "Product D"];
  const values = products.map(() => years.map(() => randInt(8, 53)));
  const series = products.map((label, p) => ({ label, values: values[p], colorVar: `var(--series-${p + 1})` }));

  const pIdx = randInt(0, products.length - 1);
  const yIdxEarlier = randInt(0, years.length - 2);
  const yIdxLater = randInt(yIdxEarlier + 1, years.length - 1);
  const totalEarlier = products.reduce((sum, _, p) => sum + values[p][yIdxEarlier], 0);
  const totalLater = products.reduce((sum, _, p) => sum + values[p][yIdxLater], 0);
  const shareEarlier = (values[pIdx][yIdxEarlier] / totalEarlier) * 100;
  const shareLater = (values[pIdx][yIdxLater] / totalLater) * 100;
  const change = round1(shareLater - shareEarlier);

  const prompt =
    `By how many percentage points did ${products[pIdx]}'s share of total revenue change from ` +
    `${years[yIdxEarlier]} to ${years[yIdxLater]}?`;

  const distractors = [
    round1(-change),
    round1(values[pIdx][yIdxLater] - values[pIdx][yIdxEarlier]),
    round1(change + 3),
    round1(change - 3),
  ];

  const q = buildQuestion(
    "Stacked bar chart: share of total",
    prompt,
    change,
    distractors,
    (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} pts`,
    `${products[pIdx]} share in ${years[yIdxEarlier]} = ${values[pIdx][yIdxEarlier]} ÷ ${totalEarlier} × 100 = ` +
      `${shareEarlier.toFixed(1)}%. Share in ${years[yIdxLater]} = ${values[pIdx][yIdxLater]} ÷ ${totalLater} × 100 ` +
      `= ${shareLater.toFixed(1)}%. Change = ${shareLater.toFixed(1)} − ${shareEarlier.toFixed(1)} = ` +
      `${change >= 0 ? "+" : ""}${change.toFixed(1)} points.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderStackedBarChart(c, {
          title: "Revenue ($m) by product line",
          categories: years,
          series,
          valueFormat: (v) => `$${Math.round(v)}m`,
        }),
      pickCompanionPanel(products, "Product")
    )
  );
}

function genTableAverage() {
  const stores = ["Store 1", "Store 2", "Store 3", "Store 4", "Store 5", "Store 6"];
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const data = stores.map(() => quarters.map(() => randInt(187, 793)));

  const idx = randInt(0, stores.length - 1);
  const rowValues = data[idx];
  const storeAvg = rowValues.reduce((a, b) => a + b, 0) / rowValues.length;
  const allValues = data.flat();
  const overallAvg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const diff = round1(storeAvg - overallAvg);

  const prompt =
    `By how much is ${stores[idx]}'s average quarterly sales above or below the overall average across all ` +
    `${stores.length} stores, to 1 decimal place?`;

  const distractors = [round1(storeAvg), round1(-diff), round1(diff + 15), round1(diff - 15)];

  const q = buildQuestion(
    "Data table: average",
    prompt,
    diff,
    distractors,
    (v) => `${v >= 0 ? "+" : ""}$${v.toFixed(1)}k`,
    `${stores[idx]}'s average = $${storeAvg.toFixed(1)}k. Overall average across all stores = ` +
      `$${overallAvg.toFixed(1)}k. Difference = ${diff >= 0 ? "+" : ""}$${diff.toFixed(1)}k.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderDataTable(c, {
          title: "Quarterly sales ($000s) by store",
          columns: ["Store", ...quarters],
          rows: stores.map((s, i) => [s, ...data[i].map((v) => `$${v}k`)]),
        }),
      pickCompanionPanel(stores, "Store")
    )
  );
}

function genTableGrowthRate() {
  const products = ["Product A", "Product B", "Product C", "Product D", "Product E"];
  const year1 = products.map(() => randInt(53, 297));
  const year2 = year1.map((v) => Math.round(v * (1 + randInt(-25, 35) / 100)));
  const year3 = year2.map((v) => Math.round(v * (1 + randInt(-25, 35) / 100)));

  const idx = randInt(0, products.length - 1);
  const cagr = round1((Math.pow(year3[idx] / year1[idx], 1 / 2) - 1) * 100);
  const simpleGrowth = round1(((year3[idx] - year1[idx]) / year1[idx]) * 100);
  const oneStepOnly = round1(((year2[idx] - year1[idx]) / year1[idx]) * 100);

  const prompt =
    `What was the compound annual growth rate (CAGR) in units sold for ${products[idx]} from Year 1 to Year ` +
    `3, to 1 decimal place?`;

  const distractors = [simpleGrowth, oneStepOnly, round1(cagr + 4), round1(Math.max(cagr - 4, -95))];

  const q = buildQuestion(
    "Data table: growth rate",
    prompt,
    cagr,
    distractors,
    (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    `CAGR = (Year 3 ÷ Year 1)^(1/2) − 1 = (${year3[idx]} ÷ ${year1[idx]})^0.5 − 1 ≈ ${cagr.toFixed(1)}%. Simply ` +
      `taking the total growth over the period (${simpleGrowth.toFixed(1)}%) overstates the annual rate, since ` +
      `it isn't annualized.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderDataTable(c, {
          title: "Units sold by product",
          columns: ["Product", "Year 1", "Year 2", "Year 3"],
          rows: products.map((p, i) => [p, String(year1[i]), String(year2[i]), String(year3[i])]),
        }),
      pickCompanionPanel(products, "Product")
    )
  );
}

function genLineForecast() {
  const startYear = randInt(2019, 2021);
  const years = [0, 1, 2, 3].map((i) => String(startYear + i));
  const twoAheadYear = String(startYear + years.length + 1);
  const startVal = randInt(287, 783);
  const growthPct = choice([6, 8, 9, 11, 13, 15, 17]);
  const values = years.map((_, i) => Math.round(startVal * Math.pow(1 + growthPct / 100, i)));
  const lastVal = values[values.length - 1];
  const forecast = Math.round(lastVal * Math.pow(1 + growthPct / 100, 2));
  const oneStepOnly = Math.round(lastVal * (1 + growthPct / 100));

  const prompt =
    `Assuming revenue has grown at a steady annual rate, approximately what will revenue be in ` +
    `${twoAheadYear} (two years after the last data point)?`;

  const distractors = [
    oneStepOnly,
    Math.round(lastVal * (1 + (2 * growthPct) / 100)),
    Math.round(forecast * 1.08),
    Math.round(forecast * 0.92),
  ];

  const q = buildQuestion(
    "Line chart: forecasting a trend",
    prompt,
    forecast,
    distractors,
    (v) => `$${Math.round(v)}m`,
    `Revenue has grown at a constant ${growthPct}% per year. Two-year forecast = $${lastVal}m × ` +
      `(1 + ${growthPct}/100)² ≈ $${forecast}m. Stopping after a single year of growth ($${oneStepOnly}m) ` +
      `understates it.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderLineChart(c, {
          title: `Annual revenue ($m), ${years[0]}–${years[years.length - 1]}`,
          periods: years,
          series: [{ label: "Revenue", values, colorVar: "var(--series-1)" }],
          valueFormat: (v) => `$${Math.round(v)}m`,
        }),
      pickCompanionPanel(years, "Year")
    )
  );
}

/* ---------- question generators (close reading) ---------- */
/* These require catching a detail in the chart or table — a one-off item to
   adjust for, a time period to sum correctly, a plausible-but-unneeded
   companion, or a negation — not just reading off the obvious number. */

function genChartExcludingOneOff() {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const values = quarters.map(() => randInt(187, 793));
  const idx = randInt(0, quarters.length - 1);
  const charge = randInt(50, 230);
  const gain = randInt(50, 230);
  const underlying = values[idx] + charge - gain;

  const prompt =
    `${quarters[idx]}'s figure includes both a $${charge}k one-off restructuring charge (which reduced ` +
    `reported profit) and a $${gain}k one-off gain from a property sale (which boosted reported profit). ` +
    `What was ${quarters[idx]}'s underlying profit, excluding both one-off items?`;

  const distractors = [values[idx], values[idx] + charge + gain, values[idx] - charge + gain, underlying + 25];

  const q = buildQuestion(
    "Reading carefully: one-off items",
    prompt,
    underlying,
    distractors,
    (v) => `$${Math.round(v)}k`,
    `Add back the charge and subtract out the gain: $${values[idx]}k + $${charge}k − $${gain}k = ` +
      `$${underlying}k.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderBarChart(c, {
          title: "Quarterly net profit ($000s)",
          categories: quarters,
          values,
          valueFormat: (v) => `$${Math.round(v)}k`,
        }),
      pickCompanionPanel(quarters, "Quarter")
    )
  );
}

function genChartUnitTrap() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const values = months.map(() => randInt(143, 587));
  const quarterIdx = randInt(0, 3);
  const quarterMonths = [quarterIdx * 3, quarterIdx * 3 + 1, quarterIdx * 3 + 2];
  const quarterLabel = `Q${quarterIdx + 1} (${months[quarterMonths[0]]}–${months[quarterMonths[2]]})`;
  const total = quarterMonths.reduce((sum, i) => sum + values[i], 0);
  const adjIdx = quarterIdx < 3 ? quarterIdx + 1 : quarterIdx - 1;
  const adjacentMonths = [adjIdx * 3, adjIdx * 3 + 1, adjIdx * 3 + 2];
  const adjacentTotal = adjacentMonths.reduce((sum, i) => sum + values[i], 0);

  const prompt = `What was total revenue for ${quarterLabel}?`;

  const distractors = [
    values[quarterMonths[0]],
    Math.round(total / 3),
    adjacentTotal,
    Math.max(total - values[quarterMonths[1]], 1),
  ];

  const q = buildQuestion(
    "Reading carefully: summing the right months",
    prompt,
    total,
    distractors,
    (v) => `$${Math.round(v)}k`,
    `${quarterLabel} total = ${quarterMonths.map((i) => `$${values[i]}k`).join(" + ")} = $${total}k.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderDataTable(c, {
          title: "Monthly revenue ($000s)",
          columns: ["Month", "Revenue"],
          rows: months.map((m, i) => [m, `$${values[i]}k`]),
        }),
      pickCompanionPanel(months, "Month")
    )
  );
}

function genRankingIgnoreOtherPanel() {
  const regions = ["North", "South", "East", "West", "Central"];
  let revenue;
  do {
    revenue = regions.map(() => randInt(180, 920));
  } while (new Set(revenue).size !== revenue.length);
  const cost = regions.map(() => randInt(80, 700));

  const sortedIdx = revenue.map((_, i) => i).sort((a, b) => revenue[b] - revenue[a]);
  const secondIdx = sortedIdx[1];

  const prompt = `Which region had the second-highest revenue?`;

  const distractors = regions.filter((_, i) => i !== secondIdx);

  const q = buildQuestion(
    "Reading carefully: ranking",
    prompt,
    regions[secondIdx],
    distractors,
    (v) => v,
    `Ranked by revenue, highest to lowest: ${sortedIdx.map((i) => `${regions[i]} ($${revenue[i]}k)`).join(", ")}. ` +
      `The second-highest is ${regions[secondIdx]}. The cost figures aren't needed to answer this.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderBarChart(c, {
          title: "Annual revenue ($000s) by region",
          categories: regions,
          values: revenue,
          valueFormat: (v) => `$${Math.round(v)}k`,
        }),
      (c) =>
        renderBarChart(c, {
          title: "Operating cost ($000s) by region",
          categories: regions,
          values: cost,
          valueFormat: (v) => `$${Math.round(v)}k`,
        })
    )
  );
}

function genWhichBelowThresholdFromShareAndMarketSize() {
  const companies = ["Alpha Co", "Beta Inc", "Gamma Ltd", "Delta Group", "Epsilon Corp"];
  let shares;
  do {
    const raw = companies.map(() => randInt(4, 38));
    const sum = raw.reduce((a, b) => a + b, 0);
    shares = raw.map((v) => Math.round((v / sum) * 100));
    shares[0] += 100 - shares.reduce((a, b) => a + b, 0);
  } while (shares.some((s) => s <= 0));

  const years = ["2022", "2023", "2024"];
  const marketSize = [randInt(380, 920)];
  for (let i = 1; i < years.length; i++) marketSize.push(Math.round(marketSize[i - 1] * (1 + randInt(-5, 20) / 100)));
  const yIdx = randInt(0, years.length - 1);

  const revenues = shares.map((s) => Math.round((s / 100) * marketSize[yIdx]));
  const threshold = Math.round(marketSize[yIdx] * (choice([10, 14, 18, 22]) / 100));
  const belowIdx = revenues.map((_, i) => i).filter((i) => revenues[i] < threshold);
  if (belowIdx.length !== 1) return genWhichBelowThresholdFromShareAndMarketSize();
  const answerIdx = belowIdx[0];

  const prompt =
    `Based on ${years[yIdx]} industry revenue, which company's approximate revenue is NOT at least ` +
    `$${threshold}m?`;

  const distractors = companies.filter((_, i) => i !== answerIdx);

  const q = buildQuestion(
    "Reading carefully: which is NOT",
    prompt,
    companies[answerIdx],
    distractors,
    (v) => v,
    `${years[yIdx]} industry revenue = $${marketSize[yIdx]}m. Company revenue = share × $${marketSize[yIdx]}m: ` +
      `${companies.map((c, i) => `${c} ${shares[i]}% ≈ $${revenues[i]}m`).join(", ")}. Only ` +
      `${companies[answerIdx]} falls below $${threshold}m.`
  );

  return withChart(q, (container) =>
    renderTwoPanelsRandomOrder(
      container,
      (c) =>
        renderPieChart(c, {
          title: "Market share by company",
          segments: companies.map((label, i) => ({ label, value: shares[i] })),
          sliceLabelFormat: (v) => `${Math.round(v)}%`,
        }),
      (c) =>
        renderDataTable(c, {
          title: "Total industry revenue ($m) by year",
          columns: ["Year", "Revenue"],
          rows: years.map((y, i) => [y, `$${marketSize[i]}m`]),
        })
    )
  );
}

const STANDARD_GENERATORS = [
  genRevenueFromUnitsPrice,
  genMarginFromRevenueCost,
  genPricePerUnitFromRevenueUnits,
  genBlendedMarginFromShareAndMargin,
  genCompanyRevenueFromShareAndMarketSize,
  genAbsoluteGrowthFromRateAndBase,
  genPeakProfitFromRevenueAndCosts,
  genBarPercentChange,
  genLineCAGR,
  genStackedBar,
  genTableAverage,
  genTableGrowthRate,
  genLineForecast,
];

const CLOSE_READING_GENERATORS = [
  genChartExcludingOneOff,
  genChartUnitTrap,
  genRankingIgnoreOtherPanel,
  genWhichBelowThresholdFromShareAndMarketSize,
];

function buildQuestionSet() {
  // A handful of close-reading questions every attempt (a one-off item to
  // adjust for, the right months to sum, a negation, or a plausible but
  // unneeded companion panel), plus a random spread of standard chart/table
  // questions — some of which need only one data source, some both — to
  // fill out the rest.
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
  questionChart: document.getElementById("question-chart"),
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
  q.chartRender(el.questionChart);
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

  const elapsedSeconds = timedOut ? TARGET_SECONDS : Math.round((Date.now() - state.startedAt) / 1000);
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

  if (score >= 12) {
    el.resultsHeadline.textContent = "Strong result";
  } else if (score >= 8) {
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

    const heading = document.createElement("p");
    heading.className = "review-q";
    heading.textContent = `${i + 1}. [${q.category}] ${q.prompt}`;
    item.appendChild(heading);

    const chartDiv = document.createElement("div");
    chartDiv.className = "chart-wrap review-chart-wrap";
    q.chartRender(chartDiv);
    item.appendChild(chartDiv);

    const rest = document.createElement("div");
    rest.innerHTML = `
      <p class="review-answer">${answerLine}</p>
      <p class="review-answer">Correct answer: ${q.options[q.correctIndex]}</p>
      <p class="review-explain">${q.explanation}</p>
    `;
    item.appendChild(rest);

    el.reviewList.appendChild(item);
  });
}

/* ---------- progress chart (line chart of score across attempts) ---------- */

function renderProgressChart(history) {
  el.progressChart.innerHTML = "";

  if (history.length < 2) {
    const note = document.createElement("p");
    note.className = "progress-empty";
    note.textContent = history.length === 0 ? "No attempts recorded yet." : "Play again to start seeing your progress on a graph.";
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

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "progress-svg",
    role: "img",
    "aria-label": `Line chart of score out of ${TOTAL_QUESTIONS} across ${n} attempts, from ${history[0].score} to ${history[n - 1].score}`,
  });

  // gridlines + y-axis labels (fixed scale, since scores are always out of 15)
  [0, 3, 6, 9, 12, 15].forEach((tick) => {
    const y = yFor(tick);
    svg.appendChild(svgEl("line", { x1: marginLeft, x2: width - marginRight, y1: y, y2: y, class: "progress-gridline" }));
    const label = svgEl("text", {
      x: marginLeft - 6,
      y,
      "text-anchor": "end",
      "dominant-baseline": "middle",
      class: "progress-axis-label",
    });
    label.textContent = String(tick);
    svg.appendChild(label);
  });

  // x-axis attempt labels, thinned out if there are many attempts
  const step = Math.max(1, Math.ceil(n / 10));
  history.forEach((_, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const label = svgEl("text", { x: xFor(i), y: height - marginBottom + 16, "text-anchor": "middle", class: "progress-axis-label" });
    label.textContent = String(i + 1);
    svg.appendChild(label);
  });

  // the line itself
  let d = "";
  history.forEach((h, i) => {
    d += `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(h.score).toFixed(1)} `;
  });
  const path = svgEl("path", { d: d.trim(), class: "progress-line", fill: "none" });
  svg.appendChild(path);

  // crosshair, hidden until hover/focus
  const crosshair = svgEl("line", { y1: marginTop, y2: height - marginBottom, class: "progress-crosshair" });
  crosshair.style.opacity = "0";
  svg.appendChild(crosshair);

  const tooltip = document.createElement("div");
  tooltip.className = "progress-tooltip";
  tooltip.style.opacity = "0";

  history.forEach((h, i) => {
    const cx = xFor(i);
    const cy = yFor(h.score);

    const marker = svgEl("circle", { cx, cy, r: "4", class: "progress-marker" });
    svg.appendChild(marker);

    // generous, keyboard-reachable hit target (spec: >= 24px diameter)
    const hit = svgEl("circle", {
      cx,
      cy,
      r: "12",
      class: "progress-hit",
      tabindex: "0",
      "aria-label": `Attempt ${i + 1}: ${h.score} out of ${TOTAL_QUESTIONS}, completed in ${formatClock(h.elapsedSeconds)}`,
    });

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
