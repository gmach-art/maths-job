"use strict";

const FOLLOWED_COMPANIES_KEY = "jobSearchFollowedCompanies";

/* Set this to your deployed news-proxy Worker URL (see worker/README.md) to
   get real article links. Left empty, the News subsection falls back to a
   plain "Search for news" link instead of specific articles. */
const NEWS_API_ENDPOINT = "";

const ARTICLES_PER_QUERY = 3;
const ARTICLE_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
const ARTICLE_CACHE_PREFIX = "jobSearchNewsCache:";

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

/* Known competitor relationships. Deliberately short: only companies you've
   explicitly told us are competitors go here — this app never guesses a
   competitor relationship on its own. Send over more pairs and we'll add
   them. Anything not listed here starts with no competitors, and you can
   add them by hand in the News subsection. */
const KNOWN_COMPETITORS = {
  sunsave: ["Project Solar UK"],
  "project solar uk": ["Sunsave"],
};

function keyFor(name) {
  return name.trim().toLowerCase();
}

function newsSearchUrl(name) {
  return `https://news.google.com/search?q=${encodeURIComponent(name)}`;
}

/* ---------- real article fetching (via the optional news-proxy worker) ---------- */

function readArticleCache(query) {
  try {
    const raw = sessionStorage.getItem(ARTICLE_CACHE_PREFIX + keyFor(query));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.cachedAt > ARTICLE_CACHE_TTL_MS) return null;
    return entry.articles;
  } catch (e) {
    return null;
  }
}

function writeArticleCache(query, articles) {
  try {
    sessionStorage.setItem(
      ARTICLE_CACHE_PREFIX + keyFor(query),
      JSON.stringify({ articles, cachedAt: Date.now() })
    );
  } catch (e) {
    // Storage unavailable — just skip caching.
  }
}

/**
 * Returns { articles: [{title, link, source, publishedAt}], usedFallback }.
 * usedFallback is true when NEWS_API_ENDPOINT isn't configured or the
 * request failed, meaning `articles` is empty and callers should show a
 * plain search link instead.
 */
async function fetchArticles(query) {
  if (!NEWS_API_ENDPOINT) return { articles: [], usedFallback: true };

  const cached = readArticleCache(query);
  if (cached) return { articles: cached, usedFallback: false };

  try {
    const response = await fetch(
      `${NEWS_API_ENDPOINT}?q=${encodeURIComponent(query)}`
    );
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    const articles = Array.isArray(data.articles) ? data.articles.slice(0, ARTICLES_PER_QUERY) : [];
    writeArticleCache(query, articles);
    return { articles, usedFallback: articles.length === 0 };
  } catch (e) {
    return { articles: [], usedFallback: true };
  }
}

/* ---------- followed companies (persisted locally per browser) ---------- */

function loadFollowedCompanies() {
  try {
    const raw = localStorage.getItem(FOLLOWED_COMPANIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Migrate older shapes (plain strings, then {name, competitors}).
    return parsed.map((entry) => {
      if (typeof entry === "string") return { name: entry, competitors: [], industryKeywords: [] };
      return { industryKeywords: [], ...entry };
    });
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
    companies.push({ name: trimmed, competitors: [...suggestedCompetitors], industryKeywords: [] });
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

function addIndustryKeyword(companyName, keyword) {
  const trimmed = keyword.trim();
  if (!trimmed) return loadFollowedCompanies();

  const companies = loadFollowedCompanies();
  const company = companies.find((c) => c.name === companyName);
  if (company && !company.industryKeywords.some((k) => keyFor(k) === keyFor(trimmed))) {
    company.industryKeywords.push(trimmed);
    saveFollowedCompanies(companies);
  }
  return companies;
}

function removeIndustryKeyword(companyName, keyword) {
  const companies = loadFollowedCompanies();
  const company = companies.find((c) => c.name === companyName);
  if (company) {
    company.industryKeywords = company.industryKeywords.filter((k) => k !== keyword);
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

/* Renders either real article links (once fetched) or a single fallback
   search link into `container`, for the given query. */
async function renderArticleLinks(container, query, emptyLabel) {
  container.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "articles-loading";
  loading.textContent = "Loading news…";
  container.appendChild(loading);

  const { articles, usedFallback } = await fetchArticles(query);
  container.innerHTML = "";

  if (usedFallback || articles.length === 0) {
    const fallback = document.createElement("a");
    fallback.className = "news-search-fallback";
    fallback.href = newsSearchUrl(query);
    fallback.target = "_blank";
    fallback.rel = "noopener noreferrer";
    fallback.textContent = emptyLabel || `Search for news about ${query} ↗`;
    container.appendChild(fallback);
    return;
  }

  const list = document.createElement("ul");
  list.className = "article-list";
  articles.forEach((article) => {
    const item = document.createElement("li");
    item.className = "article-item";

    const link = document.createElement("a");
    link.className = "article-link";
    link.href = article.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    item.appendChild(link);

    if (article.source) {
      const meta = document.createElement("span");
      meta.className = "article-source";
      meta.textContent = article.source;
      item.appendChild(meta);
    }

    list.appendChild(item);
  });
  container.appendChild(list);
}

function renderCompaniesNews() {
  const companies = loadFollowedCompanies();
  el.companiesNewsList.innerHTML = "";

  if (companies.length === 0) {
    const note = document.createElement("p");
    note.className = "companies-empty";
    note.textContent = "Follow a company above to see company and industry news for it here.";
    el.companiesNewsList.appendChild(note);
    return;
  }

  companies.forEach((company) => {
    const card = document.createElement("div");
    card.className = "company-news-card";

    const heading = document.createElement("div");
    heading.className = "company-news-heading";
    heading.textContent = company.name;
    card.appendChild(heading);

    /* --- Company news --- */
    const companySection = document.createElement("div");
    companySection.className = "news-group";
    const companyLabel = document.createElement("span");
    companyLabel.className = "news-group-label";
    companyLabel.textContent = "Company news";
    companySection.appendChild(companyLabel);
    const companyArticles = document.createElement("div");
    companySection.appendChild(companyArticles);
    card.appendChild(companySection);
    renderArticleLinks(companyArticles, company.name);

    /* --- Industry news: keyword-driven trend articles + competitor articles --- */
    const industrySection = document.createElement("div");
    industrySection.className = "news-group industry-group";
    const industryLabel = document.createElement("span");
    industryLabel.className = "news-group-label";
    industryLabel.textContent = "Industry news";
    industrySection.appendChild(industryLabel);

    if (company.industryKeywords.length === 0 && company.competitors.length === 0) {
      const empty = document.createElement("p");
      empty.className = "articles-empty";
      empty.textContent = "No industry topics or competitors added yet.";
      industrySection.appendChild(empty);
    } else {
      company.industryKeywords.forEach((keyword) => {
        const topic = document.createElement("div");
        topic.className = "industry-topic";
        const topicHeader = document.createElement("div");
        topicHeader.className = "industry-topic-header";

        const topicLabel = document.createElement("span");
        topicLabel.className = "industry-topic-label";
        topicLabel.textContent = keyword;
        topicHeader.appendChild(topicLabel);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "competitor-chip-remove";
        removeBtn.setAttribute("aria-label", `Remove industry topic "${keyword}" from ${company.name}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => {
          removeIndustryKeyword(company.name, keyword);
          renderCompaniesNews();
        });
        topicHeader.appendChild(removeBtn);

        topic.appendChild(topicHeader);
        const topicArticles = document.createElement("div");
        topic.appendChild(topicArticles);
        industrySection.appendChild(topic);
        renderArticleLinks(topicArticles, keyword);
      });

      company.competitors.forEach((competitor) => {
        const topic = document.createElement("div");
        topic.className = "industry-topic";
        const topicHeader = document.createElement("div");
        topicHeader.className = "industry-topic-header";

        const topicLabel = document.createElement("span");
        topicLabel.className = "industry-topic-label";
        topicLabel.textContent = `Competitor: ${competitor}`;
        topicHeader.appendChild(topicLabel);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "competitor-chip-remove";
        removeBtn.setAttribute("aria-label", `Remove ${competitor} as a competitor of ${company.name}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => {
          removeCompetitor(company.name, competitor);
          renderCompaniesNews();
        });
        topicHeader.appendChild(removeBtn);

        topic.appendChild(topicHeader);
        const topicArticles = document.createElement("div");
        topic.appendChild(topicArticles);
        industrySection.appendChild(topic);
        renderArticleLinks(topicArticles, competitor);
      });
    }

    const addRow = document.createElement("div");
    addRow.className = "industry-add-row";

    addRow.appendChild(
      buildAddForm(`Add an industry topic for ${company.name}`, "Add an industry topic…", (value) => {
        addIndustryKeyword(company.name, value);
        renderCompaniesNews();
      })
    );
    addRow.appendChild(
      buildAddForm(`Add a competitor of ${company.name}`, "Add a competitor…", (value) => {
        addCompetitor(company.name, value);
        renderCompaniesNews();
      })
    );

    industrySection.appendChild(addRow);
    card.appendChild(industrySection);

    el.companiesNewsList.appendChild(card);
  });
}

function buildAddForm(ariaLabel, placeholder, onSubmit) {
  const form = document.createElement("form");
  form.className = "add-competitor-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "add-competitor-input";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", ariaLabel);
  input.autocomplete = "off";

  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "link-btn";
  btn.textContent = "+ Add";

  form.appendChild(input);
  form.appendChild(btn);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(input.value);
  });

  return form;
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
