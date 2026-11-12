(() => {
  "use strict";

  const M = window.BIGRAM;
  const CHARS = M.chars;                         // ['.', 'a', ..., 'z']; '.' = start/end
  const IDX = Object.fromEntries(CHARS.map((c, i) => [c, i]));
  const REAL = new Set(M.names);
  const $ = (id) => document.getElementById(id);

  let brain = "counting";
  const table = () => M.tables[brain];

  const NOTES = {
    counting: "It went through every name and simply tallied which letter follows which.",
    neural: "It started with random guesses and corrected itself 1,000 times, the way bigger AI models learn.",
  };

  // ---------- helpers ----------
  const clean = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
  const show = (ix) => (ix === 0 ? "end" : CHARS[ix]);
  const quote = (c) => `“${c}”`;

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

  const chanceColor = (p) => (p >= 0.08 ? "var(--good)" : p >= 0.02 ? "var(--warn)" : "var(--bad)");

  function oneIn(p) {
    if (p >= 0.5) return "more often than not";
    const n = Math.round(1 / p);
    return `about 1 time in ${n.toLocaleString()}`;
  }

  // ---------- 1. make names ----------
  const wild = $("wildness");
  const temperature = () => 0.4 * Math.pow(6.25, wild.value / 100); // 0.4 .. 1 .. 2.5

  function wildLabel() {
    const v = +wild.value;
    $("wild-label").textContent =
      v < 20 ? "Very sensible" : v < 40 ? "Sensible" : v <= 60 ? "Normal" : v < 80 ? "Wild" : "Chaotic";
  }

  let kept = [];
  try { kept = JSON.parse(localStorage.getItem("kept-names") || "[]"); } catch (_) { kept = []; }
  const saveKept = () => { try { localStorage.setItem("kept-names", JSON.stringify(kept)); } catch (_) {} };

  function renderKept() {
    $("kept-box").hidden = kept.length === 0;
    $("kept").replaceChildren(...kept.map((n) => {
      const li = document.createElement("li");
      li.textContent = cap(n);
      li.title = "Tap to remove";
      li.onclick = () => { kept = kept.filter((k) => k !== n); saveKept(); renderKept(); syncKeptMarks(); };
      return li;
    }));
  }

  function syncKeptMarks() {
    for (const li of $("made").children) li.classList.toggle("kept", kept.includes(li.dataset.name));
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
      li.style.animationDelay = `${i * 35}ms`;
      li.textContent = cap(n);
      if (REAL.has(n)) {
        realCount++;
        const t = document.createElement("span");
        t.className = "tag";
        t.textContent = "real";
        li.append(t);
      }
      li.title = "Tap to keep";
      li.onclick = () => {
        kept = kept.includes(n) ? kept.filter((k) => k !== n) : [...kept, n];
        saveKept(); renderKept(); syncKeptMarks();
      };
      return li;
    }));
    syncKeptMarks();
    $("made-hint").textContent =
      "Tap a name to keep it. " +
      (realCount
        ? `${realCount === 1 ? "One is" : realCount + " are"} marked REAL: the machine stumbled onto a name that was already in its list.`
        : "None of these are in its list of real names. It invented them all.");
  }

  // ---------- 2. score a name ----------
  const VERDICTS = [
    [60, "\u{1F451}", "Absolutely a name"],
    [30, "\u{1F60A}", "Sounds like a real name"],
    [10, "\u{1F914}", "Unusual, but possible"],
    [2, "\u{1F62C}", "Hmm, that's a stretch"],
    [-1, "\u{1F92A}", "Keyboard smash!"],
  ];

  function scoreName() {
    const word = clean($("test-name").value);
    const box = $("verdict");
    if (!word) { box.hidden = true; return; }
    box.hidden = false;

    const pct = percentile(avgLog(word));
    const [, emoji, text] = VERDICTS.find(([min]) => pct > min);
    $("verdict-emoji").textContent = emoji;
    $("verdict-text").textContent = text;
    const nice = Math.round(pct);
    $("verdict-sub").textContent =
      (REAL.has(word) ? "It's in the list of real names. " : "") +
      (nice >= 99 ? "More name-like than almost every real name."
        : nice <= 0 ? "Less name-like than every single real name."
        : `More name-like than ${nice}% of real names.`);

    const fill = $("meter-fill");
    fill.style.width = `${Math.max(3, pct)}%`;
    fill.style.background = pct > 30 ? "var(--good)" : pct > 2 ? "var(--warn)" : "var(--bad)";

    const s = steps(word);
    $("letters").replaceChildren(...s.map(([from, to, p]) => {
      const span = document.createElement("span");
      span.textContent = to === 0 ? "end" : to === undefined ? "?" : CHARS[to];
      if (to === 0) span.className = "end";
      span.style.borderColor = chanceColor(p);
      span.title = describe(from, to, p);
      return span;
    }));

    const [from, to, p] = s.reduce((a, b) => (b[2] < a[2] ? b : a));
    $("weakest").textContent = p >= 0.08
      ? "Every step looks natural to the machine. Green means common, red means rare."
      : `The oddest part: ${describe(from, to, p)}. Green means common, red means rare.`;
  }

  function describe(from, to, p) {
    if (from === 0) return `starting a name with ${quote(CHARS[to])} happens ${oneIn(p)}`;
    if (to === 0) return `ending a name on ${quote(CHARS[from])} happens ${oneIn(p)}`;
    return `${quote(CHARS[to])} right after ${quote(CHARS[from])} happens ${oneIn(p)}`;
  }

  // ---------- 3. what comes next ----------
  let current = 0;

  function buildKeys() {
    const keys = CHARS.map((c, i) => {
      const b = document.createElement("button");
      b.textContent = i === 0 ? "Start" : c;
      if (i === 0) b.className = "wide";
      b.setAttribute("aria-pressed", String(i === current));
      b.onclick = () => { current = i; showNext(); };
      return b;
    });
    $("keys").replaceChildren(...keys);
  }

  function showNext() {
    [...$("keys").children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === current)));
    $("next-title").textContent = current === 0
      ? "Names usually start with…"
      : `After ${quote(CHARS[current])}, the machine usually picks…`;
    const row = table()[current].map((p, i) => [i, p]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const top = row[0][1];
    $("bars").replaceChildren(...row.map(([i, p]) => {
      const d = document.createElement("div");
      d.className = "bar";
      d.innerHTML =
        `<span class="lab${i === 0 ? " end" : ""}">${i === 0 ? "(stop)" : CHARS[i]}</span>` +
        `<span class="track"><span class="fill"></span></span>` +
        `<span class="pct">${p >= 0.01 ? Math.round(p * 100) + "%" : "<1%"}</span>`;
      requestAnimationFrame(() => { d.querySelector(".fill").style.width = `${(p / top) * 100}%`; });
      return d;
    }));
  }

  // ---------- brain switch ----------
  function setBrain(b) {
    brain = b;
    document.querySelectorAll(".brain-switch button").forEach((btn) =>
      btn.setAttribute("aria-checked", String(btn.dataset.brain === b)));
    $("brain-note").textContent = NOTES[b];
    scoreName();
    showNext();
  }

  // ---------- wire up ----------
  $("name-count").textContent = M.names.length.toLocaleString();
  document.querySelectorAll(".brain-switch button").forEach((btn) => (btn.onclick = () => setBrain(btn.dataset.brain)));
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
