(() => {
  "use strict";

  const M = window.BIGRAM;
  const CHARS = M.chars;                         // ['.', 'a', ..., 'z']; '.' = start/end
  const IDX = Object.fromEntries(CHARS.map((c, i) => [c, i]));
  const REAL = new Set(M.names);
  const $ = (id) => document.getElementById(id);

  const FULL = "█", EMPTY = "░";
  const GREEN = "var(--green)", AMBER = "var(--amber)", RED = "var(--red)";

  let brain = "counting";
  const table = () => M.tables[brain];

  const NOTES = {
    counting: "count → tallied which letter follows which",
    neural: "practice → random guesses, corrected 1,000 times",
  };

  // ---------- helpers ----------
  const clean = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
  const quote = (c) => `"${c}"`;
  const bar = (k, width, color) =>
    `<span style="color:${color}">${FULL.repeat(k)}</span><span style="color:#263026">${EMPTY.repeat(width - k)}</span>`;

  function pick(probs, temperature) {
    // Raise each chance to 1/temperature: low = play it safe, high = take risks.
    const w = probs.map((p) => Math.pow(p, 1 / temperature));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return w.length - 1;
  }

  function makeName(prefix, temperature) {
    const P = table();
    let out = prefix;
    let ix = prefix ? IDX[prefix[prefix.length - 1]] : 0;
    while (out.length < 20) {
      ix = pick(P[ix], temperature);
      if (ix === 0) break;
      out += CHARS[ix];
    }
    return out;
  }

  // Each step of a name: [from, to, chance]. Includes the start and the end.
  function steps(word) {
    const P = table();
    const seq = [0, ...[...word].map((c) => IDX[c]), 0];
    const out = [];
    for (let i = 0; i < seq.length - 1; i++) out.push([seq[i], seq[i + 1], P[seq[i]][seq[i + 1]]]);
    return out;
  }

  const avgLog = (word) => {
    const s = steps(word);
    return s.reduce((a, [, , p]) => a + Math.log(p), 0) / s.length;
  };

  // Compare a typed name with how every real name scores, so the result reads
  // as "more name-like than X% of real names" instead of a raw number.
  const realScores = {};
  function percentile(score) {
    if (!realScores[brain]) realScores[brain] = Float64Array.from(M.names.map(avgLog)).sort();
    const arr = realScores[brain];
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < score) lo = mid + 1; else hi = mid;
    }
    return (lo / arr.length) * 100;
  }

  const chanceColor = (p) => (p >= 0.08 ? GREEN : p >= 0.02 ? AMBER : RED);

  function oneIn(p) {
    if (p >= 0.5) return "more often than not";
    return `~1 time in ${Math.round(1 / p).toLocaleString()}`;
  }

  // ---------- 1. make names ----------
  const wild = $("wildness");
  const temperature = () => 0.4 * Math.pow(6.25, wild.value / 100); // 0.4 .. 1 .. 2.5

  function wildLabel() {
    const v = +wild.value;
    $("wild-label").textContent =
      v < 20 ? "very safe" : v < 40 ? "safe" : v <= 60 ? "normal" : v < 80 ? "wild" : "chaotic";
  }

  let kept = [];
  try { kept = JSON.parse(localStorage.getItem("kept-names") || "[]"); } catch (_) { kept = []; }
  const saveKept = () => { try { localStorage.setItem("kept-names", JSON.stringify(kept)); } catch (_) {} };

  function toggleKept(n) {
    kept = kept.includes(n) ? kept.filter((k) => k !== n) : [...kept, n];
    saveKept(); renderKept(); syncKeptMarks();
  }

  function renderKept() {
    $("kept-box").hidden = kept.length === 0;
    $("kept").replaceChildren(...kept.map((n, i) => {
      const s = document.createElement("span");
      s.textContent = (i ? ", " : "") + n;
      s.style.cursor = "pointer";
      s.title = "tap to remove";
      s.onclick = () => toggleKept(n);
      return s;
    }));
  }

  function syncKeptMarks() {
    for (const li of $("made").children) li.classList.toggle("kept", kept.includes(li.dataset.name));
  }

  function makeBatch() {
    const prefix = clean($("prefix").value);
    $("prefix").value = prefix;
    const T = temperature();
    const names = new Set();
    for (let tries = 0; names.size < 12 && tries < 200; tries++) {
      const n = makeName(prefix, T);
      if (n.length > 1 || (n.length === 1 && prefix)) names.add(n);
    }
    let realCount = 0;
    $("made").replaceChildren(...[...names].map((n, i) => {
      const li = document.createElement("li");
      li.dataset.name = n;
      li.style.animationDelay = `${i * 40}ms`;
      li.textContent = n;
      if (REAL.has(n)) {
        realCount++;
        const t = document.createElement("span");
        t.className = "tag";
        t.textContent = "real";
        li.append(t);
      }
      li.title = "tap to keep";
      li.onclick = () => toggleKept(n);
      return li;
    }));
    syncKeptMarks();
    $("made-hint").textContent =
      "// tap a name to keep it. " +
      (realCount
        ? `${realCount} marked real = already in its list, found by chance.`
        : "none of these are in its list. all invented.");
  }

  // ---------- 2. score a name ----------
  const VERDICTS = [
    [60, "NAME", "definitely a name", GREEN],
    [30, "OK", "sounds like a real name", GREEN],
    [10, "HMM", "unusual, but possible", AMBER],
    [2, "ODD", "that's a stretch", AMBER],
    [-1, "NOPE", "keyboard smash", RED],
  ];

  function scoreName() {
    const word = clean($("test-name").value);
    const box = $("verdict");
    if (!word) { box.hidden = true; return; }
    box.hidden = false;

    const pct = percentile(avgLog(word));
    const [, tag, text, color] = VERDICTS.find(([min]) => pct > min);
    $("verdict-emoji").textContent = tag;
    $("verdict-emoji").style.background = color;
    $("verdict-text").textContent = text;
    const nice = Math.round(pct);
    $("verdict-sub").textContent =
      (nice >= 99 ? "more name-like than almost every real name"
        : nice <= 0 ? "less name-like than every real name"
        : `more name-like than ${nice}% of real names`) +
      (REAL.has(word) ? " (it's in the list)" : "");

    $("meter-fill").innerHTML = bar(Math.max(1, Math.round((pct / 100) * 30)), 30, color);

    const s = steps(word);
    $("letters").replaceChildren(...s.map(([from, to, p]) => {
      const span = document.createElement("span");
      span.textContent = to === 0 ? "end" : CHARS[to];
      if (to === 0) span.className = "end";
      else span.style.color = chanceColor(p);
      span.style.borderColor = chanceColor(p);
      span.title = describe(from, to, p);
      return span;
    }));

    const [from, to, p] = s.reduce((a, b) => (b[2] < a[2] ? b : a));
    $("weakest").textContent = p >= 0.08
      ? "// every step looks natural. green = common, red = rare."
      : `// oddest part: ${describe(from, to, p)}. green = common, red = rare.`;
  }

  function describe(from, to, p) {
    if (from === 0) return `starting with ${quote(CHARS[to])} happens ${oneIn(p)}`;
    if (to === 0) return `ending on ${quote(CHARS[from])} happens ${oneIn(p)}`;
    return `${quote(CHARS[to])} right after ${quote(CHARS[from])} happens ${oneIn(p)}`;
  }

  // ---------- 3. what comes next ----------
  let current = 0;

  function buildKeys() {
    $("keys").replaceChildren(...CHARS.map((c, i) => {
      const b = document.createElement("button");
      b.textContent = i === 0 ? "start" : c;
      b.setAttribute("aria-pressed", String(i === current));
      b.onclick = () => { current = i; showNext(); };
      return b;
    }));
  }

  function showNext() {
    [...$("keys").children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === current)));
    $("next-title").textContent = current === 0
      ? "// names usually start with:"
      : `// after ${quote(CHARS[current])}, it usually picks:`;
    const row = table()[current].map((p, i) => [i, p]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const top = row[0][1];
    const W = 32;
    $("bars").innerHTML = row.map(([i, p]) => {
      const lab = (i === 0 ? "stop" : CHARS[i]).padStart(5);
      const pct = (p >= 0.01 ? Math.round(p * 100) + "%" : "<1%").padStart(5);
      return `${lab}  ${bar(Math.max(1, Math.round((p / top) * W)), W, GREEN)} ${pct}`;
    }).join("\n");
  }

  // ---------- mode switch ----------
  function setBrain(b) {
    brain = b;
    document.querySelectorAll(".mode button").forEach((btn) =>
      btn.setAttribute("aria-checked", String(btn.dataset.brain === b)));
    $("brain-note").textContent = NOTES[b];
    scoreName();
    showNext();
  }

  // ---------- wire up ----------
  $("name-count").textContent = M.names.length.toLocaleString();
  document.querySelectorAll(".mode button").forEach((btn) => (btn.onclick = () => setBrain(btn.dataset.brain)));
  wild.addEventListener("input", wildLabel);
  $("make-btn").addEventListener("click", makeBatch);
  $("prefix").addEventListener("keydown", (e) => { if (e.key === "Enter") makeBatch(); });
  $("test-name").addEventListener("input", scoreName);
  $("clear-kept").addEventListener("click", () => { kept = []; saveKept(); renderKept(); syncKeptMarks(); });

  buildKeys();
  wildLabel();
  renderKept();
  setBrain("counting");
  makeBatch();
})();
