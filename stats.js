"use strict";

/* Per-question-type performance, shared by every quiz on this device.

   Each quiz records, for every answered question, whether it was right and
   how long it took (from the question appearing to the answer being locked
   in). Quick Quiz reads this back to favour the question types you get wrong
   most often or spend longest on. Stored in local storage as
   { "<bank>:<typeId>": { label, attempts, wrong, totalSeconds } }. */
window.QuestionStats = (() => {
  const KEY = "questionTypeStats";
  const MAX_SECONDS_COUNTED = 600; // a question left open for ages shouldn't swamp the average

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function save(stats) {
    try {
      localStorage.setItem(KEY, JSON.stringify(stats));
    } catch {
      // storage unavailable (private browsing etc.) — stats just won't persist
    }
  }

  function record(bank, question, correct, seconds) {
    if (!question || !question.typeId) return;
    const stats = load();
    const key = `${bank}:${question.typeId}`;
    const entry = stats[key] || { label: question.category, attempts: 0, wrong: 0, totalSeconds: 0 };
    entry.label = question.category;
    entry.attempts += 1;
    if (!correct) entry.wrong += 1;
    entry.totalSeconds += Math.min(Math.max(seconds, 0), MAX_SECONDS_COUNTED);
    stats[key] = entry;
    save(stats);
  }

  function get(bank, typeId) {
    return load()[`${bank}:${typeId}`] || null;
  }

  /**
   * How strongly Quick Quiz should favour a question type. Error rate is
   * smoothed so one bad attempt doesn't dominate and unseen types still turn
   * up; slowness only counts once the average passes ~75% of the target pace.
   */
  function weight(bank, typeId, targetSecondsPerQuestion) {
    const entry = get(bank, typeId);
    const attempts = entry ? entry.attempts : 0;
    const wrong = entry ? entry.wrong : 0;
    const errorRate = (wrong + 1) / (attempts + 3);
    const avgSeconds = attempts ? entry.totalSeconds / attempts : 0;
    const slowness = attempts ? Math.min(Math.max(avgSeconds / targetSecondsPerQuestion - 0.75, 0), 1.25) : 0;
    return 0.15 + errorRate + 0.5 * slowness;
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nothing to clear
    }
  }

  return { load, record, get, weight, clear };
})();
