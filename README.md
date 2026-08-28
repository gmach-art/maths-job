# Numerical Reasoning Trainer

A self-contained browser quiz for practicing the kind of numerical/verbal-numerical
word problems used in graduate and consulting job assessments (Bain SOVA,
BCG online test, SHL numerical reasoning, etc.).

## Running it

No build step or server required — just open `index.html` in a browser. It
opens on a main menu with three sections: **Companies**, **Networking**, and
**Prep**. Prep opens its own submenu of practice tools, currently just the
Numerical Reasoning quiz described below.

Companies has two subsections: **Following**, where you search for and
follow companies you're interested in — big or small, e.g. Google, Meta,
Feedr, Rogo — and **News**, which for each followed company shows a link to
its own news plus a link for each of its direct competitors (e.g. following
Sunsave surfaces Project Solar UK as a competitor). A handful of well-known
competitor relationships are prefilled automatically; for anything else you
can add competitors by hand. Followed companies and their competitors are
saved in the browser's local storage.

If you'd rather serve it locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## What the Prep quiz does

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

- `index.html` — main menu (Companies / Networking / Prep)
- `menu.css` — shared menu styling (main menu and submenus)
- `companies.html` — companies section (Following + News subsections)
- `companies.js` — follow/unfollow logic and localStorage persistence
- `networking.html` — networking section (placeholder)
- `prep.html` — prep submenu (currently just Numerical Reasoning Test)
- `numerical-reasoning.html` — quiz page structure and screens (start / quiz / results)
- `style.css` — quiz styling
- `script.js` — question generators, quiz engine, timer, and DOM logic
