# Numerical Reasoning Trainer

A self-contained browser quiz for practicing the kind of numerical/verbal-numerical
word problems used in graduate and consulting job assessments (Bain SOVA,
BCG online test, SHL numerical reasoning, etc.).

## Running it

No build step or server required — just open `index.html` in a browser. It
opens on a main menu with three sections: **Companies**, **Networking**, and
**Prep**. Prep opens its own submenu of practice tools: the Numerical
Reasoning quiz and the Data Analysis quiz, both described below.

Companies has two subsections: **Following**, where you search for and
follow companies you're interested in — big or small, e.g. Google, Meta,
Feedr, Rogo — and **News**, which for each followed company splits into:

- **Company news** — articles about the company itself.
- **Industry news** — articles about broader trends you tag as relevant
  (e.g. "office attendance trends" for a B2B workplace-food company), plus
  articles about its direct competitors.

Competitor relationships are **never guessed** — a company only shows a
competitor if it's in the small `KNOWN_COMPETITORS` map in `companies.js`
(currently just Sunsave ↔ Project Solar UK) or you've added it by hand from
the News subsection. Industry topics work the same way: add whatever's
relevant with "+ Add" under a company's Industry news.

Followed companies, their competitors, and their industry topics are saved
in the browser's local storage.

### Real article links (optional)

By default, News links fall back to a plain "Search for news" link. To get
actual article links (title, source, real publisher URL) instead of a
search page, deploy the small free news proxy in `worker/` (a Cloudflare
Worker, no API key or fees — see `worker/README.md`) and set its URL as
`NEWS_API_ENDPOINT` at the top of `companies.js`.

If you'd rather serve it locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## What the Prep quiz does

- Generates **10 multiple-choice questions** per attempt, with randomised
  numbers so every playthrough is different: **one LSAT-style logic game**
  every time (a scheduling or grouping constraint-satisfaction puzzle — six
  people assigned to three groups under a handful of stated rules; pick the
  one candidate assignment consistent with all of them), **4 close-reading
  questions** (a negation, a direction-of-adjustment trap, an irrelevant
  distraction, or a unit mismatch — details that are easy to miss), plus 5
  more sampled from a pool of word-problem and case/accounting topics
  (algebra, weighted averages, speed/distance, simultaneous equations,
  percentages, ratios, work rate, compound growth, mixtures, gross margin,
  break-even analysis, contribution margin, and payback period).
- No charts, graphs, or diagrams — every question is text only, as requested;
  the logic game states its rules as a plain numbered list.
- Shows a **countdown timer** against a **recommended completion time of
  11:00** (about 66 seconds per question — a tighter pace than a typical
  assessment centre). The test auto-submits if time runs out.
- Answers lock in once selected (no changing your mind, like the real thing),
  and a full review with worked explanations is shown at the end.
- Most questions require at least two reasoning steps (e.g. solving for an
  intermediate value before the final answer, or compounding a rate across
  multiple periods) rather than a single formula application, and numbers
  are kept deliberately non-round so they can't be estimated at a glance.

## What the Data Analysis quiz does

- Generates **15 multiple-choice questions** per attempt, each built around a
  freshly randomised bar chart, line chart, pie chart, stacked bar chart, or
  data table — the kind of chart-reading and data-interpretation questions
  used in consulting numerical reasoning tests (Bain SOVA, BCG online test).
- Every question pairs **two labelled data sources** — two graphs, or a
  graph and a small table — from the same scenario. Around half the
  questions genuinely need both (a rate from one source and a base from the
  other, a share and a total, two related series) to compute the answer;
  the rest need only one, paired with a plausible financial or operational
  companion (cost, price, units, prior-year revenue, growth rate, budget —
  never an unrelated filler stat) that simply isn't needed for that
  particular calculation. Either way, which source matters isn't given away
  by its content, any label, or always appearing first.
- Covers question types including: units × price, revenue minus cost into a
  margin, revenue ÷ units into a price point, a pie share blended against a
  margin table, a pie share applied to a total from a separate table, a
  growth rate applied to a prior-year base, finding peak profit from
  separate revenue and cost sources, two-period percentage change, CAGR
  from a chart or a table, a stacked chart's share-of-total change,
  comparing a store's average against the overall average, and compound
  trend forecasting — plus **4 close-reading questions** every time (a
  one-off item to adjust for, the right months to sum, a ranking question
  with a plausible-but-unneeded companion chart, or a "which is NOT"
  negation that requires computing every option from two sources rather
  than reading one value off a threshold).
- Shows a **countdown timer** against a **recommended completion time of
  18:00** (about 72 seconds per question). The test auto-submits if time
  runs out.
- Same presentation as the Numerical Reasoning Trainer: answers lock in once
  selected, a full review (with the original chart or table alongside each
  worked explanation) is shown at the end, and a line graph tracks your score
  out of 15 across every attempt on this device.
- Numbers are kept deliberately non-round so they can't be estimated at a
  glance, and no question reduces to a single direct read or a plain
  subtraction of two displayed values.

## Files

- `index.html` — main menu (Companies / Networking / Prep)
- `menu.css` — shared menu styling (main menu and submenus)
- `companies.html` — companies section (Following + News subsections)
- `companies.js` — follow/unfollow, competitors, industry topics, and
  real-article fetching (with search-link fallback)
- `worker/news-proxy.js` — optional free Cloudflare Worker that fetches real
  article links for the News subsection (see `worker/README.md`)
- `networking.html` — networking section (placeholder)
- `prep.html` — prep submenu (Numerical Reasoning Test, Data Analysis)
- `numerical-reasoning.html` — quiz page structure and screens (start / quiz / results)
- `script.js` — numerical reasoning question generators, quiz engine, timer, and DOM logic
- `data-analysis.html` — data analysis quiz page structure and screens (start / quiz / results)
- `data-analysis.js` — chart/table renderers, question generators, quiz engine, timer, and DOM logic
- `style.css` — shared quiz styling (both trainers) plus chart and data-table styles
