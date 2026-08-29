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
- `companies.js` — follow/unfollow, competitors, industry topics, and
  real-article fetching (with search-link fallback)
- `worker/news-proxy.js` — optional free Cloudflare Worker that fetches real
  article links for the News subsection (see `worker/README.md`)
- `networking.html` — networking section (placeholder)
- `prep.html` — prep submenu (currently just Numerical Reasoning Test)
- `numerical-reasoning.html` — quiz page structure and screens (start / quiz / results)
- `style.css` — quiz styling
- `script.js` — question generators, quiz engine, timer, and DOM logic
