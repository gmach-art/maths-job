"use strict";

const FOLLOWED_COMPANIES_KEY = "jobSearchFollowedCompanies";

/* Suggestions for the search box only — typing any other name (big company or
   small startup) still works, this list never restricts what you can follow. */
const COMPANY_SUGGESTIONS = [
  "Google",
  "Meta",
  "Amazon",
  "Microsoft",
  "Apple",
  "Feedr",
  "Rogo",
  "Sunsave",
  "Project Solar UK",
];

/* Known competitor relationships, used only to prefill the Competitors list
   when you follow a company we happen to recognise. Anything not listed here
   simply starts with no competitors — add them by hand in the News
   subsection, so this works just as well for a company we've never heard of. */
const KNOWN_COMPETITORS = {
  google: ["Microsoft", "Meta"],
  meta: ["Google", "Snap"],
  amazon: ["Walmart", "Alibaba"],
  microsoft: ["Google", "Amazon"],
  apple: ["Samsung", "Google"],
  sunsave: ["Project Solar UK"],
  "project solar uk": ["Sunsave"],
  feedr: ["Just Eat for Business"],
  rogo: ["AlphaSense"],
};

function keyFor(name) {
  return name.trim().toLowerCase();
}

function newsSearchUrl(name) {
  return `https://news.google.com/search?q=${encodeURIComponent(name)}`;
}

/* ---------- followed companies (persisted locally per browser) ---------- */

function loadFollowedCompanies() {
  try {
    const raw = localStorage.getItem(FOLLOWED_COMPANIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Migrate the plain string[] shape used before competitors existed.
    return parsed.map((entry) =>
      typeof entry === "string" ? { name: entry, competitors: [] } : entry
    );
  } catch (e) {
    return [];
  }
}

function saveFollowedCompanies(companies) {
  try {
    localStorage.setItem(FOLLOWED_COMPANIES_KEY, JSON.stringify(companies));
  } catch (e) {
    // Storage unavailable (private browsing, quota, etc.) — list just won't persist.
  }
}

function followCompany(name) {
  const trimmed = name.trim();
  if (!trimmed) return loadFollowedCompanies();

  const companies = loadFollowedCompanies();
  const alreadyFollowed = companies.some((c) => keyFor(c.name) === keyFor(trimmed));
  if (!alreadyFollowed) {
    const suggestedCompetitors = KNOWN_COMPETITORS[keyFor(trimmed)] || [];
    companies.push({ name: trimmed, competitors: [...suggestedCompetitors] });
    saveFollowedCompanies(companies);
  }
  return companies;
}

function unfollowCompany(name) {
  const companies = loadFollowedCompanies().filter((c) => c.name !== name);
  saveFollowedCompanies(companies);
  return companies;
}

function addCompetitor(companyName, competitorName) {
  const trimmed = competitorName.trim();
  if (!trimmed) return loadFollowedCompanies();

  const companies = loadFollowedCompanies();
  const company = companies.find((c) => c.name === companyName);
  if (company && !company.competitors.some((c) => keyFor(c) === keyFor(trimmed))) {
    company.competitors.push(trimmed);
    saveFollowedCompanies(companies);
  }
  return companies;
}

function removeCompetitor(companyName, competitorName) {
  const companies = loadFollowedCompanies();
  const company = companies.find((c) => c.name === companyName);
  if (company) {
    company.competitors = company.competitors.filter((c) => c !== competitorName);
    saveFollowedCompanies(companies);
  }
  return companies;
}

/* ---------- DOM wiring ---------- */

const el = {
  followForm: document.getElementById("follow-form"),
  companySearchInput: document.getElementById("company-search-input"),
  companySuggestions: document.getElementById("company-suggestions"),
  followedCompaniesList: document.getElementById("followed-companies-list"),
  companiesNewsList: document.getElementById("companies-news-list"),
};

el.companySuggestions.innerHTML = COMPANY_SUGGESTIONS.map(
  (name) => `<option value="${name.replace(/"/g, "&quot;")}"></option>`
).join("");

function renderFollowedCompanies() {
  const companies = loadFollowedCompanies();
  el.followedCompaniesList.innerHTML = "";

  if (companies.length === 0) {
    const note = document.createElement("p");
    note.className = "companies-empty";
    note.textContent = "You aren't following any companies yet. Search for one above to get started.";
    el.followedCompaniesList.appendChild(note);
    return;
  }

  companies.forEach(({ name }) => {
    const chip = document.createElement("div");
    chip.className = "company-chip";

    const label = document.createElement("span");
    label.className = "company-chip-name";
    label.textContent = name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "company-chip-remove";
    removeBtn.setAttribute("aria-label", `Unfollow ${name}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      unfollowCompany(name);
      renderFollowedCompanies();
      renderCompaniesNews();
    });

    chip.appendChild(label);
    chip.appendChild(removeBtn);
    el.followedCompaniesList.appendChild(chip);
  });
}

function newsLink(name, extraClass) {
  const link = document.createElement("a");
  link.className = extraClass;
  link.href = newsSearchUrl(name);
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const label = document.createElement("span");
  label.textContent = name;
  const arrow = document.createElement("span");
  arrow.className = "news-link-arrow";
  arrow.textContent = "↗";

  link.appendChild(label);
  link.appendChild(arrow);
  return link;
}

function renderCompaniesNews() {
  const companies = loadFollowedCompanies();
  el.companiesNewsList.innerHTML = "";

  if (companies.length === 0) {
    const note = document.createElement("p");
    note.className = "companies-empty";
    note.textContent = "Follow a company above to see news links for it (and its competitors) here.";
    el.companiesNewsList.appendChild(note);
    return;
  }

  companies.forEach((company) => {
    const card = document.createElement("div");
    card.className = "company-news-card";

    const main = document.createElement("div");
    main.className = "company-news-main";

    const name = document.createElement("span");
    name.className = "company-news-name";
    name.textContent = company.name;
    main.appendChild(name);
    main.appendChild(newsLink(company.name, "company-news-link"));
    card.appendChild(main);

    const competitorsSection = document.createElement("div");
    competitorsSection.className = "company-competitors";

    const label = document.createElement("span");
    label.className = "competitors-label";
    label.textContent = "Direct competitors";
    competitorsSection.appendChild(label);

    if (company.competitors.length === 0) {
      const empty = document.createElement("p");
      empty.className = "competitors-empty";
      empty.textContent = "No competitors added yet.";
      competitorsSection.appendChild(empty);
    } else {
      const chipRow = document.createElement("div");
      chipRow.className = "competitor-chips";

      company.competitors.forEach((competitor) => {
        const wrap = document.createElement("div");
        wrap.className = "competitor-chip-wrap";

        wrap.appendChild(newsLink(competitor, "competitor-chip"));

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "competitor-chip-remove";
        removeBtn.setAttribute("aria-label", `Remove ${competitor} as a competitor of ${company.name}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => {
          removeCompetitor(company.name, competitor);
          renderCompaniesNews();
        });
        wrap.appendChild(removeBtn);

        chipRow.appendChild(wrap);
      });
      competitorsSection.appendChild(chipRow);
    }

    const addForm = document.createElement("form");
    addForm.className = "add-competitor-form";

    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "add-competitor-input";
    addInput.placeholder = "Add a competitor…";
    addInput.setAttribute("aria-label", `Add a competitor of ${company.name}`);
    addInput.autocomplete = "off";

    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "link-btn";
    addBtn.textContent = "+ Add competitor";

    addForm.appendChild(addInput);
    addForm.appendChild(addBtn);
    addForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addCompetitor(company.name, addInput.value);
      renderCompaniesNews();
    });
    competitorsSection.appendChild(addForm);

    card.appendChild(competitorsSection);
    el.companiesNewsList.appendChild(card);
  });
}

el.followForm.addEventListener("submit", (e) => {
  e.preventDefault();
  followCompany(el.companySearchInput.value);
  el.companySearchInput.value = "";
  el.companySearchInput.focus();
  renderFollowedCompanies();
  renderCompaniesNews();
});

renderFollowedCompanies();
renderCompaniesNews();
