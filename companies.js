"use strict";

const FOLLOWED_COMPANIES_KEY = "jobSearchFollowedCompanies";

/* ---------- followed companies (persisted locally per browser) ---------- */

function loadFollowedCompanies() {
  try {
    const raw = localStorage.getItem(FOLLOWED_COMPANIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
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
  const alreadyFollowed = companies.some((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (!alreadyFollowed) {
    companies.push(trimmed);
    saveFollowedCompanies(companies);
  }
  return companies;
}

function unfollowCompany(name) {
  const companies = loadFollowedCompanies().filter((c) => c !== name);
  saveFollowedCompanies(companies);
  return companies;
}

/* ---------- DOM wiring ---------- */

const el = {
  followForm: document.getElementById("follow-form"),
  companySearchInput: document.getElementById("company-search-input"),
  followedCompaniesList: document.getElementById("followed-companies-list"),
  companiesNewsList: document.getElementById("companies-news-list"),
};

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

  companies.forEach((name) => {
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

function renderCompaniesNews() {
  const companies = loadFollowedCompanies();
  el.companiesNewsList.innerHTML = "";

  if (companies.length === 0) {
    const note = document.createElement("p");
    note.className = "companies-empty";
    note.textContent = "Follow a company above to see news links for it here.";
    el.companiesNewsList.appendChild(note);
    return;
  }

  companies.forEach((name) => {
    const item = document.createElement("a");
    item.className = "company-news-item";
    item.href = `https://news.google.com/search?q=${encodeURIComponent(name)}`;
    item.target = "_blank";
    item.rel = "noopener noreferrer";
    item.innerHTML = `
      <span class="company-news-name">${name}</span>
      <span class="company-news-link">Latest news &rarr;</span>
    `;
    el.companiesNewsList.appendChild(item);
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
