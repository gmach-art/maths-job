# Numerical Reasoning Trainer

A self-contained browser quiz for practicing the kind of numerical/verbal-numerical
word problems used in graduate and consulting job assessments (Bain SOVA,
BCG online test, SHL numerical reasoning, etc.).

## Running it

No build step or server required — just open `index.html` in a browser.

If you'd rather serve it locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## What it does

- Generates **10 multiple-choice word problems** per attempt, with randomised
  numbers so every playthrough is different.
- Covers ten topics, one question each, matching what these tests actually ask:
  algebra, weighted averages, speed/distance with objects travelling toward
  each other, simultaneous equations, successive percentage changes, ratios,
  work rate, compound growth, mixtures, and speed/distance catch-up problems.
- No charts, graphs, or diagrams — every question is a pure word problem, as
  requested.
- Shows a **countdown timer** against a **recommended completion time of
  15:00** (roughly 90 seconds per question, in line with real assessment
  centre pacing). The test auto-submits if time runs out.
- Answers lock in once selected (no changing your mind, like the real thing),
  and a full review with worked explanations is shown at the end.

## Files

- `index.html` — page structure and screens (start / quiz / results)
- `style.css` — styling
- `script.js` — question generators, quiz engine, timer, and DOM logic
