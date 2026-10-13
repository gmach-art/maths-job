"use strict";

/* Per-question-type performance, shared by every quiz on this device.

   Each quiz records, for every answered question, whether it was right and
   how long it took (from the question appearing to the answer being locked
   in). Quick Quiz reads this back to favour the question types you get wrong
   most often or spend longest on. Questions asked for in the Prep chat count
   toward accuracy only, not timing. Stored in local storage as
   { "<bank>:<typeId>": { label, attempts, wrong, timedAttempts, totalSeconds } }. */
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

  // Entries saved before untimed answers existed had every attempt timed.
  function timedAttemptsOf(entry) {
    return entry.timedAttempts ?? entry.attempts;
  }

  function avgSeconds(entry) {
    const timed = entry ? timedAttemptsOf(entry) : 0;
    return timed ? entry.totalSeconds / timed : null;
  }

  // Pass `seconds` as null for an untimed answer (counts toward accuracy only).
  function record(bank, question, correct, seconds) {
    if (!question || !question.typeId) return;
    const stats = load();
    const key = `${bank}:${question.typeId}`;
    const entry = stats[key] || { label: question.category, attempts: 0, wrong: 0, timedAttempts: 0, totalSeconds: 0 };
    entry.timedAttempts = timedAttemptsOf(entry);
    entry.label = question.category;
    entry.attempts += 1;
    if (!correct) entry.wrong += 1;
    if (seconds !== null) {
      entry.timedAttempts += 1;
      entry.totalSeconds += Math.min(Math.max(seconds, 0), MAX_SECONDS_COUNTED);
    }
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
    const avg = avgSeconds(entry);
    const slowness = avg === null ? 0 : Math.min(Math.max(avg / targetSecondsPerQuestion - 0.75, 0), 1.25);
    return 0.15 + errorRate + 0.5 * slowness;
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nothing to clear
    }
  }

  return { load, record, get, weight, avgSeconds, clear };
})();
