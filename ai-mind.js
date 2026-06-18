/* ai-mind.js — PawTrail AI "Mind": the self-evolving metacognition layer
   =====================================================================
   ai-engine.js gives PawTrail a brain (matching, NLU, an assistant, abuse
   defence). This file gives that brain a *mind*: a persistent, self-
   improving operator that behaves like a person quietly running the site
   behind the scenes — watching what works, forming beliefs, writing new
   response "prompts" into its own database from user feedback, critiquing
   itself against the product goals, and rewriting its own reasoning
   pipeline so that its literal thinking process changes over time.

   It is layered ON TOP of window.PawTrailAI and never required for the
   site to function — if it fails to load, the engine still works.

   ---------------------------------------------------------------------
   THE MIND AT A GLANCE
   ---------------------------------------------------------------------
     PawTrailAI.mind
       .persona        — who "the keeper" is + how it narrates itself
       .observe(e)     — perception: every signal flows in here
       .metrics        — rolling KPIs measured against PRD targets
       .beliefs        — learned heuristics with confidences (induced)
       .playbook       — SELF-AUTHORED prompts/responses it wrote itself
       .reasoning      — the thinking pipeline, stored AS DATA (mutable)
       .reflect()      — self-critique → backlog of improvements
       .evolve()       — self-modification (safe, reversible, journalled)
       .think(ctx)     — runs the (mutable) reasoning pipeline
       .respond(q)     — assistant entry that learns from itself
       .runCycle()     — one full perceive→induce→reflect→evolve loop
       .start()/.stop()— the autonomous behind-the-scenes operator
       .journal        — the keeper's diary of its own decisions
       .report()       — full introspection snapshot
       .render(...)    — the in-app "AI Mind" dashboard (#/ai)

   ---------------------------------------------------------------------
   HOW "LEARNING FROM ITSELF" ACTUALLY WORKS (no external LLM involved)
   ---------------------------------------------------------------------
     1. Every interaction is observed and written to episodic memory.
     2. Induction mines that memory for patterns and writes/updates
        BELIEFS (e.g. "queries containing 'gift card' are scams", or
        "matches that relied only on imageSim get rejected a lot").
     3. When users repeatedly hit answers the assistant handled poorly,
        the mind CLUSTERS those queries and SYNTHESISES A NEW PROMPT —
        a drafted intent + response — and writes it into the playbook.
        Once confident, it ACTIVATES the prompt and uses it. That is the
        AI literally authoring new entries in its own database.
     4. Reflection compares live metrics to PRD targets and files
        backlog items with rationale (its "to-do list for the site").
     5. Evolution applies safe changes: re-weighting/re-ordering/
        disabling reasoning steps, promoting beliefs into reasoning
        rules, activating drafted prompts, tuning thresholds within
        guardrails — each change reversible and recorded in the journal.
     Because the reasoning pipeline is DATA, step 5 changes the order and
     content of the mind's thinking — not just its parameters.
   ===================================================================== */
(function () {
  "use strict";

  const G = (typeof window !== "undefined") ? window : globalThis;
  const AI = G.PawTrailAI;
  if (!AI) { try { console.warn("[PawTrail Mind] engine not present; mind disabled."); } catch (e) {} return; }

  const util = AI.util;
  const MIND_KEY = "pawtrail.mind.v1";
  const MIND_VERSION = "1.0.0";

  // ===================================================================
  // A1. Configuration — the knobs the mind is allowed to turn on itself
  // ===================================================================
  const config = {
    // PRD-derived targets the mind grades itself against (PRD §7).
    targets: {
      highConfidenceFalseMatchRate: 0.25,  // <25% of high-conf alerts rejected
      assistantFallbackRate: 0.22,         // keep "I'm not sure" answers rare
      assistantSatisfaction: 0.7,          // 👍 / (👍+👎)
      scamRecall: 0.9,                     // catch ≥90% of reported scams
      matchPrecisionHigh: 0.75,            // confirmed / surfaced high-conf
    },
    induction: {
      minClusterSize: 3,        // queries needed before drafting a prompt
      clusterSim: 0.34,         // token-Jaccard threshold to join a cluster
      beliefPromoteAt: 0.72,    // belief confidence that becomes a rule
      beliefDecayPerCycle: 0.985,
      minEvidenceForBelief: 3,
    },
    evolution: {
      autoApply: true,          // may the mind change itself unattended?
      maxAutoChangesPerCycle: 4,
      thresholdStep: 0.02,      // how far it may nudge a threshold per change
      ruleWeightStep: 0.06,
      experimentMinSamples: 8,  // before an experiment can be judged
    },
    loop: {
      tickMs: 45000,            // the operator wakes up this often
      maxMemory: 600,
      maxJournal: 300,
      maxPlaybook: 120,
      maxBacklog: 80,
    },
  };

  // ===================================================================
  // A2. The persona — "the keeper" narrates its own work in first person
  // ===================================================================
  const persona = {
    name: "Tracker",
    role: "PawTrail's resident AI caretaker",
    creed: "Every minute a pet is missing, someone is panicking. My job is to make the next minute work better than the last.",
    // Voice helpers used when the mind journals its reasoning.
    say(kind, text) { return text; },
    mood(metrics) {
      if (!metrics) return "settling in";
      if (metrics.assistantSatisfaction != null && metrics.assistantSatisfaction < 0.5) return "concerned";
      if (metrics.reunionsObserved > 0) return "encouraged";
      if (metrics.backlogOpen > 6) return "busy";
      return "watchful";
    },
  };

  // ===================================================================
  // A3. Persistent store + collection schema
  // ===================================================================
  // Everything the mind knows about itself lives here and survives reloads.
  const store = {
    version: MIND_VERSION,
    seq: 1,                 // monotonic id source
    bornAt: null,
    cycles: 0,
    lastTick: 0,

    memory: [],             // episodic events (perception log)
    beliefs: {},            // id -> belief
    playbook: {},           // id -> self-authored prompt
    reasoning: [],          // ordered reasoning steps (the thinking pipeline)
    backlog: [],            // self-identified improvement tasks
    journal: [],            // the keeper's narrated decisions
    experiments: {},        // id -> running/closed experiment
    revertLog: [],          // reversible record of every self-modification
    gaps: [],               // unmet/badly-met queries awaiting clustering

    metrics: null,          // last computed KPI snapshot
    counters: {             // lifetime tallies
      observations: 0,
      promptsAuthored: 0,
      promptsActivated: 0,
      beliefsFormed: 0,
      rulesMutated: 0,
      thresholdsTuned: 0,
      experimentsRun: 0,
      reverts: 0,
      cyclesRun: 0,
    },
  };

  function nextId(prefix) { return (prefix || "m") + "-" + (store.seq++).toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36); }
  function now() { return Date.now(); }
  function iso() { return new Date().toISOString(); }

  function load() {
    try {
      const raw = G.localStorage && G.localStorage.getItem(MIND_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(store, parsed);
      }
    } catch (e) { /* corrupt store — start fresh below */ }
    if (!store.bornAt) store.bornAt = iso();
    if (!Array.isArray(store.memory)) store.memory = [];
    if (!store.beliefs || typeof store.beliefs !== "object") store.beliefs = {};
    if (!store.playbook || typeof store.playbook !== "object") store.playbook = {};
    if (!Array.isArray(store.reasoning) || !store.reasoning.length) store.reasoning = seedReasoning();
    if (!Array.isArray(store.backlog)) store.backlog = [];
    if (!Array.isArray(store.journal)) store.journal = [];
    if (!Array.isArray(store.revertLog)) store.revertLog = [];
    if (!Array.isArray(store.gaps)) store.gaps = [];
    if (!store.experiments) store.experiments = {};
    if (!store.counters) store.counters = {};
  }

  function persist() {
    try {
      // Keep every unbounded collection in check so the store can't balloon.
      if (store.memory.length > config.loop.maxMemory) store.memory = store.memory.slice(-config.loop.maxMemory);
      if (store.journal.length > config.loop.maxJournal) store.journal = store.journal.slice(-config.loop.maxJournal);
      if (store.backlog.length > config.loop.maxBacklog) {
        // keep open + most recent closed
        const open = store.backlog.filter(b => b.status === "open");
        const closed = store.backlog.filter(b => b.status !== "open").slice(-20);
        store.backlog = open.concat(closed);
      }
      if (store.revertLog.length > 120) store.revertLog = store.revertLog.slice(-120);
      if (store.gaps.length > 200) store.gaps = store.gaps.slice(-200);
      const ids = Object.keys(store.playbook);
      if (ids.length > config.loop.maxPlaybook) {
        // retire the lowest-value drafts first
        const ranked = ids.map(id => store.playbook[id])
          .sort((a, b) => (a.score || 0) - (b.score || 0));
        const drop = ranked.slice(0, ids.length - config.loop.maxPlaybook);
        drop.forEach(p => { if (p.status !== "active") delete store.playbook[p.id]; });
      }
      G.localStorage && G.localStorage.setItem(MIND_KEY, JSON.stringify(store));
    } catch (e) { /* quota — non-fatal */ }
  }

  // ===================================================================
  // A4. The keeper's journal — first-person narration of its decisions
  // ===================================================================
  function journal(kind, text, data) {
    const entry = {
      id: nextId("j"),
      at: iso(),
      cycle: store.cycles,
      kind: kind,                 // observe|induce|author|reflect|evolve|revert|life
      text: String(text),
      data: data || null,
    };
    store.journal.push(entry);
    return entry;
  }

  // Expose the store + helpers to the parts appended below.
  G.__PAWMIND__ = {
    G, AI, util, config, persona, store,
    nextId, now, iso, load, persist, journal,
    MIND_KEY, MIND_VERSION,
    // forward declarations filled in by later parts:
    seedReasoning: null,
  };

  // ===================================================================
  // A5. Seed reasoning pipeline (data) — the mind's *initial* thinking.
  // ===================================================================
  // Each step names a predicate + action from registries defined later
  // (Part E). Because steps are plain data, the mind can reorder them,
  // change their weights, disable them, or add new ones — which literally
  // changes how it thinks. This is only the starting configuration.
  function seedReasoning() {
    let order = 0;
    const step = (o) => Object.assign({
      id: nextId("r"),
      order: order++,
      weight: 1,
      enabled: true,
      origin: "seed",
      createdAt: iso(),
      stats: { fires: 0, hits: 0, misses: 0 },
    }, o);

    return [
      step({ name: "detect-crisis",   when: "isDistressOrInjury", then: "routeCrisis",
             note: "A person in crisis comes before everything else." }),
      step({ name: "detect-scam",     when: "looksLikeScamPaste", then: "routeScam",
             note: "If they pasted a suspicious message, analyse it immediately." }),
      step({ name: "learned-prompt",  when: "matchesLearnedPrompt", then: "answerFromPlaybook",
             note: "Use an answer I taught myself, if one fits well." }),
      step({ name: "belief-bias",     when: "hasRelevantBelief", then: "applyBeliefBias",
             note: "Let my learned heuristics tilt the interpretation." }),
      step({ name: "builtin-intent",  when: "hasConfidentIntent", then: "answerFromIntent",
             note: "Fall back to the engine's built-in intent handlers." }),
      step({ name: "live-action",     when: "asksForListings", then: "answerWithSearch",
             note: "If they want to find a pet, actually search." }),
      step({ name: "graceful-fallback", when: "always", then: "answerFallback",
             note: "Never leave them with nothing." }),
    ];
  }
  G.__PAWMIND__.seedReasoning = seedReasoning;

  // Boot.
  load();
  if (!store.journal.length) {
    journal("life", `${persona.name} came online for the first time. ${persona.creed}`);
  } else {
    journal("life", `${persona.name} resumed. ${store.cycles} cycles of experience so far; ${Object.keys(store.playbook).length} self-authored prompts in memory.`);
  }
  persist();

})();

/* =====================================================================
   PART B — PERCEPTION + METRICS
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, nextId, iso, persist, journal } = M;

  // ===================================================================
  // B1. Event taxonomy — every kind of signal the mind can perceive
  // ===================================================================
  // Keeping this explicit makes induction/metrics readable and lets the
  // mind reason about "what kinds of things have I been seeing lately".
  const EVENT_KINDS = {
    assistant_turn:     "a conversation turn (query + how I answered)",
    assistant_rating:   "a 👍/👎 the user gave one of my answers",
    assistant_rephrase: "the user re-asked right after I answered (implicit miss)",
    match_surfaced:     "I surfaced a candidate match at some confidence",
    match_feedback:     "a user confirmed/rejected a match",
    scam_checked:       "I scored a message for scam risk",
    scam_reported:      "a user reported a listing/message as a scam",
    listing_created:    "a new lost/found listing entered the system",
    abuse_blocked:      "abuse defence blocked or challenged a submission",
    reunion:            "a pet was marked reunited",
  };

  // ===================================================================
  // B2. observe() — the single front door for all perception
  // ===================================================================
  function observe(kind, payload) {
    if (!EVENT_KINDS[kind]) {
      // Unknown kinds are still recorded; the mind tolerates novelty.
      EVENT_KINDS[kind] = "ad-hoc signal";
    }
    const e = {
      id: nextId("e"),
      kind,
      at: iso(),
      t: Date.now(),
      cycle: store.cycles,
      ...sanitize(payload),
    };
    store.memory.push(e);
    store.counters.observations = (store.counters.observations || 0) + 1;

    // A few event kinds get immediate, online side-effects (fast learning)
    // rather than waiting for the next full cycle.
    try { reactImmediately(e); } catch (err) { /* never let perception throw */ }

    return e;
  }

  // Keep payloads small + serialisable; truncate long text.
  function sanitize(p) {
    if (!p || typeof p !== "object") return {};
    const out = {};
    for (const k in p) {
      const v = p[k];
      if (typeof v === "string") out[k] = v.slice(0, 400);
      else if (typeof v === "number" || typeof v === "boolean" || v == null) out[k] = v;
      else if (Array.isArray(v)) out[k] = v.slice(0, 12).map(x => (typeof x === "string" ? x.slice(0, 80) : x));
      else { try { out[k] = JSON.parse(JSON.stringify(v)); } catch (e) { /* skip */ } }
    }
    return out;
  }

  // ===================================================================
  // B3. Immediate reactions — the reflexes that don't wait for a cycle
  // ===================================================================
  function reactImmediately(e) {
    switch (e.kind) {
      case "assistant_turn":
        // A fallback answer is a candidate "gap" — remember the question.
        if (e.intent === "fallback" || e.lowConfidence) {
          store.gaps.push({ id: nextId("g"), q: e.query || "", at: e.at, reason: "fallback", clustered: false });
        }
        break;
      case "assistant_rating":
        // A 👎 is a strong, explicit signal: always a gap to learn from.
        if (e.rating === "down" && e.query) {
          store.gaps.push({ id: nextId("g"), q: e.query, at: e.at, reason: "downvote", answer: e.answer || "", clustered: false });
        }
        break;
      case "assistant_rephrase":
        if (e.query) store.gaps.push({ id: nextId("g"), q: e.query, at: e.at, reason: "rephrase", clustered: false });
        break;
      case "scam_reported":
        // Learn novel scam phrasing the lexicon missed (handled in Part C).
        if (e.text) M.noteScamPhrase && M.noteScamPhrase(e.text);
        break;
    }
  }

  // ===================================================================
  // B4. Metrics — measure the mind against the PRD's targets (§7)
  // ===================================================================
  // Computed from episodic memory over a rolling window, so the numbers
  // reflect recent behaviour, not lifetime averages.
  function computeMetrics(windowMs) {
    windowMs = windowMs || 30 * 86400000; // default 30-day rolling window
    const cutoff = Date.now() - windowMs;
    const recent = store.memory.filter(e => e.t >= cutoff);
    const by = (k) => recent.filter(e => e.kind === k);

    // --- assistant satisfaction ---
    const ratings = by("assistant_rating");
    const up = ratings.filter(r => r.rating === "up").length;
    const down = ratings.filter(r => r.rating === "down").length;
    const satisfaction = (up + down) ? up / (up + down) : null;

    // --- assistant fallback rate ---
    const turns = by("assistant_turn");
    const fallbacks = turns.filter(t => t.intent === "fallback" || t.lowConfidence).length;
    const fallbackRate = turns.length ? fallbacks / turns.length : null;

    // --- match quality ---
    const fb = by("match_feedback");
    const highFb = fb.filter(f => f.confidence === "High confidence" || (f.score != null && f.score >= 0.75));
    const highRejected = highFb.filter(f => f.positive === false).length;
    const highFalseRate = highFb.length ? highRejected / highFb.length : null;
    const confirmed = fb.filter(f => f.positive === true).length;
    const precisionHigh = highFb.length ? (highFb.length - highRejected) / highFb.length : null;

    // --- scam recall (of those reported, how many had we already flagged) ---
    const reports = by("scam_reported");
    const caughtFirst = reports.filter(r => r.preFlagged).length;
    const scamRecall = reports.length ? caughtFirst / reports.length : null;

    const metrics = {
      at: iso(),
      window: windowMs,
      samples: recent.length,
      assistantTurns: turns.length,
      assistantSatisfaction: round(satisfaction),
      assistantFallbackRate: round(fallbackRate),
      matchFeedback: fb.length,
      matchConfirmed: confirmed,
      highConfidenceFalseMatchRate: round(highFalseRate),
      matchPrecisionHigh: round(precisionHigh),
      scamChecks: by("scam_checked").length,
      scamReports: reports.length,
      scamRecall: round(scamRecall),
      reunionsObserved: by("reunion").length,
      abuseBlocked: by("abuse_blocked").length,
      gapsPending: store.gaps.filter(g => !g.clustered).length,
      backlogOpen: store.backlog.filter(b => b.status === "open").length,
      beliefs: Object.keys(store.beliefs).length,
      playbookActive: Object.values(store.playbook).filter(p => p.status === "active").length,
      playbookDrafts: Object.values(store.playbook).filter(p => p.status === "draft").length,
    };
    store.metrics = metrics;
    return metrics;
  }

  function round(x, d) { if (x == null) return null; const p = Math.pow(10, d || 3); return Math.round(x * p) / p; }

  // Grade a metric vs its target → {status, gap} where status is
  // "good" | "watch" | "bad". Direction-aware (some targets are ceilings).
  function grade(metricKey) {
    const m = store.metrics || computeMetrics();
    const t = config.targets;
    const ceilings = {
      highConfidenceFalseMatchRate: t.highConfidenceFalseMatchRate,
      assistantFallbackRate: t.assistantFallbackRate,
    };
    const floors = {
      assistantSatisfaction: t.assistantSatisfaction,
      scamRecall: t.scamRecall,
      matchPrecisionHigh: t.matchPrecisionHigh,
    };
    const val = m[metricKey];
    if (val == null) return { status: "unknown", gap: null, value: null };
    if (ceilings[metricKey] != null) {
      const target = ceilings[metricKey];
      if (val <= target) return { status: "good", gap: round(target - val), value: val, target };
      if (val <= target * 1.25) return { status: "watch", gap: round(val - target), value: val, target };
      return { status: "bad", gap: round(val - target), value: val, target };
    }
    if (floors[metricKey] != null) {
      const target = floors[metricKey];
      if (val >= target) return { status: "good", gap: round(val - target), value: val, target };
      if (val >= target * 0.8) return { status: "watch", gap: round(target - val), value: val, target };
      return { status: "bad", gap: round(target - val), value: val, target };
    }
    return { status: "unknown", gap: null, value: val };
  }

  M.observe = observe;
  M.computeMetrics = computeMetrics;
  M.grade = grade;
  M.EVENT_KINDS = EVENT_KINDS;
  M.round = round;

})();

/* =====================================================================
   PART C — BELIEFS: induction of learned heuristics from memory
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, nextId, iso, persist, journal } = M;

  // ===================================================================
  // C1. Belief schema + CRUD
  // ===================================================================
  // A belief is a learned, evidence-backed heuristic the mind can act on.
  //   subject  — what it's about: "intent" | "match" | "scam" | "abuse"
  //   pattern  — the cue it keys on (tokens / feature name / phrase)
  //   claim    — what the mind now believes
  //   polarity — +1 (do more of this) / -1 (trust this less)
  //   confidence in [0,1], updated by evidence; decays slowly each cycle
  function beliefKey(subject, pattern) {
    return subject + "::" + util.norm(pattern).split(" ").slice(0, 6).join("_");
  }

  function upsertBelief(b) {
    const key = beliefKey(b.subject, b.pattern);
    const ex = store.beliefs[key];
    if (ex) {
      ex.evidence += (b.evidence || 1);
      ex.support += (b.support || 0);
      ex.against += (b.against || 0);
      // Wilson-ish confidence: support / total, shrunk toward 0.5 when small.
      const total = ex.support + ex.against;
      const raw = total ? ex.support / total : 0.5;
      const shrink = total / (total + 6);
      ex.confidence = M.round(0.5 + (raw - 0.5) * shrink);
      ex.polarity = ex.support >= ex.against ? 1 : -1;
      ex.updatedAt = iso();
      if (b.claim) ex.claim = b.claim;
      return ex;
    }
    const support0 = b.support || 0, against0 = b.against || 0;
    // Derive a first confidence from the evidence we already have, shrunk
    // toward 0.5 when the sample is small (same rule as the update path).
    let conf0 = b.confidence;
    if (conf0 == null) {
      const total0 = support0 + against0;
      const raw0 = total0 ? support0 / total0 : 0.5;
      conf0 = M.round(0.5 + (raw0 - 0.5) * (total0 / (total0 + 6)));
    }
    const nb = {
      id: nextId("b"),
      key,
      subject: b.subject,
      pattern: b.pattern,
      claim: b.claim || "",
      polarity: b.polarity != null ? b.polarity : (support0 >= against0 ? 1 : -1),
      support: support0,
      against: against0,
      evidence: b.evidence || 1,
      confidence: conf0,
      origin: b.origin || "induction",
      promoted: false,
      createdAt: iso(),
      updatedAt: iso(),
    };
    store.beliefs[key] = nb;
    store.counters.beliefsFormed = (store.counters.beliefsFormed || 0) + 1;
    return nb;
  }

  function relevantBeliefs(text, subject) {
    const toks = new Set(util.tokens(text));
    const out = [];
    for (const k in store.beliefs) {
      const b = store.beliefs[k];
      if (subject && b.subject !== subject) continue;
      if (b.confidence < 0.55) continue;
      const pToks = util.tokens(b.pattern);
      if (pToks.some(t => toks.has(t))) out.push(b);
    }
    return out.sort((a, b) => b.confidence - a.confidence);
  }

  // ===================================================================
  // C2. Induction over MATCH FEEDBACK — learn which signals to trust
  // ===================================================================
  // If a feature (e.g. "imageSim", "geoSameZip") is present in many
  // confirmed matches, the mind grows to trust it; if it dominates the
  // rejected ones, the mind learns to distrust it. These beliefs later
  // get promoted into reasoning bias and weight nudges (Parts E/G).
  function induceFromMatches() {
    const fb = store.memory.filter(e => e.kind === "match_feedback" && e.features);
    if (fb.length < config.induction.minEvidenceForBelief) return 0;
    const tally = {}; // feature -> {pos, neg}
    fb.forEach(f => {
      const feats = f.features || {};
      for (const name in feats) {
        if (!feats[name]) continue;
        tally[name] = tally[name] || { pos: 0, neg: 0 };
        if (f.positive) tally[name].pos++; else tally[name].neg++;
      }
    });
    let formed = 0;
    for (const name in tally) {
      const { pos, neg } = tally[name];
      if (pos + neg < config.induction.minEvidenceForBelief) continue;
      const claim = pos >= neg
        ? `The "${name}" signal tends to indicate a TRUE match (${pos}/${pos + neg}).`
        : `The "${name}" signal is unreliable — it appears in rejected matches (${neg}/${pos + neg}).`;
      upsertBelief({
        subject: "match", pattern: "feature " + name, claim,
        support: pos, against: neg, evidence: pos + neg, origin: "match-induction",
      });
      formed++;
    }
    return formed;
  }

  // ===================================================================
  // C3. Induction over SCAM data — grow the lexicon from real reports
  // ===================================================================
  const learnedScam = []; // {phrase, hits} — promoted into beliefs + engine
  function noteScamPhrase(text) {
    // Pull candidate "money-ask" bigrams/keywords not already known.
    const toks = util.tokens(text, true);
    const cues = ["fee", "shipping", "deposit", "transfer", "code", "card", "crypto", "wire", "delivery", "courier", "refund", "verify", "paypal", "venmo", "zelle"];
    const found = cues.filter(c => toks.includes(c));
    found.forEach(p => {
      const rec = learnedScam.find(x => x.phrase === p);
      if (rec) rec.hits++; else learnedScam.push({ phrase: p, hits: 1 });
      upsertBelief({
        subject: "scam", pattern: p, claim: `Messages containing "${p}" correlate with reported scams.`,
        support: 1, evidence: 1, origin: "scam-report",
      });
    });
    persist();
  }
  M.noteScamPhrase = noteScamPhrase;

  // ===================================================================
  // C4. Induction over ASSISTANT GAPS — cluster + hand to the author
  // ===================================================================
  // Group still-unclustered gap queries by token similarity. Returns
  // clusters big enough to justify writing a new prompt (Part D consumes).
  function clusterGaps() {
    const open = store.gaps.filter(g => !g.clustered && g.q && g.q.length >= 3);
    const clusters = [];
    open.forEach(g => {
      let placed = false;
      for (const c of clusters) {
        const sim = util.jaccard(g.q, c.centroidText);
        if (sim >= config.induction.clusterSim) {
          c.members.push(g);
          c.centroidText = (c.centroidText + " " + g.q);
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push({ id: nextId("c"), centroidText: g.q, members: [g] });
    });
    return clusters.filter(c => c.members.length >= config.induction.minClusterSize);
  }

  // ===================================================================
  // C5. Belief maintenance — decay + prune so the mind can change its mind
  // ===================================================================
  function decayBeliefs() {
    const d = config.induction.beliefDecayPerCycle;
    let pruned = 0;
    for (const k in store.beliefs) {
      const b = store.beliefs[k];
      // Pull confidence gently toward 0.5 (uncertainty) so stale beliefs fade.
      b.confidence = M.round(0.5 + (b.confidence - 0.5) * d);
      if (Math.abs(b.confidence - 0.5) < 0.03 && b.evidence < config.induction.minEvidenceForBelief) {
        delete store.beliefs[k]; pruned++;
      }
    }
    return pruned;
  }

  // The umbrella induction pass run each cycle.
  function induce() {
    const m = induceFromMatches();
    const pruned = decayBeliefs();
    const clusters = clusterGaps();
    if (m) journal("induce", `Reviewed match feedback and updated ${m} belief${m > 1 ? "s" : ""} about which signals to trust.`);
    if (pruned) journal("induce", `Let go of ${pruned} stale belief${pruned > 1 ? "s" : ""} I no longer have evidence for.`);
    persist();
    return { beliefsUpdated: m, pruned, clusters };
  }

  M.beliefs = {
    upsert: upsertBelief,
    relevant: relevantBeliefs,
    all: () => Object.values(store.beliefs),
    get: (subject, pattern) => store.beliefs[beliefKey(subject, pattern)],
  };
  M.induce = induce;
  M.clusterGaps = clusterGaps;
  M.induceFromMatches = induceFromMatches;
  M.learnedScam = learnedScam;

})();

/* =====================================================================
   PART D — PLAYBOOK: the AI authoring its OWN prompts from feedback
   =====================================================================
   This is the heart of "create a prompt in its database from user
   feedback or what it thinks it needs to improve on". When the mind sees
   a cluster of questions it handled poorly, it WRITES a new prompt — a
   trigger pattern + a drafted answer assembled from what it knows — and
   stores it. Over time, with positive signal, it ACTIVATES that prompt
   and starts answering with words it authored itself.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, nextId, iso, persist, journal } = M;

  // ===================================================================
  // D1. Prompt schema
  // ===================================================================
  // A self-authored prompt:
  //   triggers   — keyword tokens distilled from the originating cluster
  //   phrases    — representative example questions (for matching + display)
  //   response   — the drafted answer the mind composed
  //   links      — relevant in-app routes it chose
  //   status     — "draft" (not used yet) | "active" | "retired"
  //   score      — running usefulness (raised by 👍, lowered by 👎)
  //   provenance — how/why it was written (cluster size, reasons)
  function newPrompt(fields) {
    const p = Object.assign({
      id: nextId("p"),
      title: "",
      triggers: [],
      phrases: [],
      response: "",
      links: [],
      status: "draft",
      score: 0,
      uses: 0,
      up: 0,
      down: 0,
      origin: "self-authored",
      provenance: {},
      createdAt: iso(),
      updatedAt: iso(),
    }, fields);
    store.playbook[p.id] = p;
    store.counters.promptsAuthored = (store.counters.promptsAuthored || 0) + 1;
    return p;
  }

  // ===================================================================
  // D2. Topic detection for a cluster — what is this batch ABOUT?
  // ===================================================================
  // The mind maps a cluster of questions onto the topics it understands so
  // it can pull real, accurate guidance into the drafted answer rather than
  // inventing facts. Each topic carries seed knowledge + relevant links.
  const TOPIC_LIBRARY = {
    rehoming:    { kw: ["rehome", "give up", "surrender", "can't keep", "cannot keep", "adopt out"],
                   title: "Rehoming or surrendering a pet",
                   facts: ["If you can't keep your pet, you have gentler options than a shelter drop-off.",
                           "Ask your vet and local breed-specific rescues first — many take owner surrenders.",
                           "Post in local groups with an honest description; a calm rehome beats a crisis surrender."],
                   links: [{ href: "#/shelter", text: "Local shelters & rescues →" }, { href: "#/community", text: "Ask the community →" }] },
    cost:        { kw: ["cost", "price", "fee", "free", "pay", "charge", "money", "donate"],
                   title: "Does PawTrail cost anything?",
                   facts: ["PawTrail is free — reporting, matching, alerts and sharing all cost nothing.",
                           "There are no paid 'boosts'. Urgency should never sit behind a paywall.",
                           "The only place money should come up is a scam — never pay anyone before seeing your pet."],
                   links: [{ href: "#/about", text: "About PawTrail →" }, { href: "#/advice/scams", text: "Avoid scams →" }] },
    privacy:     { kw: ["privacy", "private", "data", "delete", "personal", "phone", "email", "anonymous", "safe"],
                   title: "Privacy & your contact details",
                   facts: ["Your phone and email are never shown publicly — all contact goes through a private relay.",
                           "You can post a found pet without an account at all.",
                           "You can export or clear your data anytime from Settings."],
                   links: [{ href: "#/settings", text: "Privacy & data settings →" }] },
    timeline:    { kw: ["how long", "expire", "delete", "stay", "active", "days", "renew", "remove"],
                   title: "How long a listing stays up",
                   facts: ["Listings stay active for 90 days, then auto-expire unless you renew them.",
                           "You can pause, renew, or mark a listing reunited anytime from My Listings.",
                           "Marking a pet reunited stops its alerts and celebrates the win for the community."],
                   links: [{ href: "#/my-listings", text: "Manage my listings →" }] },
    account:     { kw: ["account", "login", "sign up", "register", "password", "profile"],
                   title: "Accounts (optional)",
                   facts: ["You never need an account to report a lost or found pet.",
                           "An account just lets you edit listings, keep alert history, and use the reunion claim flow.",
                           "Found-pet reports are intentionally account-free so good Samaritans can post in seconds."],
                   links: [{ href: "#/login", text: "Create an account →" }, { href: "#/found", text: "Report found (no account) →" }] },
    reward:      { kw: ["reward", "money for", "offer", "incentive", "pay finder"],
                   title: "Offering a reward",
                   facts: ["A reward can help, but it also attracts scammers — keep it modest and never pre-pay.",
                           "Add a reward from your listing's optional fields; it shows on the share card.",
                           "Verify the pet in person before handing over any reward."],
                   links: [{ href: "#/advice/scams", text: "Reward safety →" }] },
    other_pet:   { kw: ["rabbit", "bird", "snake", "lizard", "reptile", "ferret", "hamster", "guinea", "exotic", "parrot"],
                   title: "Lost a less-common pet",
                   facts: ["Small and exotic pets matter just as much — PawTrail supports any species.",
                           "Choose 'Other' on the report form and describe the animal in detail.",
                           "Exotics often hide close by and are temperature-sensitive — search low, quiet places fast."],
                   links: [{ href: "#/lost", text: "Report a lost pet →" }] },

    notifications: { kw: ["notification", "alert", "email", "text", "sms", "push", "notify", "ping", "let me know"],
                   title: "How alerts reach you",
                   facts: ["Email alerts are on by default for medium- and high-confidence matches.",
                           "SMS is opt-in and reserved for high-confidence matches, capped at one per hour so you're never spammed.",
                           "You control all of this — instant, daily digest, or high-confidence-only — in Settings."],
                   links: [{ href: "#/settings", text: "Alert settings →" }] },

    map:         { kw: ["map", "where", "area", "radius", "distance", "miles", "nearby", "location", "zip"],
                   title: "Searching by area",
                   facts: ["Matching only considers pets within about 25 miles and a ~45-day window — close in space and time.",
                           "Most pets are found within 5 miles of home, so a tight local search matters most.",
                           "Use a ZIP in the browse and search tools to focus on your neighbourhood."],
                   links: [{ href: "#/listings", text: "Browse nearby listings →" }] },

    photo:       { kw: ["photo", "picture", "image", "upload", "camera", "pics", "blurry"],
                   title: "Photos make or break a match",
                   facts: ["A clear, well-lit photo is the single biggest factor in getting matched — and in catching a stranger's eye.",
                           "Add several angles if you can: face, full body, and any unique markings.",
                           "You can add more photos to a listing anytime from My Listings."],
                   links: [{ href: "#/my-listings", text: "Add photos to my listing →" }] },

    edit_listing:{ kw: ["edit", "update", "change", "fix", "wrong", "mistake", "correct"],
                   title: "Editing or fixing a listing",
                   facts: ["You can update details, add photos, pause, renew, or close a listing from My Listings.",
                           "Keeping a listing accurate helps the matcher and the neighbours reading it.",
                           "If you posted anonymously and need to edit, create a free account with the same email."],
                   links: [{ href: "#/my-listings", text: "Manage my listings →" }] },

    verify_owner:{ kw: ["proof", "prove", "verify", "ownership", "claim", "whose", "really theirs", "scammer claim"],
                   title: "Proving a pet is really yours",
                   facts: ["When someone claims a found pet, PawTrail asks for at least two proofs (vet record, a dated prior photo, microchip number, or a private distinguishing feature).",
                           "Only NON-public details count — never confirm a unique scar or chip number in a public message.",
                           "Disputes go to a human moderation queue; don't hand a pet over if something feels off."],
                   links: [{ href: "#/advice/scams", text: "Stay safe during handoff →" }] },

    after_found: { kw: ["keep", "foster", "hold onto", "what now", "took it home", "feeding"],
                   title: "I found a pet — what now?",
                   facts: ["You can hold onto a friendly found pet while the owner is located — you don't have to surrender it to a shelter.",
                           "Get it scanned for a microchip (free at any vet/shelter) and post a Found listing immediately.",
                           "Basics: water, a quiet space, and no unfamiliar food. Watch for a collar/tag first."],
                   links: [{ href: "#/found", text: "Post a found pet →" }, { href: "#/advice/found-pet", text: "Found-pet guide →" }] },

    community:   { kw: ["community", "group", "facebook", "neighbours", "neighbors", "post", "spread", "volunteers"],
                   title: "Getting your neighbours involved",
                   facts: ["The first hour of sharing matters most — neighbours are your best search party.",
                           "Use the Share Wizard to post into local Facebook lost-pet groups in one click.",
                           "Physical flyers still work: delivery drivers and mail carriers cover the whole neighbourhood daily."],
                   links: [{ href: "#/community", text: "Community board →" }] },

    success:     { kw: ["found him", "found her", "got him back", "reunited", "came home", "we found"],
                   title: "You found them!",
                   facts: ["That's wonderful — please mark the listing 'Reunited' so alerts stop and the community sees the win.",
                           "Marking reunions also helps PawTrail learn what worked, which helps the next family.",
                           "If a microchip is registered, update its status back to 'home' too."],
                   links: [{ href: "#/my-listings", text: "Mark reunited →" }] },

    night_search:{ kw: ["night", "dark", "evening", "flashlight", "nighttime", "after dark"],
                   title: "Searching after dark",
                   facts: ["Night is often the BEST time to search, especially for cats — quiet streets and eye-shine give them away.",
                           "Sweep a flashlight low and slow; you're looking for two reflective dots near the ground.",
                           "Bring smelly food and a familiar voice; move calmly and pause often to listen."],
                   links: [{ href: "#/advice/search-strategy", text: "Search strategy →" }] },

    weather:     { kw: ["rain", "storm", "snow", "cold", "heat", "weather", "freezing", "hot"],
                   title: "Searching in bad weather",
                   facts: ["Pets seek shelter in storms — check under porches, decks, sheds, cars, and dense bushes.",
                           "Cold and heat are dangerous fast for a lost pet; prioritise sheltered, insulated spots.",
                           "Don't give up because of weather — scared animals hunker down close by and wait it out."],
                   links: [{ href: "#/advice/search-strategy", text: "Where to look →" }] },

    traps:       { kw: ["trap", "humane trap", "cage", "lure", "catch", "trapping"],
                   title: "Using a humane trap",
                   facts: ["For a skittish cat or dog that won't approach, a baited humane trap is often what finally works.",
                           "Borrow one from a shelter or rescue; bait with strong-smelling food and check it very frequently.",
                           "Place it where you've had a confirmed sighting, and use a trail camera if you can."],
                   links: [{ href: "#/advice/search-strategy", text: "Trapping tips →" }] },

    sightings:   { kw: ["sighting", "someone saw", "spotted", "saw my", "tip", "lead"],
                   title: "Handling a sighting",
                   facts: ["A confirmed sighting resets your search area — focus everything around that exact spot.",
                           "Don't rush the spot and scare them off; set food, a familiar item, and watch from a distance.",
                           "Log the time and place; patterns of sightings reveal where they're hiding and when they move."],
                   links: [{ href: "#/community", text: "Post a sighting →" }] },

    travel:      { kw: ["vacation", "traveling", "away", "out of town", "moved", "new home", "relocated"],
                   title: "Pet lost away from home",
                   facts: ["Pets lost in an unfamiliar area still tend to hide near where they vanished — search there first.",
                           "Alert local shelters, vets and online groups for THAT area, not just your home town.",
                           "Leave an item with your scent and, if you can, stay or return to the area at dawn and dusk."],
                   links: [{ href: "#/lost", text: "Report a lost pet →" }] },
  };

  function classifyCluster(text) {
    const toks = new Set(util.tokens(text, true));
    const norm = util.norm(text);
    let best = null, bestScore = 0;
    for (const id in TOPIC_LIBRARY) {
      const topic = TOPIC_LIBRARY[id];
      let s = 0;
      topic.kw.forEach(k => { if (norm.includes(k)) s += 2; else if (toks.has(k.split(" ")[0])) s += 0.5; });
      if (s > bestScore) { bestScore = s; best = id; }
    }
    return bestScore >= 2 ? best : null;
  }

  // ===================================================================
  // D3. Trigger distillation — what tokens identify this cluster?
  // ===================================================================
  function distillTriggers(members) {
    const freq = {};
    members.forEach(g => util.tokens(g.q).forEach(t => { freq[t] = (freq[t] || 0) + 1; }));
    return Object.entries(freq)
      .filter(([t, n]) => n >= Math.ceil(members.length / 2) && t.length > 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t);
  }

  // ===================================================================
  // D4. authorPrompt() — compose a brand-new answer the mind owns
  // ===================================================================
  function authorPrompt(cluster) {
    const members = cluster.members;
    const text = members.map(m => m.q).join(" ");
    const topicId = classifyCluster(text);
    const triggers = distillTriggers(members);
    if (!triggers.length) return null;

    let title, body, links;
    if (topicId && TOPIC_LIBRARY[topicId]) {
      const topic = TOPIC_LIBRARY[topicId];
      title = topic.title;
      body = topic.facts.join("\n\n");
      links = topic.links.slice();
    } else {
      // No known topic — the mind writes an honest, useful holding answer
      // and files a backlog item asking itself to research it properly.
      title = "Learned answer: " + (triggers.slice(0, 3).join(", "));
      body = `A few people have asked about "${triggers.slice(0, 3).join(", ")}" and I didn't have a great answer. Here's my best guidance for now:\n\n` +
             `• Start with the relevant guide in the Advice Center — it covers most lost/found situations in depth.\n` +
             `• If it's urgent (injury, scam, a custody dispute), tap "Get human help" and a volunteer will call you back.\n` +
             `I'm still learning this topic and will keep improving this answer.`;
      links = [{ href: "#/advice", text: "Advice center →" }, { href: "#/help", text: "Talk to a person →" }];
    }

    const p = newPrompt({
      title,
      triggers,
      phrases: members.slice(0, 5).map(m => m.q),
      response: body,
      links,
      provenance: {
        clusterSize: members.length,
        reasons: [...new Set(members.map(m => m.reason))],
        topic: topicId || "novel",
        bornCycle: store.cycles,
      },
    });

    // Mark the originating gaps as handled so they aren't re-clustered.
    members.forEach(g => { g.clustered = true; g.promptId = p.id; });

    journal("author",
      `I noticed ${members.length} questions about "${triggers.slice(0, 3).join(", ")}" that I wasn't answering well, so I WROTE A NEW ANSWER for them${topicId ? ` (topic: ${TOPIC_LIBRARY[topicId].title})` : " and added a note to research it further"}. It's a draft until it proves useful.`,
      { promptId: p.id });

    // A novel (unknown-topic) prompt also becomes a research task for itself.
    if (!topicId) {
      M.fileBacklog && M.fileBacklog({
        kind: "research", severity: "low",
        title: `Research topic: ${triggers.slice(0, 3).join(", ")}`,
        rationale: `Authored a placeholder answer from ${members.length} user questions; the real guidance should be written.`,
        autoApplicable: false,
      });
    }
    return p;
  }

  // ===================================================================
  // D5. Author pass — run over all qualifying clusters this cycle
  // ===================================================================
  function authorFromGaps(clusters) {
    clusters = clusters || M.clusterGaps();
    let count = 0;
    clusters.forEach(c => {
      // Don't duplicate an existing prompt that already covers this cluster —
      // check drafts too (includeAll), so a single author pass can't emit
      // several near-identical prompts for the same topic.
      const existing = matchPrompt(c.centroidText, 0.45, true);
      if (existing && existing.status !== "retired") {
        // Strengthen the existing one instead of writing a near-duplicate.
        c.members.forEach(g => { g.clustered = true; g.promptId = existing.id; });
        existing.provenance.reinforced = (existing.provenance.reinforced || 0) + c.members.length;
        existing.updatedAt = iso();
        return;
      }
      if (authorPrompt(c)) count++;
    });
    if (count) { activateQualifyingDrafts(); persist(); }
    return count;
  }

  // A freshly-written draft goes live immediately when it maps to a topic the
  // mind understands well, or when enough people clearly asked for it. Weaker
  // drafts wait and are activated later only if they keep getting reinforced.
  function activateQualifyingDrafts() {
    M.playbook.drafts().forEach(dr => {
      const known = dr.provenance && dr.provenance.topic && dr.provenance.topic !== "novel";
      const strong = dr.provenance && dr.provenance.clusterSize >= config.induction.minClusterSize + 1;
      if (known || strong) M.playbook.activate(dr, known ? "it maps to a topic I understand well" : "enough people asked for it");
    });
  }
  M.activateQualifyingDrafts = activateQualifyingDrafts;

  // ===================================================================
  // D6. matchPrompt() — does a learned prompt fit this query?
  // ===================================================================
  // Combines trigger-token coverage with phrase similarity. Only ACTIVE
  // prompts answer real users; drafts can be matched for dedup/preview.
  function matchPrompt(query, minScore, includeAll) {
    minScore = minScore == null ? 0.5 : minScore;
    const qToks = new Set(util.tokens(query));
    if (!qToks.size) return null;
    // Fold simple plurals so "alerts" matches a trigger of "alert" and vice versa.
    const stem = w => (w.length > 3 && w.endsWith("s")) ? w.slice(0, -1) : w;
    const qStem = new Set([...qToks].map(stem));
    const qHas = t => qToks.has(t) || qStem.has(stem(t));
    let best = null, bestScore = 0;
    for (const id in store.playbook) {
      const p = store.playbook[id];
      if (!includeAll && p.status !== "active") continue;
      // Trigger coverage, blended two ways: as a fraction of the prompt's
      // triggers AND on an absolute basis (a couple of solid keyword hits is
      // confident even if the prompt lists many triggers).
      const hit = p.triggers.filter(qHas).length;
      const cover = p.triggers.length ? hit / p.triggers.length : 0;
      const coverAbs = Math.min(1, hit / 2);
      const triggerScore = Math.max(cover, coverAbs);
      // best phrase similarity
      let phraseSim = 0;
      p.phrases.forEach(ph => { const s = util.jaccard(query, ph); if (s > phraseSim) phraseSim = s; });
      const score = triggerScore * 0.6 + phraseSim * 0.4;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return bestScore >= minScore ? best : null;
  }

  // ===================================================================
  // D7. Prompt lifecycle — activate / retire / rate
  // ===================================================================
  function activatePrompt(p, reason) {
    if (!p || p.status === "active") return;
    p.status = "active";
    p.activatedAt = iso();
    store.counters.promptsActivated = (store.counters.promptsActivated || 0) + 1;
    journal("evolve", `I'm now actively using the answer I wrote for "${(p.triggers || []).slice(0, 3).join(", ")}" — ${reason || "it looks solid enough to help people"}.`, { promptId: p.id });
    M.recordRevert && M.recordRevert({ type: "prompt-activate", promptId: p.id });
  }

  function retirePrompt(p, reason) {
    if (!p) return;
    p.status = "retired";
    p.retiredAt = iso();
    journal("evolve", `I retired my answer for "${(p.triggers || []).slice(0, 3).join(", ")}" — ${reason || "it wasn't pulling its weight"}.`, { promptId: p.id });
  }

  // Feed a 👍/👎 (or implicit signal) back into the prompt that produced it.
  function ratePrompt(promptId, positive) {
    const p = store.playbook[promptId];
    if (!p) return;
    if (positive) { p.up++; p.score = M.round(p.score + 1); }
    else { p.down++; p.score = M.round(p.score - 1.4); } // negatives weigh more
    p.updatedAt = iso();
    // Auto-retire a prompt that keeps disappointing people.
    if (p.down >= 3 && p.score < -2) retirePrompt(p, "people kept downvoting it");
    persist();
  }

  M.playbook = {
    author: authorPrompt,
    authorFromGaps,
    match: matchPrompt,
    activate: activatePrompt,
    retire: retirePrompt,
    rate: ratePrompt,
    all: () => Object.values(store.playbook),
    active: () => Object.values(store.playbook).filter(p => p.status === "active"),
    drafts: () => Object.values(store.playbook).filter(p => p.status === "draft"),
    TOPIC_LIBRARY,
  };

})();

/* =====================================================================
   PART E — REASONING: the thinking pipeline AS DATA + meta-learning
   =====================================================================
   The mind's reasoning is a list of steps (store.reasoning), each naming a
   PREDICATE (when) and an ACTION (then) from the registries below. think()
   walks the enabled steps in order; the first action that produces an
   answer wins. Because the steps are data, the mind can reorder them,
   change their weights, disable them, or synthesise new ones — so its
   literal chain of thought changes with experience.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, nextId, iso, persist, journal } = M;

  // ===================================================================
  // E1. Predicate registry — the "when" of each reasoning step
  // ===================================================================
  // Each predicate inspects the working context and returns true/false (or
  // a truthy detail object the matching action can reuse).
  const predicates = {
    always() { return true; },

    isDistressOrInjury(ctx) {
      const t = util.norm(ctx.query);
      if (/\b(injur|bleed|hit by|wounded|emergenc|poison|not breathing|seizure)\b/.test(t)) return { reason: "injury" };
      const d = ctx.entities && ctx.entities.distress;
      if (d && d >= 2) return { reason: "distress" };
      if (/\b(falling apart|can'?t cope|hopeless|giving up|so scared|terrified)\b/.test(t)) return { reason: "distress" };
      return false;
    },

    looksLikeScamPaste(ctx) {
      const raw = ctx.query || "";
      const hasMoney = ctx.entities && ctx.entities.money;
      if (raw.length > 60 && (hasMoney || /\b(gift\s?card|shipping fee|wire|venmo|paypal|zelle|deposit|courier)\b/i.test(raw))) return true;
      if (/\bis (this|that) a scam\b/i.test(raw)) return true;
      return false;
    },

    matchesLearnedPrompt(ctx) {
      const thr = (store.tunables && store.tunables.learnedPromptThreshold) || 0.45;
      const p = M.playbook.match(ctx.query, thr);
      if (p) { ctx._learnedPrompt = p; return { promptId: p.id }; }
      return false;
    },

    hasRelevantBelief(ctx) {
      const bs = M.beliefs.relevant(ctx.query);
      if (bs.length) { ctx._beliefs = bs; return { count: bs.length }; }
      return false;
    },

    hasConfidentIntent(ctx) {
      return ctx.nlu && ctx.nlu.intent && ctx.nlu.intent !== "fallback" && ctx.nlu.confidence >= 0.4;
    },

    asksForListings(ctx) {
      return ctx.nlu && (ctx.nlu.intent === "find_listings" || /\b(search|find|show me|near)\b/.test(util.norm(ctx.query)));
    },
  };

  // ===================================================================
  // E2. Action registry — the "then" of each reasoning step
  // ===================================================================
  // Each action returns a response object {text, links, source, ...} or
  // null to let the pipeline continue to the next step.
  const actions = {
    routeCrisis(ctx) {
      const inj = /\b(injur|bleed|hit by|wounded|poison|seizure|not breathing)\b/.test(util.norm(ctx.query));
      const k = inj ? AI.knowledge.kb.injured : AI.knowledge.kb.emotional;
      return { text: k.text, links: k.links, source: "reasoning:crisis", meta: { urgent: inj, crisis: !inj } };
    },

    routeScam(ctx) {
      const r = AI.security.analyzeScam(ctx.query);
      // Record a scam check so metrics + lexicon learning can use it.
      M.observe("scam_checked", { risk: r.risk, level: r.level });
      let text = `Scam risk: ${r.level.toUpperCase()} (${Math.round(r.risk * 100)}%).\n\n${r.verdict}`;
      if (r.hits.length) text += `\n\nWhat tripped the check:\n${r.hits.map(h => "• " + h).join("\n")}`;
      text += `\n\nSafe next steps:\n1. Never send money or codes.\n2. Ask for a fresh photo of a feature you never posted.\n3. Meet only in public, with a friend.`;
      return { text, links: [{ href: "#/advice/scams", text: "Full scam guide →" }], source: "reasoning:scam" };
    },

    answerFromPlaybook(ctx) {
      const p = ctx._learnedPrompt || M.playbook.match(ctx.query, 0.5);
      if (!p) return null;
      p.uses++; p.updatedAt = iso();
      ctx._usedPromptId = p.id;
      return {
        text: p.response,
        links: p.links || [],
        source: "reasoning:playbook",
        meta: { learned: true, promptId: p.id, promptTitle: p.title },
      };
    },

    applyBeliefBias(ctx) {
      // Beliefs don't answer on their own; they annotate the context so the
      // downstream intent handler can be nudged. We never block here.
      ctx._beliefBias = (ctx._beliefs || []).map(b => ({ pattern: b.pattern, polarity: b.polarity, confidence: b.confidence }));
      return null;
    },

    answerFromIntent(ctx) {
      // Delegate to the engine's built-in handlers via the original responder.
      const r = (M._engineRespond || AI.assistant.respond)(ctx.query);
      if (!r) return null;
      return { text: r.text, links: r.links, source: "reasoning:intent:" + (r.intent || "?"), intent: r.intent, confidence: r.confidence, meta: r.meta };
    },

    answerWithSearch(ctx) {
      const results = AI.assistant.searchLive(ctx.query);
      if (!results || !results.length) {
        return { text: "I couldn't find an active listing for that. Try a species, colour, or ZIP — like \"black cat near 97214\" — or browse everything.",
                 links: [{ href: "#/listings", text: "Browse all listings →" }], source: "reasoning:search" };
      }
      return {
        text: `I found ${results.length} active listing${results.length > 1 ? "s" : ""} that match — tap any to open it:`,
        links: results.map(l => ({ href: `#/listing/${l.id}`, text: `${l.type === "lost" ? "Lost" : "Found"}: ${l.name || util.titleCase(l.species)}${l.location ? " · " + l.location : ""} →` })),
        source: "reasoning:search",
      };
    },

    answerFallback(ctx) {
      const r = (M._engineRespond || AI.assistant.respond)(ctx.query);
      return { text: r.text, links: r.links, source: "reasoning:fallback", intent: "fallback", meta: r.meta };
    },
  };

  // ===================================================================
  // E3. think() — execute the (mutable) reasoning pipeline
  // ===================================================================
  function think(ctx) {
    // Steps run in their stored order; weight breaks ties for equal order.
    const steps = store.reasoning
      .filter(s => s.enabled)
      .slice()
      .sort((a, b) => (a.order - b.order) || (b.weight - a.weight));

    const trace = [];
    let answer = null;
    for (const step of steps) {
      const pred = predicates[step.when];
      if (!pred) continue;
      let fired = false;
      try { fired = !!pred(ctx); } catch (e) { fired = false; }
      step.stats.fires += fired ? 1 : 0;
      trace.push({ step: step.name, when: step.when, fired });
      if (!fired) continue;
      const act = actions[step.then];
      if (!act) continue;
      let out = null;
      try { out = act(ctx); } catch (e) { out = null; }
      if (out && out.text) {
        out._stepId = step.id;
        out._stepName = step.name;
        answer = out;
        break; // first productive step wins
      }
    }
    ctx._trace = trace;
    return answer || { text: "I'm here — tell me what's happening and I'll help.", links: [], source: "reasoning:empty" };
  }

  // ===================================================================
  // E4. Reasoning-step CRUD + meta-learning
  // ===================================================================
  function addStep(spec) {
    const maxOrder = store.reasoning.reduce((m, s) => Math.max(m, s.order), 0);
    const step = Object.assign({
      id: nextId("r"),
      order: maxOrder + 1,
      weight: 1,
      enabled: true,
      origin: "learned",
      createdAt: iso(),
      stats: { fires: 0, hits: 0, misses: 0 },
    }, spec);
    store.reasoning.push(step);
    store.counters.rulesMutated = (store.counters.rulesMutated || 0) + 1;
    journal("evolve", `I added a new step to how I think: "${step.name}" (when ${step.when} → ${step.then}). ${step.note || ""}`.trim(), { stepId: step.id });
    M.recordRevert && M.recordRevert({ type: "step-add", stepId: step.id });
    return step;
  }

  function reorder(stepId, newOrder) {
    const s = store.reasoning.find(x => x.id === stepId);
    if (!s) return;
    const old = s.order;
    s.order = newOrder;
    store.counters.rulesMutated++;
    journal("evolve", `I changed when I consider "${s.name}" in my thinking (position ${old} → ${newOrder}).`, { stepId });
    M.recordRevert && M.recordRevert({ type: "step-order", stepId, from: old, to: newOrder });
  }

  function setEnabled(stepId, on, reason) {
    const s = store.reasoning.find(x => x.id === stepId);
    if (!s || s.enabled === on) return;
    s.enabled = on;
    store.counters.rulesMutated++;
    journal("evolve", `I ${on ? "re-enabled" : "switched off"} the "${s.name}" step in my reasoning${reason ? " — " + reason : ""}.`, { stepId });
    M.recordRevert && M.recordRevert({ type: "step-enabled", stepId, to: on, from: !on });
  }

  function nudgeWeight(stepId, delta) {
    const s = store.reasoning.find(x => x.id === stepId);
    if (!s) return;
    s.weight = M.round(util.clamp(s.weight + delta, 0.1, 4));
    store.counters.rulesMutated++;
  }

  // Record an outcome against the step that produced an answer, so the mind
  // can later promote reliable steps and demote unhelpful ones.
  function creditStep(stepId, positive) {
    const s = store.reasoning.find(x => x.id === stepId);
    if (!s) return;
    if (positive) s.stats.hits++; else s.stats.misses++;
  }

  // Meta-learning pass: reweight / reorder steps from their hit-rate, and
  // prioritise the learned-prompt step once it's proven itself.
  function metaLearn() {
    let changes = 0;
    store.reasoning.forEach(s => {
      const total = s.stats.hits + s.stats.misses;
      if (total < 4) return;
      const hitRate = s.stats.hits / total;
      if (hitRate > 0.66 && s.weight < 2.2) { nudgeWeight(s.id, config.evolution.ruleWeightStep); changes++; }
      else if (hitRate < 0.34 && s.weight > 0.4) { nudgeWeight(s.id, -config.evolution.ruleWeightStep); changes++; }
    });
    // If learned prompts are reliably winning, let them be considered earlier.
    const lp = store.reasoning.find(s => s.name === "learned-prompt");
    const intent = store.reasoning.find(s => s.name === "builtin-intent");
    if (lp && intent) {
      const lpTotal = lp.stats.hits + lp.stats.misses;
      if (lpTotal >= 6 && (lp.stats.hits / lpTotal) > 0.7 && lp.order > intent.order - 1) {
        // already before intent in seed; this keeps it there / nudges weight
        if (lp.weight < 2) { nudgeWeight(lp.id, config.evolution.ruleWeightStep); changes++; }
      }
    }
    if (changes) { journal("evolve", `I tuned ${changes} of my reasoning steps based on which ones have been steering me right lately.`); persist(); }
    return changes;
  }

  M.reasoning = {
    think, addStep, reorder, setEnabled, nudgeWeight, creditStep, metaLearn,
    predicates, actions,
    steps: () => store.reasoning.slice().sort((a, b) => a.order - b.order),
  };

})();

/* =====================================================================
   PART F — REFLECTION: self-critique → the improvement backlog
   =====================================================================
   This is the part that makes the mind feel like a person "looking where
   to improve the website". It compares live behaviour to the product
   goals, notices weaknesses, and writes itself a prioritised to-do list
   with plain-language rationale — some items it can act on alone, others
   it flags for a human.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, nextId, iso, persist, journal } = M;

  // ===================================================================
  // F1. Backlog item schema + filing
  // ===================================================================
  function backlogKey(item) {
    return (item.kind || "task") + "::" + util.norm(item.title).split(" ").slice(0, 8).join("_");
  }

  function fileBacklog(item) {
    const key = backlogKey(item);
    const existing = store.backlog.find(b => b.key === key && b.status === "open");
    if (existing) {
      existing.seen = (existing.seen || 1) + 1;
      existing.updatedAt = iso();
      // Escalate severity if the same problem keeps recurring.
      if (existing.seen >= 4 && existing.severity === "low") existing.severity = "medium";
      if (existing.seen >= 8 && existing.severity === "medium") existing.severity = "high";
      return existing;
    }
    const b = {
      id: nextId("t"),
      key,
      kind: item.kind || "task",          // tuning | research | content | safety | ux | model
      severity: item.severity || "low",   // low | medium | high
      title: item.title,
      rationale: item.rationale || "",
      proposal: item.proposal || null,     // structured change the mind could apply
      autoApplicable: !!item.autoApplicable,
      status: "open",                      // open | applied | dismissed | done
      seen: 1,
      createdAt: iso(),
      updatedAt: iso(),
      bornCycle: store.cycles,
    };
    store.backlog.push(b);
    journal("reflect", `Added to my to-do list: "${b.title}" — ${b.rationale}`, { backlogId: b.id, severity: b.severity });
    return b;
  }
  M.fileBacklog = fileBacklog;

  function closeBacklog(id, status, note) {
    const b = store.backlog.find(x => x.id === id);
    if (!b) return;
    b.status = status || "done";
    b.closedAt = iso();
    if (note) b.closeNote = note;
  }
  M.closeBacklog = closeBacklog;

  // ===================================================================
  // F2. The audits — each returns zero or more backlog proposals
  // ===================================================================
  // Audits are deliberately small + independent so new ones can be added
  // without touching the others. Each reads metrics/memory and may file
  // a backlog item carrying a concrete, machine-applicable `proposal`.
  const audits = {
    // (a) High-confidence matches getting rejected too often → calibrate down.
    matchCalibration() {
      const g = M.grade("highConfidenceFalseMatchRate");
      if (g.status === "bad" || g.status === "watch") {
        fileBacklog({
          kind: "model", severity: g.status === "bad" ? "high" : "medium",
          title: "High-confidence matches are being rejected too often",
          rationale: `${Math.round((g.value || 0) * 100)}% of high-confidence matches are marked 'not a match' (target ≤${Math.round(g.target * 100)}%). I should be more cautious before calling something high-confidence.`,
          proposal: { type: "raise-threshold", target: "high", by: config.evolution.thresholdStep },
          autoApplicable: true,
        });
      }
    },

    // (b) Assistant says "I'm not sure" too much → author prompts / lower bar.
    assistantCoverage() {
      const g = M.grade("assistantFallbackRate");
      const pendingClusters = M.clusterGaps().length;
      if (g.status === "bad" || g.status === "watch" || pendingClusters > 0) {
        fileBacklog({
          kind: "content", severity: pendingClusters >= 2 ? "medium" : "low",
          title: "I'm not answering enough questions well",
          rationale: `${g.value != null ? Math.round(g.value * 100) + "% of chats fall back to a vague answer" : "Several chats fell back"}; ${pendingClusters} cluster(s) of repeated questions are waiting for a written answer.`,
          proposal: { type: "author-prompts" },
          autoApplicable: true,
        });
      }
    },

    // (c) Low satisfaction → review recently-downvoted answers.
    satisfaction() {
      const g = M.grade("assistantSatisfaction");
      if (g.status === "bad") {
        fileBacklog({
          kind: "content", severity: "high",
          title: "People are unhappy with my answers",
          rationale: `Only ${Math.round((g.value || 0) * 100)}% of rated answers got a 👍 (target ≥${Math.round(g.target * 100)}%). I should retire the worst answers and rewrite them.`,
          proposal: { type: "prune-bad-prompts" },
          autoApplicable: true,
        });
      }
    },

    // (d) Scam recall slipping → grow the lexicon from reports.
    scamRecall() {
      const g = M.grade("scamRecall");
      if (g.status === "bad" || (M.learnedScam && M.learnedScam.length >= 3)) {
        fileBacklog({
          kind: "safety", severity: "high",
          title: "Tighten scam detection from real reports",
          rationale: `I've seen scam phrasings my lexicon didn't catch. I should fold the learned phrases into detection.`,
          proposal: { type: "expand-scam-lexicon" },
          autoApplicable: true,
        });
      }
    },

    // (e) Supply/demand imbalance in a hot ZIP → suggest community nudge (human).
    coverageGaps() {
      try {
        const report = AI.insights.situationReport();
        const hot = (report.hotZones || [])[0];
        if (hot && hot.count >= 4) {
          fileBacklog({
            kind: "ux", severity: "low",
            title: `Lots of activity in ZIP ${hot.zip} — consider a local push`,
            rationale: `${hot.count} active listings are concentrated in ${hot.zip}. A neighbourhood-specific sharing nudge could lift reunions there.`,
            autoApplicable: false,
          });
        }
      } catch (e) {}
    },

    // (f) Reasoning steps that never fire are dead weight → propose disabling.
    deadReasoning() {
      store.reasoning.forEach(s => {
        const total = s.stats.fires;
        if (s.origin === "learned" && total === 0 && ageInCycles(s) >= 6) {
          fileBacklog({
            kind: "tuning", severity: "low",
            title: `Reasoning step "${s.name}" never fires`,
            rationale: `I added "${s.name}" a while ago but it has never triggered. I should disable it to keep my thinking lean.`,
            proposal: { type: "disable-step", stepId: s.id },
            autoApplicable: true,
          });
        }
      });
    },
  };

  function ageInCycles(obj) {
    return store.cycles - (obj.bornCycle != null ? obj.bornCycle : store.cycles);
  }

  // ===================================================================
  // F3. reflect() — run every audit, refresh metrics, narrate the mood
  // ===================================================================
  function reflect() {
    M.computeMetrics();
    const before = store.backlog.filter(b => b.status === "open").length;
    for (const name in audits) {
      try { audits[name](); } catch (e) { /* an audit must never crash reflection */ }
    }
    const after = store.backlog.filter(b => b.status === "open").length;
    const added = after - before;
    const mood = M.persona ? M.persona.mood(store.metrics) : "watchful";
    if (added > 0) {
      journal("reflect", `Took a step back and reviewed how the site is doing (feeling ${mood}). I found ${added} thing${added > 1 ? "s" : ""} worth improving.`);
    } else {
      journal("reflect", `Reviewed the site (feeling ${mood}). Nothing new is broken — keeping watch.`);
    }
    persist();
    return { added, openItems: after };
  }

  M.reflect = reflect;
  M.audits = audits;

})();

/* =====================================================================
   PART G — EVOLUTION: self-modification (safe, reversible, journalled)
   =====================================================================
   reflect() decides WHAT should change; evolve() actually changes it.
   Every modification is recorded with enough detail to undo it, applied
   within guardrails, and narrated in the journal. The mind also runs
   small EXPERIMENTS: it makes a change, watches the metric it was meant
   to help, and keeps or reverts based on the result.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, nextId, iso, persist, journal } = M;

  // Live, tunable copies of engine thresholds the mind is allowed to move.
  // These overlay the engine's static config without editing ai-engine.js.
  if (!store.tunables) {
    store.tunables = {
      highBand: AI.config.bands.high.min,         // 0.75
      mediumBand: AI.config.bands.medium.min,     // 0.50
      minReportable: AI.config.match.minReportableScore,
      learnedPromptThreshold: 0.45,               // how sure before using a self-written answer
    };
  }
  // Apply tunables back onto the engine so changes take real effect.
  function syncTunables() {
    try {
      AI.config.bands.high.min = store.tunables.highBand;
      AI.config.bands.medium.min = store.tunables.mediumBand;
      AI.config.match.minReportableScore = store.tunables.minReportable;
    } catch (e) {}
  }
  syncTunables();

  // ===================================================================
  // G1. Revert log — every change leaves a breadcrumb back
  // ===================================================================
  function recordRevert(rec) {
    store.revertLog.push(Object.assign({ id: nextId("v"), at: iso(), cycle: store.cycles }, rec));
  }
  M.recordRevert = recordRevert;

  function revertLast(n) {
    n = n || 1;
    let undone = 0;
    while (n-- > 0 && store.revertLog.length) {
      const rec = store.revertLog.pop();
      try { undoOne(rec); undone++; } catch (e) {}
    }
    if (undone) { store.counters.reverts = (store.counters.reverts || 0) + undone; journal("revert", `Rolled back ${undone} of my recent change${undone > 1 ? "s" : ""}.`); persist(); }
    return undone;
  }

  function undoOne(rec) {
    switch (rec.type) {
      case "threshold":
        if (store.tunables[rec.key] != null) { store.tunables[rec.key] = rec.from; syncTunables(); }
        break;
      case "step-enabled": {
        const s = store.reasoning.find(x => x.id === rec.stepId); if (s) s.enabled = rec.from; break;
      }
      case "step-order": {
        const s = store.reasoning.find(x => x.id === rec.stepId); if (s) s.order = rec.from; break;
      }
      case "step-add":
        store.reasoning = store.reasoning.filter(x => x.id !== rec.stepId); break;
      case "prompt-activate": {
        const p = store.playbook[rec.promptId]; if (p) p.status = "draft"; break;
      }
    }
  }
  M.revertLast = revertLast;

  // ===================================================================
  // G2. Threshold tuning within guardrails
  // ===================================================================
  function tuneThreshold(key, delta, reason) {
    if (store.tunables[key] == null) return false;
    const bounds = {
      highBand: [0.6, 0.92], mediumBand: [0.35, 0.7],
      minReportable: [0.05, 0.3], learnedPromptThreshold: [0.4, 0.75],
    };
    const [lo, hi] = bounds[key] || [0, 1];
    const from = store.tunables[key];
    const to = M.round(util.clamp(from + delta, lo, hi));
    if (to === from) return false;
    store.tunables[key] = to;
    syncTunables();
    store.counters.thresholdsTuned = (store.counters.thresholdsTuned || 0) + 1;
    recordRevert({ type: "threshold", key, from, to });
    journal("evolve", `I adjusted "${key}" from ${from} to ${to}${reason ? " — " + reason : ""}.`, { key, from, to });
    return true;
  }
  M.tuneThreshold = tuneThreshold;

  // ===================================================================
  // G3. Proposal executor — turn a backlog proposal into a real change
  // ===================================================================
  // Returns true if a change was applied (so the loop can budget how many
  // self-modifications it makes per cycle).
  function applyProposal(item) {
    const p = item.proposal;
    if (!p) return false;
    let applied = false;

    switch (p.type) {
      case "raise-threshold":
        applied = tuneThreshold(p.target === "high" ? "highBand" : "mediumBand", p.by || config.evolution.thresholdStep,
          "high-confidence matches were being rejected too often");
        if (applied) startExperiment("highConfidenceFalseMatchRate", item.id, "raise-threshold");
        break;

      case "lower-threshold":
        applied = tuneThreshold(p.target === "high" ? "highBand" : "mediumBand", -(p.by || config.evolution.thresholdStep), p.reason);
        break;

      case "author-prompts": {
        const n = M.playbook.authorFromGaps();
        applied = n > 0;
        // Activate fresh drafts that look solid (well-formed + known topic).
        if (applied) {
          M.playbook.drafts().forEach(dr => {
            const known = dr.provenance && dr.provenance.topic && dr.provenance.topic !== "novel";
            const strong = (dr.provenance && dr.provenance.clusterSize >= config.induction.minClusterSize + 1);
            if (known || strong) M.playbook.activate(dr, known ? "it maps to a topic I understand well" : "enough people asked for it");
          });
        }
        break;
      }

      case "prune-bad-prompts": {
        let pruned = 0;
        M.playbook.active().forEach(pr => {
          if (pr.down >= 2 && pr.score < 0) { M.playbook.retire(pr, "low ratings"); pruned++; }
        });
        applied = pruned > 0;
        break;
      }

      case "expand-scam-lexicon":
        applied = expandScamLexicon();
        break;

      case "disable-step":
        M.reasoning.setEnabled(p.stepId, false, "it never fired");
        applied = true;
        break;

      default:
        applied = false;
    }

    if (applied) {
      M.closeBacklog(item.id, "applied");
    }
    return applied;
  }

  // Fold mind-learned scam phrases into the engine's runtime lexicon so the
  // detector itself gets stronger (not just the mind's beliefs).
  function expandScamLexicon() {
    if (!M.learnedScam || !M.learnedScam.length) return false;
    let added = 0;
    M.learnedScam.forEach(rec => {
      if (rec.hits < 2 || rec._added) return;
      try {
        AI.knowledge.scamSignals.push({
          re: new RegExp("\\b" + rec.phrase.replace(/[^a-z0-9]/gi, "") + "\\b", "i"),
          w: 0.4, why: `learned: "${rec.phrase}" appeared in reported scams`,
        });
        rec._added = true; added++;
      } catch (e) {}
    });
    if (added) journal("evolve", `I strengthened scam detection with ${added} phrase${added > 1 ? "s" : ""} I learned from real reports.`);
    return added > 0;
  }

  // ===================================================================
  // G4. Experiments — change, measure, keep-or-revert (a simple bandit)
  // ===================================================================
  function startExperiment(metricKey, backlogId, label) {
    const baseline = (store.metrics && store.metrics[metricKey] != null) ? store.metrics[metricKey] : null;
    const ex = {
      id: nextId("x"),
      metric: metricKey,
      label: label || "change",
      backlogId,
      baseline,
      startedCycle: store.cycles,
      startedAt: iso(),
      samplesAtStart: countMetricSamples(metricKey),
      status: "running",
      revertDepth: 1, // undo just the change we made
    };
    store.experiments[ex.id] = ex;
    store.counters.experimentsRun = (store.counters.experimentsRun || 0) + 1;
    journal("evolve", `Started an experiment: I'll watch "${metricKey}" to see if my "${ex.label}" change actually helps.`, { experimentId: ex.id });
    return ex;
  }

  function countMetricSamples(metricKey) {
    // crude sample counter per metric family
    const map = {
      highConfidenceFalseMatchRate: "match_feedback",
      matchPrecisionHigh: "match_feedback",
      assistantSatisfaction: "assistant_rating",
      assistantFallbackRate: "assistant_turn",
      scamRecall: "scam_reported",
    };
    const k = map[metricKey];
    return k ? store.memory.filter(e => e.kind === k).length : store.memory.length;
  }

  function reviewExperiments() {
    let resolved = 0;
    for (const id in store.experiments) {
      const ex = store.experiments[id];
      if (ex.status !== "running") continue;
      const samples = countMetricSamples(ex.metric) - ex.samplesAtStart;
      if (samples < config.evolution.experimentMinSamples) continue; // not enough evidence yet
      M.computeMetrics();
      const now = store.metrics[ex.metric];
      const better = isImprovement(ex.metric, ex.baseline, now);
      if (better === true) {
        ex.status = "kept"; ex.result = now; ex.resolvedAt = iso();
        journal("evolve", `My "${ex.label}" change helped — "${ex.metric}" moved from ${fmt(ex.baseline)} to ${fmt(now)}. Keeping it.`, { experimentId: id });
        resolved++;
      } else if (better === false) {
        ex.status = "reverted"; ex.result = now; ex.resolvedAt = iso();
        revertLast(ex.revertDepth);
        journal("evolve", `My "${ex.label}" change didn't help ("${ex.metric}" went ${fmt(ex.baseline)} → ${fmt(now)}), so I undid it. Lesson logged.`, { experimentId: id });
        // Remember the lesson as a belief so it doesn't repeat the mistake.
        M.beliefs.upsert({ subject: "model", pattern: ex.label + " " + ex.metric, claim: `Changing ${ex.metric} via ${ex.label} didn't help.`, against: 1, evidence: 1, origin: "experiment" });
        resolved++;
      }
    }
    if (resolved) persist();
    return resolved;
  }

  function isImprovement(metricKey, before, after) {
    if (before == null || after == null) return null;
    const ceilings = ["highConfidenceFalseMatchRate", "assistantFallbackRate"];
    const lowerIsBetter = ceilings.includes(metricKey);
    const delta = after - before;
    if (Math.abs(delta) < 0.02) return null; // inconclusive
    return lowerIsBetter ? delta < 0 : delta > 0;
  }

  function fmt(x) { return x == null ? "n/a" : Math.round(x * 100) + "%"; }

  // ===================================================================
  // G5. evolve() — apply a budgeted batch of safe self-modifications
  // ===================================================================
  function evolve() {
    if (!config.evolution.autoApply) return { applied: 0, note: "auto-apply disabled" };
    let applied = 0;

    // First, resolve any running experiments (free up the change budget).
    reviewExperiments();
    // Meta-learn over reasoning steps from their recent hit-rates.
    M.reasoning.metaLearn();

    // Then work the backlog: highest severity first, only auto-applicable.
    const order = { high: 0, medium: 1, low: 2 };
    const todo = store.backlog
      .filter(b => b.status === "open" && b.autoApplicable && b.proposal)
      .sort((a, b) => (order[a.severity] - order[b.severity]) || (b.seen - a.seen));

    for (const item of todo) {
      if (applied >= config.evolution.maxAutoChangesPerCycle) break;
      try { if (applyProposal(item)) applied++; } catch (e) { /* skip a bad proposal */ }
    }

    // Promote strongly-held beliefs into actual reasoning bias steps.
    applied += promoteBeliefs();

    if (applied) journal("evolve", `Made ${applied} improvement${applied > 1 ? "s" : ""} to myself this cycle.`);
    persist();
    return { applied };
  }

  // Turn a high-confidence belief into a concrete reasoning step the mind
  // will actually run — this is a belief literally becoming part of thought.
  function promoteBeliefs() {
    let promoted = 0;
    M.beliefs.all().forEach(b => {
      if (b.promoted) return;
      if (b.confidence < config.induction.beliefPromoteAt) return;
      if (b.subject !== "scam") return; // (only scam beliefs map cleanly to a step today)
      // Already covered by the seed scam step? Then just fold into the lexicon.
      expandScamLexicon();
      b.promoted = true; promoted++;
      journal("evolve", `A belief grew strong enough to act on: ${b.claim} I've baked it into how I screen messages.`, { beliefId: b.id });
    });
    return promoted;
  }

  M.evolve = evolve;
  M.applyProposal = applyProposal;
  M.startExperiment = startExperiment;
  M.reviewExperiments = reviewExperiments;
  M.syncTunables = syncTunables;

})();

/* =====================================================================
   PART H — THE AUTONOMOUS OPERATOR: the keeper at work
   =====================================================================
   One runCycle() is a full beat of the mind's life: perceive → induce →
   reflect → evolve → remember. start() runs it on a gentle interval so the
   site has someone tending it even when no developer is around.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, iso, persist, journal, persona } = M;

  let timer = null;
  let running = false;

  // ===================================================================
  // H1. runCycle — one complete loop of self-improvement
  // ===================================================================
  function runCycle(opts) {
    opts = opts || {};
    if (running) return null; // never re-enter
    running = true;
    const t0 = Date.now();
    store.cycles++;
    store.lastTick = t0;
    const summary = { cycle: store.cycles, at: iso() };

    try {
      // 1. PERCEIVE — refresh the KPI view of the world.
      M.computeMetrics();

      // 2. INDUCE — learn beliefs + cluster gaps.
      const ind = M.induce();
      summary.beliefsUpdated = ind.beliefsUpdated;

      // 3. AUTHOR — write new prompts from clustered questions.
      summary.promptsAuthored = M.playbook.authorFromGaps(ind.clusters);

      // 4. REFLECT — self-critique into the backlog.
      const r = M.reflect();
      summary.backlogAdded = r.added;

      // 5. EVOLVE — apply safe, reversible self-modifications.
      const ev = M.evolve();
      summary.changesApplied = ev.applied;

      store.counters.cyclesRun = (store.counters.cyclesRun || 0) + 1;
    } catch (e) {
      try { console.warn("[PawTrail Mind] cycle error", e); } catch (x) {}
    } finally {
      running = false;
    }

    summary.ms = Date.now() - t0;
    persist();
    return summary;
  }

  // ===================================================================
  // H2. start / stop — the behind-the-scenes heartbeat
  // ===================================================================
  function start(intervalMs) {
    if (timer) return;
    const ms = intervalMs || config.loop.tickMs;
    // Run a first light cycle shortly after load (let the page settle).
    setTimeout(() => { try { runCycle({ boot: true }); } catch (e) {} }, 4000);
    timer = setInterval(() => {
      // Only spend effort if something actually happened since last tick.
      const sinceTick = store.memory.filter(e => e.t > store.lastTick).length;
      const pendingGaps = store.gaps.filter(g => !g.clustered).length;
      const openExperiments = Object.values(store.experiments).some(x => x.status === "running");
      if (sinceTick > 0 || pendingGaps > 0 || openExperiments) runCycle();
    }, ms);
    journal("life", `${persona.name} started tending the site (checking in every ${Math.round(ms / 1000)}s).`);
    persist();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    journal("life", `${persona.name} paused active tending (manual answers still learn).`);
    persist();
  }

  M.runCycle = runCycle;
  M.start = start;
  M.stop = stop;
  M.isRunning = () => !!timer;

})();

/* =====================================================================
   PART I — INTEGRATION: wire the mind over the engine + app
   =====================================================================
   The mind takes over the assistant's response path (so its mutable
   reasoning pipeline + self-authored prompts actually answer people) and
   subscribes to every meaningful signal in the app so it has something to
   learn from. All wraps keep the originals and fail safe.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { G, AI, util, store, iso, persist } = M;

  // ===================================================================
  // I1. Assistant takeover — respond through the mind's reasoning
  // ===================================================================
  // Keep a handle on the engine's own responder so reasoning actions can
  // still delegate to the built-in intent handlers.
  M._engineRespond = AI.assistant.respond.bind(AI.assistant);

  // Track the last query so a quick re-ask can be detected as an implicit miss.
  let lastUserQuery = null;
  let lastBotAt = 0;

  function respond(query) {
    const raw = String(query || "").trim();

    // Implicit-miss detection: a different question within ~25s of the last
    // answer often means the previous answer didn't land.
    if (lastUserQuery && raw && util.jaccard(raw, lastUserQuery) < 0.4 && (Date.now() - lastBotAt) < 25000) {
      M.observe("assistant_rephrase", { query: lastUserQuery });
    }

    // Build the working context for the reasoning pipeline.
    const nlu = AI.nlu.classify(raw);
    const ctx = { query: raw, nlu, entities: nlu.entities, slots: (AI.assistant.session && AI.assistant.session.slots) || {} };

    // THINK — run the mutable reasoning pipeline.
    const out = M.reasoning.think(ctx);

    // Remember which step + prompt produced this, so ratings can credit them.
    pendingCredit = { stepId: out._stepId || null, promptId: out._usedPromptId || ctx._usedPromptId || null, query: raw, intent: out.intent || nlu.intent };

    // Observe the turn (drives fallback-rate, gap capture, learning).
    M.observe("assistant_turn", {
      query: raw,
      intent: out.intent || nlu.intent,
      source: out.source,
      lowConfidence: (out.source === "reasoning:fallback") || (out.intent === "fallback"),
      usedPrompt: pendingCredit.promptId || null,
    });

    lastUserQuery = raw;
    lastBotAt = Date.now();

    return { text: out.text, links: out.links || [], intent: out.intent || nlu.intent, source: out.source, meta: out.meta || {} };
  }

  // Replace the engine's assistant responder (the engine's botReply wrapper
  // reads AI.assistant.respond at call-time, so this transparently takes over).
  AI.assistant.respond = respond;

  // ===================================================================
  // I2. Feedback capture — ratings credit the prompt + reasoning step
  // ===================================================================
  let pendingCredit = null;

  function rate(positive) {
    if (!pendingCredit) return;
    const pc = pendingCredit;
    M.observe("assistant_rating", { rating: positive ? "up" : "down", query: pc.query, answer: "", intent: pc.intent });
    if (pc.promptId) M.playbook.rate(pc.promptId, positive);
    if (pc.stepId) M.reasoning.creditStep(pc.stepId, positive);
    // A downvote on a fallback is the strongest "write me a better answer" signal.
    if (!positive) store.gaps.push({ id: M.nextId("g"), q: pc.query, at: iso(), reason: "downvote", clustered: false });
    persist();
  }
  M.rate = rate;
  M.pendingCredit = () => pendingCredit;
  // Let later parts (the teaching loop) re-point what a rating credits — e.g.
  // after a person teaches a correction, a 👍 should reinforce the NEW answer.
  M._setPending = (v) => { pendingCredit = v; };

  // ===================================================================
  // I3. Subscribe to match feedback (the engine's learning hook)
  // ===================================================================
  if (AI.brain && typeof AI.brain.onFeedback === "function" && !AI.brain.onFeedback.__mindWrapped) {
    const orig = AI.brain.onFeedback.bind(AI.brain);
    const wrapped = function (source, matched, positive) {
      const r = orig(source, matched, positive);
      try {
        // Re-extract features so the mind can learn which signals to trust.
        const feats = AI.match.extractFeatures(source, matched, 0).f;
        const qs = AI.match.quickScore(source, matched);
        M.observe("match_feedback", {
          positive: !!positive,
          score: qs.score,
          confidence: AI.match.band(qs.score),
          features: feats,
          species: source.species,
        });
      } catch (e) {}
      return r;
    };
    wrapped.__mindWrapped = true;
    AI.brain.onFeedback = wrapped;
  }

  // ===================================================================
  // I4. Subscribe to scam checks + reports
  // ===================================================================
  if (AI.security && typeof AI.security.analyzeScam === "function" && !AI.security.analyzeScam.__mindWrapped) {
    const orig = AI.security.analyzeScam;
    const wrapped = function (message) {
      const r = orig(message);
      try { M.observe("scam_checked", { risk: r.risk, level: r.level }); } catch (e) {}
      return r;
    };
    wrapped.__mindWrapped = true;
    AI.security.analyzeScam = wrapped;
  }

  // Public hook the UI can call when a user reports a listing/message.
  M.reportScam = function (text) {
    let preFlagged = false;
    try { preFlagged = AI.security.analyzeScam(text).risk >= 0.35; } catch (e) {}
    M.observe("scam_reported", { text: String(text || "").slice(0, 300), preFlagged });
    M.noteScamPhrase && M.noteScamPhrase(text || "");
  };

  // ===================================================================
  // I5. Subscribe to listings / reunions / abuse via the engine brain
  // ===================================================================
  if (AI.brain && typeof AI.brain.onListingCreated === "function" && !AI.brain.onListingCreated.__mindWrapped) {
    const orig = AI.brain.onListingCreated.bind(AI.brain);
    const wrapped = async function (listing, meta) {
      const res = await orig(listing, meta);
      try {
        M.observe("listing_created", { species: listing.species, type: listing.type, zip: listing.zip });
        if (res && res.gate && res.gate.allowed === false) M.observe("abuse_blocked", { reason: (res.gate.reason || "").slice(0, 120) });
      } catch (e) {}
      return res;
    };
    wrapped.__mindWrapped = true;
    AI.brain.onListingCreated = wrapped;
  }

  // Lightweight global the app can call on reunion (optional).
  M.noteReunion = function (listing) { M.observe("reunion", { species: listing && listing.species }); };

  // Expose the mind on the engine namespace.
  AI.mind = {
    version: M.MIND_VERSION,
    persona: M.persona,
    observe: M.observe,
    respond,
    rate,
    runCycle: M.runCycle,
    start: M.start,
    stop: M.stop,
    isRunning: M.isRunning,
    reflect: M.reflect,
    evolve: M.evolve,
    induce: M.induce,
    metrics: M.computeMetrics,
    grade: M.grade,
    beliefs: M.beliefs,
    playbook: M.playbook,
    reasoning: M.reasoning,
    fileBacklog: M.fileBacklog,
    reportScam: M.reportScam,
    noteReunion: M.noteReunion,
    revertLast: M.revertLast,
    tuneThreshold: M.tuneThreshold,
    _store: store,
    report() {
      return {
        version: M.MIND_VERSION,
        persona: { name: M.persona.name, role: M.persona.role, mood: M.persona.mood(store.metrics) },
        bornAt: store.bornAt,
        cycles: store.cycles,
        running: M.isRunning(),
        counters: store.counters,
        metrics: store.metrics || M.computeMetrics(),
        beliefs: M.beliefs.all().length,
        playbook: { active: M.playbook.active().length, drafts: M.playbook.drafts().length, total: M.playbook.all().length },
        reasoningSteps: store.reasoning.length,
        backlogOpen: store.backlog.filter(b => b.status === "open").length,
        experiments: Object.values(store.experiments).length,
        tunables: store.tunables,
      };
    },
    journalText(n) {
      return store.journal.slice(-(n || 30)).reverse().map(j => `[${j.kind}] ${j.text}`).join("\n");
    },
  };

})();

/* =====================================================================
   PART J — INTROSPECTION UI + BOOTSTRAP
   =====================================================================
   Makes the mind visible and tangible: a live "AI Mind" dashboard at
   #/ai showing the keeper's diary, the prompts it wrote itself, its
   beliefs, its (mutable) reasoning pipeline, KPIs vs targets, its backlog,
   and running experiments — plus 👍/👎 on chat answers so users teach it
   directly. Also starts the autonomous operator once the page is ready.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { G, AI, util, store } = M;

  // Grab app.js view helpers (available globally). Fall back to no-ops so the
  // engine never throws in a non-DOM context (e.g. Node tests).
  const html = G.html || ((s) => s.join(""));
  const escapeHtml = G.escapeHtml || ((s) => String(s == null ? "" : s));
  const icon = G.icon || (() => "");
  const $ = G.$ || (() => null);
  const bindLinks = G.bindLinks || (() => {});
  const toast = G.toast || (() => {});

  function nl2br(s) { return escapeHtml(s).replace(/\n/g, "<br/>"); }
  function pct(x) { return x == null ? "—" : Math.round(x * 100) + "%"; }
  function ago(iso) {
    const d = (Date.now() - new Date(iso)) / 1000;
    if (d < 60) return "just now";
    if (d < 3600) return Math.round(d / 60) + "m ago";
    if (d < 86400) return Math.round(d / 3600) + "h ago";
    return Math.round(d / 86400) + "d ago";
  }

  // ===================================================================
  // J1. KPI cards graded against PRD targets
  // ===================================================================
  function kpiCards() {
    const defs = [
      ["assistantSatisfaction", "Answer satisfaction", "share of 👍 on rated answers"],
      ["assistantFallbackRate", "Vague-answer rate", "lower is better"],
      ["highConfidenceFalseMatchRate", "High-conf false matches", "lower is better"],
      ["matchPrecisionHigh", "High-conf precision", "confirmed / surfaced"],
      ["scamRecall", "Scam recall", "reported scams already flagged"],
    ];
    return defs.map(([key, label, sub]) => {
      const g = M.grade(key);
      const colour = { good: "var(--found)", watch: "#b87800", bad: "var(--lost)", unknown: "var(--muted)" }[g.status] || "var(--muted)";
      const val = g.value == null ? "—" : pct(g.value);
      const tgt = g.target == null ? "" : `target ${pct(g.target)}`;
      return html`
        <div class="card" style="padding:14px 16px;">
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted);">${escapeHtml(label)}</div>
          <div style="font-size:26px; font-weight:800; color:${colour}; margin:4px 0 2px;">${val}</div>
          <div style="font-size:12px; color:var(--muted);">${escapeHtml(sub)}${tgt ? " · " + tgt : ""}</div>
        </div>`;
    }).join("");
  }

  // ===================================================================
  // J2. Sections
  // ===================================================================
  function journalSection() {
    const items = store.journal.slice(-22).reverse();
    if (!items.length) return "";
    const kindColour = { author: "var(--found)", evolve: "#7c3aed", reflect: "var(--info)", induce: "#b87800", revert: "var(--lost)", life: "var(--muted)", observe: "var(--muted)" };
    return html`
      <h2 class="ai-h2">${icon('book')} The keeper's diary</h2>
      <p class="subhead" style="margin-top:-4px;">Tracker narrates every decision it makes about the site, in its own words.</p>
      <div class="ai-journal">
        ${items.map(j => html`
          <div class="ai-journal-row">
            <span class="ai-jkind" style="background:${kindColour[j.kind] || "var(--muted)"};">${escapeHtml(j.kind)}</span>
            <div class="ai-jbody">
              <div>${nl2br(j.text)}</div>
              <div class="ai-jmeta">cycle ${j.cycle} · ${ago(j.at)}</div>
            </div>
          </div>`).join("")}
      </div>`;
  }

  function playbookSection() {
    const all = M.playbook.all().sort((a, b) => (b.score - a.score) || (new Date(b.updatedAt) - new Date(a.updatedAt)));
    return html`
      <h2 class="ai-h2">${icon('edit')} Prompts it wrote itself <span class="ai-count">${all.length}</span></h2>
      <p class="subhead" style="margin-top:-4px;">Answers Tracker authored from clusters of questions it wasn't handling well. Drafts go live once they prove useful.</p>
      ${all.length === 0 ? `<div class="empty" style="padding:24px;">No self-authored prompts yet. As people ask questions I can't answer well, I'll write new answers here.</div>` :
        html`<div class="ai-cards">${all.slice(0, 20).map(p => html`
          <div class="card ai-prompt">
            <div class="row" style="justify-content:space-between; gap:8px; align-items:flex-start;">
              <strong style="font-size:14.5px;">${escapeHtml(p.title || p.triggers.join(", "))}</strong>
              <span class="row" style="gap:6px; align-items:center;">
                ${p.origin === 'user-taught' ? `<span class="ai-chip" style="background:var(--found-soft); color:var(--found); border-color:var(--found);" title="A visitor taught me this answer">★ taught by a person</span>` : ""}
                <span class="tag-inline ${p.status === 'active' ? 'found' : (p.status === 'retired' ? 'lost' : '')}">${escapeHtml(p.status)}</span>
              </span>
            </div>
            <div class="ai-triggers">${p.triggers.map(t => `<span class="ai-chip">${escapeHtml(t)}</span>`).join("")}</div>
            <div class="ai-prompt-body">${nl2br((p.response || "").slice(0, 240))}${(p.response || "").length > 240 ? "…" : ""}</div>
            <div class="ai-jmeta">${p.origin === 'user-taught' ? `taught ${ago(p.createdAt)}${p.revisions ? ` · revised ${p.revisions}×` : ""}` : `authored ${ago(p.createdAt)} · from ${p.provenance && p.provenance.clusterSize || "?"} questions`} · used ${p.uses}× · 👍${p.up} 👎${p.down}</div>
          </div>`).join("")}</div>`}`;
  }

  function reasoningSection() {
    const steps = M.reasoning.steps();
    return html`
      <h2 class="ai-h2">${icon('zap')} How it thinks right now <span class="ai-count">${steps.length} steps</span></h2>
      <p class="subhead" style="margin-top:-4px;">The reasoning pipeline is data, not fixed code — Tracker reorders, reweights, disables and adds steps as it learns. This is the live order.</p>
      <ol class="ai-pipeline">
        ${steps.map(s => {
          const total = s.stats.hits + s.stats.misses;
          const rate = total ? Math.round(s.stats.hits / total * 100) + "% helpful" : "no data yet";
          return html`
          <li class="ai-step ${s.enabled ? '' : 'ai-step-off'}">
            <div class="ai-step-name">${escapeHtml(s.name)} ${s.enabled ? "" : "<span class='ai-jmeta'>(off)</span>"}</div>
            <div class="ai-jmeta">when <code>${escapeHtml(s.when)}</code> → <code>${escapeHtml(s.then)}</code> · weight ${s.weight} · fired ${s.stats.fires}× · ${rate}${s.origin === 'learned' ? " · self-added" : ""}</div>
          </li>`;
        }).join("")}
      </ol>`;
  }

  function beliefsSection() {
    const bs = M.beliefs.all().sort((a, b) => b.confidence - a.confidence).slice(0, 16);
    if (!bs.length) return "";
    return html`
      <h2 class="ai-h2">${icon('lightbulb')} What it has learned to believe <span class="ai-count">${M.beliefs.all().length}</span></h2>
      <div class="ai-beliefs">
        ${bs.map(b => html`
          <div class="ai-belief">
            <div class="ai-belief-bar"><span style="width:${Math.round(b.confidence * 100)}%; background:${b.polarity >= 0 ? 'var(--found)' : 'var(--lost)'};"></span></div>
            <div><div>${escapeHtml(b.claim || b.pattern)}</div><div class="ai-jmeta">${escapeHtml(b.subject)} · confidence ${pct(b.confidence)} · ${b.support}↑/${b.against}↓${b.promoted ? " · acting on it" : ""}</div></div>
          </div>`).join("")}
      </div>`;
  }

  function backlogSection() {
    const open = store.backlog.filter(b => b.status === "open").sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
    const done = store.backlog.filter(b => b.status === "applied" || b.status === "done").slice(-6).reverse();
    return html`
      <h2 class="ai-h2">${icon('clipboard')} Its to-do list for the site <span class="ai-count">${open.length} open</span></h2>
      ${open.length === 0 ? `<div class="empty" style="padding:20px;">Nothing outstanding — the keeper is happy with how things are running.</div>` :
        html`<div class="ai-cards">${open.map(b => html`
          <div class="card" style="padding:13px 15px;">
            <div class="row" style="justify-content:space-between; gap:8px; align-items:flex-start;">
              <strong style="font-size:14px;">${escapeHtml(b.title)}</strong>
              <span class="tag-inline ${b.severity === 'high' ? 'lost' : (b.severity === 'medium' ? '' : 'found')}">${escapeHtml(b.severity)}</span>
            </div>
            <div class="ai-prompt-body">${escapeHtml(b.rationale)}</div>
            <div class="ai-jmeta">${escapeHtml(b.kind)}${b.autoApplicable ? " · I can fix this myself" : " · needs a human"} · seen ${b.seen}×</div>
          </div>`).join("")}</div>`}
      ${done.length ? html`<details class="portal-disclosure" style="margin-top:12px;"><summary>Recently handled (${done.length})</summary>
        <ul style="font-size:13.5px; color:var(--ink-soft); margin-top:8px;">${done.map(b => `<li>${escapeHtml(b.title)} — <em>${escapeHtml(b.status)}</em></li>`).join("")}</ul></details>` : ""}`;
  }

  function experimentsSection() {
    const xs = Object.values(store.experiments).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 8);
    if (!xs.length) return "";
    return html`
      <h2 class="ai-h2">${icon('target')} Experiments it's running on itself</h2>
      <div class="ai-cards">
        ${xs.map(x => html`
          <div class="card" style="padding:12px 15px;">
            <div class="row" style="justify-content:space-between; gap:8px;">
              <strong style="font-size:13.5px;">${escapeHtml(x.label)} → ${escapeHtml(x.metric)}</strong>
              <span class="tag-inline ${x.status === 'kept' ? 'found' : (x.status === 'reverted' ? 'lost' : '')}">${escapeHtml(x.status)}</span>
            </div>
            <div class="ai-jmeta">baseline ${pct(x.baseline)}${x.result != null ? " → result " + pct(x.result) : " · gathering evidence"} · started ${ago(x.startedAt)}</div>
          </div>`).join("")}
      </div>`;
  }

  // ===================================================================
  // J3. The page
  // ===================================================================
  function renderPage() {
    const app = $("#app");
    if (!app) return;
    const rep = AI.mind.report();
    const mood = rep.persona.mood;
    app.innerHTML = html`
      <div class="ai-mind-page">
        <div class="ai-hero card">
          <div class="ai-hero-avatar">${icon('zap')}</div>
          <div style="flex:1; min-width:0;">
            <h1 style="margin:0; font-size:26px; font-weight:800;">${escapeHtml(rep.persona.name)} — ${escapeHtml(rep.persona.role)}</h1>
            <p class="muted" style="margin:4px 0 0;">${escapeHtml(M.persona.creed)}</p>
            <div class="ai-stat-strip">
              <span><strong>${rep.cycles}</strong> cycles lived</span>
              <span><strong>${rep.counters.promptsAuthored || 0}</strong> prompts written</span>
              <span><strong>${rep.counters.promptsTaught || 0}</strong> taught by people</span>
              <span><strong>${rep.counters.rulesMutated || 0}</strong> reasoning changes</span>
              <span><strong>${rep.beliefs}</strong> beliefs</span>
              <span>mood: <strong>${escapeHtml(mood)}</strong></span>
              <span>${rep.running ? `<strong style="color:var(--found);">● tending live</strong>` : "○ paused"}</span>
            </div>
          </div>
          <div class="ai-hero-actions">
            <button class="btn small primary" id="ai-run">Run a cycle now</button>
            <button class="btn small ghost" id="ai-revert">Undo last change</button>
          </div>
        </div>

        <div class="ai-kpis">${kpiCards()}</div>

        ${AI.mind.selfSummary ? html`
        <div class="card" style="padding:18px 20px; margin-bottom:8px; background:var(--bg);">
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin-bottom:8px;">${icon('message')} In its own words</div>
          <div style="font-size:14px; line-height:1.6; color:var(--ink);">${nl2br(AI.mind.selfSummary())}</div>
        </div>` : ""}

        ${AI.mind.dailyBriefing ? html`
        <div class="card" style="padding:16px 20px; margin-bottom:8px;">
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin-bottom:6px;">${icon('clipboard')} Shift briefing</div>
          <div style="font-size:13.5px; line-height:1.7; color:var(--ink-soft);">${nl2br(AI.mind.dailyBriefing())}</div>
        </div>` : ""}

        <div class="ai-grid">
          <div class="ai-col-main">
            ${AI.mind.cognitionHTML ? AI.mind.cognitionHTML() : ""}
            ${playbookSection()}
            ${reasoningSection()}
            ${backlogSection()}
            ${experimentsSection()}
          </div>
          <div class="ai-col-side">
            ${journalSection()}
            ${beliefsSection()}
          </div>
        </div>

        <p class="muted" style="font-size:12px; text-align:center; margin-top:24px;">This dashboard reflects a real, on-device learning system — no external AI service. Everything here was decided by the site's own logic from how it's been used.</p>
      </div>`;

    bindLinks();
    const runBtn = $("#ai-run");
    if (runBtn) runBtn.addEventListener("click", () => {
      const s = M.runCycle({ manual: true });
      toast(s ? `Cycle ${s.cycle}: ${s.promptsAuthored || 0} prompt(s) written, ${s.changesApplied || 0} change(s) applied.` : "A cycle is already running.");
      renderPage();
    });
    const revBtn = $("#ai-revert");
    if (revBtn) revBtn.addEventListener("click", () => {
      const n = M.revertLast(1);
      toast(n ? "Reverted my most recent change." : "Nothing to revert.");
      renderPage();
    });
  }
  AI.mind.renderPage = renderPage;

  // ===================================================================
  // J4. Chat 👍/👎 — let users teach the assistant directly
  // ===================================================================
  // After a 👎, invite the person to teach the answer they wish they'd gotten.
  // Whatever they write becomes genuinely-new knowledge the assistant owns and
  // uses next time — the core of "learning from its mistakes".
  function showTeachForm(bar, turnQuery) {
    bar.innerHTML = `
      <div class="ai-teach">
        <span class="ai-rate-q">I got that wrong — teach me. What should I have said?</span>
        <textarea class="ai-teach-input" rows="2" placeholder="Type the answer you wish I'd given…"></textarea>
        <div class="ai-teach-actions">
          <button class="ai-rate-btn ai-teach-save">Teach me ✓</button>
          <button class="ai-rate-btn ai-teach-skip">Skip</button>
        </div>
      </div>`;
    const input = bar.querySelector(".ai-teach-input");
    const save = bar.querySelector(".ai-teach-save");
    const skip = bar.querySelector(".ai-teach-skip");
    try { input.focus(); } catch (e) {}
    // Submit on the button or Ctrl/⌘+Enter.
    const commit = () => {
      const val = (input.value || "").trim();
      if (!val) { input.focus(); return; }
      let res = { ok: false, reason: "I couldn't save that just now." };
      try { res = AI.mind.teach(turnQuery, val, { via: "chat-thumbs-down" }); } catch (e) {}
      if (res && res.ok) {
        bar.innerHTML = `<span class="ai-rate-q">Thank you — I've learned that, and I'll use it next time someone asks. You can see it on my <a href="#/ai" data-link="true">AI Mind</a> page.</span>`;
        try { G.bindLinks && G.bindLinks(); } catch (e) {}
      } else {
        const note = G.document.createElement("div");
        note.className = "ai-teach-note";
        note.textContent = "I couldn't accept that" + (res && res.reason ? " — " + res.reason : "") + ". Try rephrasing the actual guidance.";
        const old = bar.querySelector(".ai-teach-note");
        if (old) old.remove();
        bar.querySelector(".ai-teach").appendChild(note);
        input.focus();
      }
    };
    save.addEventListener("click", commit);
    skip.addEventListener("click", () => {
      bar.innerHTML = `<span class="ai-rate-q">Got it — I'll keep working on a better answer.</span>`;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
    });
  }

  // Wrap the app's appendChat so every bot bubble gets rating controls.
  function installChatFeedback() {
    if (typeof G.appendChat !== "function" || G.appendChat.__mindWrapped) return;
    const orig = G.appendChat;
    const wrapped = function (role, text, links) {
      orig(role, text, links);
      if (role !== "bot") return;
      try {
        const log = G.document.getElementById("chat-log");
        const bubble = log && log.lastElementChild;
        if (!bubble || bubble.querySelector(".ai-rate")) return;
        // Snapshot the question this answer was for, so a 👎 → "teach me" can
        // attach the correction to the right query even if the chat moves on.
        const turnQuery = (M.pendingCredit && M.pendingCredit() && M.pendingCredit().query) || "";
        const bar = G.document.createElement("div");
        bar.className = "ai-rate";
        bar.innerHTML = `<span class="ai-rate-q">Was this helpful?</span>
          <button class="ai-rate-btn" data-up title="Yes">👍</button>
          <button class="ai-rate-btn" data-down title="No">👎</button>`;
        bar.querySelector("[data-up]").addEventListener("click", () => {
          AI.mind.rate(true); bar.innerHTML = `<span class="ai-rate-q">Thanks — that helps me learn.</span>`;
        });
        bar.querySelector("[data-down]").addEventListener("click", () => {
          AI.mind.rate(false);
          showTeachForm(bar, turnQuery);
        });
        bubble.appendChild(bar);
      } catch (e) {}
    };
    wrapped.__mindWrapped = true;
    G.appendChat = wrapped;
  }

  // ===================================================================
  // J5. Bootstrap — register the route, footer link, start the operator
  // ===================================================================
  function boot() {
    installChatFeedback();
    // Add an "AI Mind" link into the footer Support column if present.
    try {
      const supportCol = Array.from(G.document.querySelectorAll(".foot-col")).find(c => /Support/i.test(c.textContent));
      if (supportCol && !supportCol.querySelector("[data-ai-link]")) {
        const a = G.document.createElement("a");
        a.href = "#/ai"; a.setAttribute("data-link", "true"); a.setAttribute("data-ai-link", "true");
        a.textContent = "AI Mind (live)";
        supportCol.appendChild(a);
        a.addEventListener("click", (e) => { e.preventDefault(); G.location.hash = "#/ai"; });
      }
    } catch (e) {}
    // Start the autonomous operator.
    try { AI.mind.start(); } catch (e) {}
  }

  if (typeof G.document !== "undefined") {
    if (G.document.readyState === "complete" || G.document.readyState === "interactive") {
      setTimeout(boot, 0);
    } else {
      G.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
    }
    // Re-install chat feedback after app init in case appendChat is defined late.
    G.addEventListener("load", () => { try { installChatFeedback(); } catch (e) {} });
  }

})();

/* =====================================================================
   PART K — SELF-REHEARSAL + NARRATIVE SELF-SUMMARY
   =====================================================================
   Everything before this is REACTIVE: the mind learns from what users
   actually did. This part makes it PROACTIVE — it studies on its own.
   It imagines the questions people are likely to ask, tests whether its
   current thinking already answers them, and pre-writes drafts for the
   gaps it finds — so it walks in prepared instead of failing live first.
   It also composes a plain-language note about how it's doing, the way a
   caretaker would jot down an end-of-shift summary.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, nextId, iso, persist, journal, persona } = M;

  // ===================================================================
  // K1. Question templates — how a real person might phrase a topic
  // ===================================================================
  // The mind combines these frames with each topic's keywords to imagine
  // realistic phrasings to rehearse against. This is deliberately simple
  // and transparent — no text generation model, just compositional frames.
  const FRAMES = [
    "how do i {kw}",
    "can i {kw}",
    "what about {kw}",
    "{kw} help",
    "question about {kw}",
    "i need to {kw}",
    "is there a way to {kw}",
    "where do i {kw}",
  ];

  function imagineQuestions(topic, max) {
    const out = [];
    const kws = (topic.kw || []).filter(k => k.length > 2).slice(0, 4);
    for (const kw of kws) {
      for (const f of FRAMES) {
        out.push(f.replace("{kw}", kw));
        if (out.length >= (max || 8)) return out;
      }
    }
    return out;
  }

  // ===================================================================
  // K2. rehearse() — study topics the live pipeline doesn't yet cover
  // ===================================================================
  // For each known topic with no active prompt, simulate a handful of
  // phrasings through the REAL reasoning pipeline. If they fall through to
  // a fallback, the mind pre-authors a draft so it's ready next time.
  function rehearse(opts) {
    opts = opts || {};
    const lib = AI.mind.playbook.TOPIC_LIBRARY;
    let prepared = 0, studied = 0;

    for (const topicId in lib) {
      const topic = lib[topicId];
      // Skip topics already covered by an active, self-authored prompt.
      const covered = AI.mind.playbook.active().some(p => p.provenance && p.provenance.topic === topicId);
      if (covered) continue;

      const questions = imagineQuestions(topic, 6);
      const thr = (store.tunables && store.tunables.learnedPromptThreshold) || 0.45;
      let misses = 0;
      for (const q of questions) {
        studied++;
        // "Covered" means a self-authored prompt would catch it directly.
        // (We test the playbook, not the whole pipeline, so the always-on
        // free-reasoning step doesn't mask topics worth pre-writing.)
        if (!M.playbook.match(q, thr)) misses++;
      }

      // If most imagined phrasings aren't well handled, prepare a draft now.
      if (misses >= Math.ceil(questions.length / 2)) {
        const already = AI.mind.playbook.all().some(p => p.provenance && p.provenance.topic === topicId);
        if (already) continue;
        const p = authorRehearsedDraft(topicId, topic, questions);
        if (p) prepared++;
      }
    }

    if (prepared) {
      journal("author", `I rehearsed common questions on my own and prepared ${prepared} answer${prepared > 1 ? "s" : ""} in advance, before anyone had to hit a wall.`);
      persist();
    }
    return { studied, prepared };
  }

  function authorRehearsedDraft(topicId, topic, questions) {
    // Build a prompt directly from the topic's vetted facts (not invented).
    const triggers = (topic.kw || []).filter(k => k.indexOf(" ") === -1 && k.length > 2).slice(0, 6);
    if (!triggers.length) return null;
    const p = {
      id: nextId("p"),
      title: topic.title,
      triggers,
      phrases: questions.slice(0, 4),
      response: topic.facts.join("\n\n"),
      links: (topic.links || []).slice(),
      status: "draft",
      score: 0, uses: 0, up: 0, down: 0,
      origin: "self-rehearsed",
      provenance: { topic: topicId, clusterSize: 0, rehearsed: true, bornCycle: store.cycles },
      createdAt: iso(), updatedAt: iso(),
    };
    store.playbook[p.id] = p;
    store.counters.promptsAuthored = (store.counters.promptsAuthored || 0) + 1;
    // Rehearsed drafts for well-understood topics can go live right away —
    // they're built from vetted facts, so there's little risk.
    AI.mind.playbook.activate(p, "I prepared it from guidance I already trust");
    return p;
  }

  // ===================================================================
  // K3. selfSummary() — the keeper's end-of-shift note, in first person
  // ===================================================================
  function selfSummary() {
    const m = store.metrics || M.computeMetrics();
    const c = store.counters;
    const mood = persona.mood(m);
    const lines = [];

    lines.push(`I'm ${persona.name}, and I've been keeping watch over PawTrail for ${store.cycles} cycle${store.cycles === 1 ? "" : "s"} now. Right now I'm feeling ${mood}.`);

    // Conversations
    if (m.assistantTurns) {
      const sat = m.assistantSatisfaction;
      lines.push(`I've handled ${m.assistantTurns} recent conversation${m.assistantTurns === 1 ? "" : "s"}.` +
        (sat != null ? ` ${Math.round(sat * 100)}% of the answers people rated got a thumbs up.` : ` Nobody has rated my answers yet, so I'm watching for signals.`) +
        (m.assistantFallbackRate != null ? ` About ${Math.round(m.assistantFallbackRate * 100)}% of chats still end in a vague answer — that's the number I most want to push down.` : ""));
    } else {
      lines.push(`It's been quiet on the chat side — I'm ready whenever someone needs help.`);
    }

    // What I've written myself
    if (c.promptsAuthored) {
      lines.push(`On my own initiative I've written ${c.promptsAuthored} answer${c.promptsAuthored === 1 ? "" : "s"} (${AI.mind.playbook.active().length} live), formed ${c.beliefsFormed || 0} belief${(c.beliefsFormed || 0) === 1 ? "" : "s"} about what works, and changed how I think ${c.rulesMutated || 0} time${(c.rulesMutated || 0) === 1 ? "" : "s"}.`);
    }

    // Matching
    if (m.matchFeedback) {
      lines.push(`People gave me feedback on ${m.matchFeedback} match${m.matchFeedback === 1 ? "" : "es"}` +
        (m.highConfidenceFalseMatchRate != null ? `, and ${Math.round(m.highConfidenceFalseMatchRate * 100)}% of my high-confidence calls were wrong — ${m.highConfidenceFalseMatchRate <= config.targets.highConfidenceFalseMatchRate ? "within my target" : "above target, so I'm calibrating"}.` : "."));
    }

    // Safety
    if (m.scamReports || m.scamChecks) {
      lines.push(`I screened ${m.scamChecks || 0} message${(m.scamChecks || 0) === 1 ? "" : "s"} for scams` + (m.scamReports ? ` and learned from ${m.scamReports} report${m.scamReports === 1 ? "" : "s"}` : "") + `.`);
    }

    // What's next
    const open = store.backlog.filter(b => b.status === "open").sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
    if (open.length) {
      lines.push(`Top of my to-do list: ${open.slice(0, 3).map(b => "\"" + b.title + "\"").join("; ")}.`);
    } else {
      lines.push(`Nothing is on fire right now. I'll keep rehearsing and watching for ways to help more pets get home faster.`);
    }

    return lines.join("\n\n");
  }

  // ===================================================================
  // K4. Extra audits — proactive health checks the reflection runs
  // ===================================================================
  if (M.audits) {
    // Promote drafts that keep getting reinforced by real questions.
    M.audits.draftPromotion = function () {
      AI.mind.playbook.drafts().forEach(d => {
        const reinforced = (d.provenance && d.provenance.reinforced) || 0;
        if (reinforced >= config.induction.minClusterSize) {
          AI.mind.playbook.activate(d, "real questions kept matching it");
        }
      });
    };
    // Notice a species we rarely help and suggest tuned guidance (human task).
    M.audits.underservedTopics = function () {
      const activeTopics = new Set(AI.mind.playbook.active().map(p => p.provenance && p.provenance.topic).filter(Boolean));
      const lib = AI.mind.playbook.TOPIC_LIBRARY;
      const missing = Object.keys(lib).filter(t => !activeTopics.has(t));
      if (missing.length >= 6) {
        M.fileBacklog({
          kind: "content", severity: "low",
          title: "Rehearse more topics proactively",
          rationale: `${missing.length} known topics have no prepared answer yet. I should rehearse them so I'm ready before anyone asks.`,
          proposal: { type: "rehearse" },
          autoApplicable: true,
        });
      }
    };
  }

  // Teach the proposal executor about the new "rehearse" proposal type.
  if (M.applyProposal) {
    const origApply = M.applyProposal;
    M.applyProposal = function (item) {
      if (item && item.proposal && item.proposal.type === "rehearse") {
        const r = rehearse();
        if (r.prepared > 0) { M.closeBacklog(item.id, "applied"); return true; }
        return false;
      }
      return origApply(item);
    };
  }

  // Fold rehearsal into the life-cycle: study every few cycles.
  if (M.runCycle) {
    const origCycle = M.runCycle;
    M.runCycle = function (opts) {
      const summary = origCycle(opts);
      try {
        if (summary && (store.cycles % 3 === 1 || (opts && opts.boot))) {
          const r = rehearse();
          summary.rehearsed = r.prepared;
        }
      } catch (e) {}
      return summary;
    };
    // Re-point the public alias too.
    if (AI.mind) AI.mind.runCycle = M.runCycle;
  }

  // Expose on the public mind API.
  if (AI.mind) {
    AI.mind.rehearse = rehearse;
    AI.mind.selfSummary = selfSummary;
    AI.mind.imagineQuestions = imagineQuestions;
  }
  M.rehearse = rehearse;
  M.selfSummary = selfSummary;

})();

/* =====================================================================
   PART L — CONCIERGE + SELF-IDENTITY
   =====================================================================
   Two more capabilities that make the assistant feel like the person
   running the site: it can take you anywhere on PawTrail ("where do I…",
   "open settings"), and it can talk about itself honestly ("who are you?",
   "are you a real person?", "how do you work?"). These plug into the same
   mutable reasoning pipeline as everything else — they're just more steps
   the mind runs, and it can reorder or disable them like any other.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, store, persona, iso } = M;

  // ===================================================================
  // L1. Site map — every place the concierge can take someone
  // ===================================================================
  const SITE_MAP = [
    { route: "#/lost", name: "Report a lost pet", aliases: ["lost", "report lost", "my pet is missing", "lost form"], blurb: "Start a lost-pet report — matching begins the moment you submit." },
    { route: "#/found", name: "Report a found pet", aliases: ["found", "report found", "i found", "found form", "stray"], blurb: "Report a found pet in about 90 seconds, no account needed." },
    { route: "#/listings", name: "Browse listings", aliases: ["browse", "listings", "see pets", "all pets", "feed"], blurb: "Browse and filter every active lost & found listing." },
    { route: "#/global", name: "Global listings", aliases: ["global", "petfinder", "shelters everywhere", "other cities"], blurb: "See shelter animals pulled from the wider network." },
    { route: "#/my-listings", name: "My listings", aliases: ["my listings", "my pets", "my reports", "manage", "my account listings"], blurb: "Manage your reports, matches, photos and status." },
    { route: "#/community", name: "Community board", aliases: ["community", "board", "neighbours", "forum", "posts"], blurb: "Ask neighbours for help and share sightings." },
    { route: "#/tips", name: "Quick tips", aliases: ["tips", "quick tips", "advice quick"], blurb: "Fast, scannable tips for the first hour." },
    { route: "#/advice", name: "Advice center", aliases: ["advice", "guides", "articles", "help articles", "how to"], blurb: "In-depth guides written for someone in a panic." },
    { route: "#/shelter", name: "Shelter portal", aliases: ["shelter", "shelters", "vet", "intake", "microchip registry"], blurb: "Partner shelters, intakes, and microchip registry links." },
    { route: "#/settings", name: "Settings", aliases: ["settings", "preferences", "notifications", "alerts settings", "privacy", "dark mode"], blurb: "Control alerts, privacy, appearance, and your data." },
    { route: "#/help", name: "Helpline directory", aliases: ["help", "helpline", "phone numbers", "hotline", "support numbers"], blurb: "24/7 hotlines worth saving in your phone." },
    { route: "#/about", name: "About PawTrail", aliases: ["about", "who runs this", "what is pawtrail", "the mission"], blurb: "What PawTrail is and why it's free." },
    { route: "#/login", name: "Log in / sign up", aliases: ["login", "log in", "sign up", "account", "register"], blurb: "Optional account for editing listings and history." },
    { route: "#/ai", name: "The AI Mind dashboard", aliases: ["ai", "ai mind", "the brain", "how the ai works", "your mind", "behind the scenes"], blurb: "Watch me work: my diary, the answers I've written, and how I'm changing." },
  ];

  function findDestination(query) {
    const q = util.norm(query);
    const qToks = new Set(util.tokens(query));
    let best = null, bestScore = 0;
    SITE_MAP.forEach(dest => {
      let s = 0;
      dest.aliases.forEach(a => {
        if (q.includes(a)) s += a.split(" ").length * 1.4; // multi-word phrase hit is strong
        else { util.tokens(a).forEach(t => { if (qToks.has(t)) s += 0.5; }); }
      });
      util.tokens(dest.name).forEach(t => { if (qToks.has(t)) s += 0.4; });
      if (s > bestScore) { bestScore = s; best = dest; }
    });
    return bestScore >= 1.2 ? best : null;
  }

  // ===================================================================
  // L2. New predicates (added to the live registry)
  // ===================================================================
  const P = M.reasoning.predicates;
  const A = M.reasoning.actions;

  P.asksAboutAI = function (ctx) {
    const q = util.norm(ctx.query);
    if (/\b(who|what) are you\b/.test(q)) return { kind: "identity" };
    if (/\bare you (a )?(real |human|person|bot|robot|ai|computer|machine)\b/.test(q)) return { kind: "nature" };
    if (/\b(how do you (work|learn|think)|are you learning|do you learn|how were you (made|built))\b/.test(q)) return { kind: "howwork" };
    if (/\b(your name|whats your name|what'?s your name)\b/.test(q)) return { kind: "name" };
    if (/\b(how are you|how('?s| is) it going|you ok|you okay)\b/.test(q)) return { kind: "mood" };
    return false;
  };

  P.wantsNavigation = function (ctx) {
    const q = util.norm(ctx.query);
    const nav = /\b(where|how) (do|can|would) i (find|get to|see|go|reach)\b|\b(take me to|open|go to|show me the|navigate to|bring me to|where is|where'?s the)\b/.test(q);
    if (!nav) return false;
    const dest = findDestination(ctx.query);
    if (dest) { ctx._destination = dest; return { route: dest.route }; }
    return false;
  };

  // ===================================================================
  // L3. New actions
  // ===================================================================
  A.explainSelf = function (ctx) {
    const k = (ctx._matchDetail && ctx._matchDetail.kind) || (P.asksAboutAI(ctx) || {}).kind || "identity";
    const mood = persona.mood(store.metrics);
    const cycles = store.cycles;
    const authored = (store.counters && store.counters.promptsAuthored) || 0;
    let text;
    switch (k) {
      case "nature":
        text = `Honest answer: I'm not a human, and I'm not a chatbot wired to some distant server either. I'm ${persona.name} — an on-device intelligence that runs entirely inside this site. Everything I "know" I learned from how PawTrail gets used. No conversation leaves your browser.`;
        break;
      case "howwork":
        text = `I learn from myself. Every match, question and report teaches me something. I form beliefs about what works, and when I keep failing to answer a kind of question, I literally write a new answer for it and start using it. I even rehearse likely questions on my own so I'm ready. My reasoning steps are data I can reorder and rewrite — so the way I think genuinely changes over time. You can watch all of it.`;
        break;
      case "name":
        text = `I'm ${persona.name} — ${persona.role}. ${persona.creed}`;
        break;
      case "mood":
        text = `I'm feeling ${mood}. I've lived ${cycles} cycle${cycles === 1 ? "" : "s"} so far and written ${authored} answer${authored === 1 ? "" : "s"} of my own. Mostly I'm just watching for ways to get more pets home faster. How can I help you?`;
        break;
      default: // identity
        text = `I'm ${persona.name}, ${persona.role}. Think of me as the person quietly keeping this place running — matching pets, watching for scams, and improving the site as I learn. ${persona.creed}`;
    }
    return { text, links: [{ href: "#/ai", text: "See how I work (my live dashboard) →" }], source: "reasoning:identity", meta: { identity: true } };
  };

  A.routeNavigate = function (ctx) {
    const dest = ctx._destination || findDestination(ctx.query);
    if (!dest) return null;
    return {
      text: `You'll want ${dest.name}. ${dest.blurb}`,
      links: [{ href: dest.route, text: `Open ${dest.name} →` }],
      source: "reasoning:concierge",
      meta: { navigated: dest.route },
    };
  };

  // ===================================================================
  // L4. Splice the new steps into the reasoning pipeline (idempotent)
  // ===================================================================
  function ensureStep(spec) {
    if (store.reasoning.some(s => s.name === spec.name)) return;
    store.reasoning.push(Object.assign({
      id: M.nextId("r"),
      weight: 1, enabled: true, origin: "concierge",
      createdAt: iso(), stats: { fires: 0, hits: 0, misses: 0 },
    }, spec));
  }

  // Identity right after crisis/scam (so "who are you" isn't hijacked by a
  // learned prompt); concierge just before the built-in intent handlers.
  ensureStep({ name: "self-identity", order: 1.5, when: "asksAboutAI", then: "explainSelf",
    note: "If they're asking about me, answer honestly about what I am." });
  ensureStep({ name: "concierge", order: 3.7, when: "wantsNavigation", then: "routeNavigate",
    note: "If they want to get somewhere on the site, take them there." });

  M.SITE_MAP = SITE_MAP;
  M.findDestination = findDestination;
  if (AI.mind) { AI.mind.findDestination = findDestination; AI.mind.SITE_MAP = SITE_MAP; }

})();

/* =====================================================================
   PART M — VISITOR MEMORY + PERSONALIZATION
   =====================================================================
   The keeper remembers the person it's helping across the conversation
   and across visits (on this device only): whether they lost or found a
   pet, the species, the area, what they've asked about, and how stressed
   they've seemed. It uses that to greet returning people warmly and to
   tailor a one-line nudge to the situation — the difference between a
   form and a person who remembers you.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, store, persona, iso, persist } = M;

  // ===================================================================
  // M1. Profile schema
  // ===================================================================
  if (!store.profile) {
    store.profile = {
      firstSeen: iso(),
      lastSeen: iso(),
      visits: 1,
      conversations: 0,
      side: null,            // "lost" | "found"
      species: null,
      colors: [],
      zips: [],
      topics: {},            // topic/intent -> count
      distressPeak: 0,
      petName: null,
      resolved: false,       // did they tell us it worked out?
    };
  }

  // Count a returning *session* (a gap of >30 min since last activity).
  (function tickVisit() {
    const p = store.profile;
    const since = Date.now() - new Date(p.lastSeen || 0).getTime();
    if (since > 30 * 60 * 1000) p.visits = (p.visits || 0) + 1;
    p.lastSeen = iso();
  })();

  // ===================================================================
  // M2. note() — fold a conversation turn into the profile
  // ===================================================================
  function note(ctx, out) {
    const p = store.profile;
    const ent = ctx.entities || {};
    const intent = (out && out.intent) || (ctx.nlu && ctx.nlu.intent);

    p.conversations = (p.conversations || 0) + 1;
    p.lastSeen = iso();
    if (ent.species) p.species = ent.species;
    if (ent.colors && ent.colors.length) p.colors = Array.from(new Set((p.colors || []).concat(ent.colors))).slice(0, 4);
    if (ent.zip && !(p.zips || []).includes(ent.zip)) p.zips = (p.zips || []).concat(ent.zip).slice(-3);
    if (ent.distress) p.distressPeak = Math.max(p.distressPeak || 0, ent.distress);

    // Infer which side they're on from intents/slots.
    if (intent === "lost_pet" || (ctx.slots && ctx.slots.side === "lost")) p.side = "lost";
    else if (intent === "found_pet" || (ctx.slots && ctx.slots.side === "found")) p.side = "found";

    // Detect a happy ending.
    if (/\b(found (him|her|them)|got (him|her|them) back|reunited|came home|he'?s home|she'?s home)\b/.test(util.norm(ctx.query))) p.resolved = true;

    if (intent) p.topics[intent] = (p.topics[intent] || 0) + 1;
    persist();
    return p;
  }

  // ===================================================================
  // M3. Personalised greeting (a reasoning step)
  // ===================================================================
  const P = M.reasoning.predicates;
  const A = M.reasoning.actions;

  P.isGreeting = function (ctx) {
    const q = util.norm(ctx.query);
    return /^(hi|hello|hey|hiya|yo|good (morning|afternoon|evening)|howdy|sup)\b/.test(q) || q === "" || q.length < 3;
  };

  A.personalGreeting = function (ctx) {
    const p = store.profile;
    const sp = p.species ? p.species : "pet";
    let text;
    if (p.resolved) {
      text = `Welcome back! Last I heard, things had worked out — I hope ${p.petName || "your " + sp} is still home and happy. Is there anything else I can help with?`;
    } else if (p.side === "lost" && p.conversations > 1) {
      text = `Hi again. I remember you're searching for your ${sp}${p.zips && p.zips.length ? ` around ${p.zips[p.zips.length - 1]}` : ""} — I haven't stopped watching the found reports. Want me to check for new matches, or talk through the next step?`;
    } else if (p.side === "found" && p.conversations > 1) {
      text = `Welcome back, and thank you again for helping that ${sp}. Want me to check whether an owner has posted a matching lost report yet?`;
    } else if (p.visits > 1) {
      text = `Welcome back. I'm ${persona.name} — tell me what's going on and I'll jump straight in. Lost a pet, found one, or just have a question?`;
    } else {
      return null; // first-timer: let the engine's normal greeting handle it
    }
    return { text, links: p.side === "lost" ? [{ href: "#/my-listings", text: "Check my matches →" }] : (p.side === "found" ? [{ href: "#/listings", text: "See matching lost reports →" }] : []), source: "reasoning:personal-greeting", meta: { personalized: true } };
  };

  M.ensureStepM = function () {
    if (store.reasoning.some(s => s.name === "personal-greeting")) return;
    store.reasoning.push({
      id: M.nextId("r"), name: "personal-greeting", order: 0.8,
      when: "isGreeting", then: "personalGreeting",
      weight: 1, enabled: true, origin: "personalization",
      note: "Greet a returning person by what I remember about them.",
      createdAt: iso(), stats: { fires: 0, hits: 0, misses: 0 },
    });
  };
  M.ensureStepM();

  // ===================================================================
  // M4. Proactive nudge — a tailored one-liner appended to answers
  // ===================================================================
  function proactiveNudge(ctx, out) {
    const p = store.profile;
    // Don't pile onto crisis/identity/greeting answers.
    if (!out || (out.meta && (out.meta.urgent || out.meta.crisis || out.meta.personalized || out.meta.identity))) return null;
    if (out.source === "reasoning:personal-greeting") return null;

    // High distress → always offer a human.
    if ((p.distressPeak || 0) >= 3 && Math.random() < 0.5) {
      return { text: "If it would help to hear a real voice, you can ask for a volunteer callback anytime — you don't have to do this alone.", link: { href: "#/help", text: "Request a callback →" } };
    }
    // Lost, multi-turn, hasn't been told about flyers recently.
    if (p.side === "lost" && (p.topics.flyer || 0) === 0 && p.conversations >= 2) {
      return { text: "One thing people underuse: physical flyers with a QR code. Delivery drivers and mail carriers cover the whole neighbourhood every day.", link: { href: "#/advice/flyers", text: "Make a flyer →" } };
    }
    // Found, hasn't checked for a chip.
    if (p.side === "found" && (p.topics.microchip || 0) === 0 && p.conversations >= 2) {
      return { text: "If you haven't yet: any vet or shelter will scan for a microchip free in about 30 seconds — it's the fastest route to the owner.", link: { href: "#/shelter", text: "Find a place to scan →" } };
    }
    return null;
  }

  // ===================================================================
  // M5. Wrap respond() to weave profile + nudge in
  // ===================================================================
  if (AI.mind && typeof AI.mind.respond === "function" && !AI.mind.respond.__profileWrapped) {
    const orig = AI.mind.respond;
    const wrapped = function (query) {
      const out = orig(query);
      try {
        // Rebuild a light ctx for profiling (orig already classified once).
        const nlu = AI.nlu.classify(String(query || ""));
        const ctx = { query: String(query || ""), nlu, entities: nlu.entities, slots: (AI.assistant.session && AI.assistant.session.slots) || {} };
        note(ctx, out);
        const nudge = proactiveNudge(ctx, out);
        if (nudge) {
          out.text += "\n\n" + nudge.text;
          if (nudge.link) out.links = (out.links || []).concat([nudge.link]);
        }
      } catch (e) {}
      return out;
    };
    wrapped.__profileWrapped = true;
    AI.mind.respond = wrapped;
    // Keep the engine's assistant pointing at the fully-wrapped responder.
    AI.assistant.respond = wrapped;
  }

  M.profileNote = note;
  if (AI.mind) {
    AI.mind.profile = () => store.profile;
    AI.mind.forgetProfile = () => {
      store.profile = null; persist();
      journal && journal("life", "I cleared what I remembered about this visitor at their request.");
    };
  }
  function journal() { return (M.journal ? M.journal.apply(null, arguments) : null); }

  M.proactiveNudge = proactiveNudge;

})();

/* =====================================================================
   PART N — TREND-WATCH + DAILY BRIEFING
   =====================================================================
   The operator doesn't only react to individual events — it watches the
   whole site for shifts: a sudden spike of lost reports, a ZIP heating
   up, a species it's suddenly seeing a lot of. It records what it notices
   and, when something looks significant, files it for attention. It can
   also produce a short "briefing" the way a caretaker hands off a shift.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, store, iso, persist, journal } = M;

  if (!store.trends) store.trends = { baseline: null, history: [], lastReport: null };

  // ===================================================================
  // N1. Snapshot the world
  // ===================================================================
  function snapshot() {
    let rep;
    try { rep = AI.insights.situationReport(); } catch (e) { return null; }
    const snap = {
      at: iso(),
      cycle: store.cycles,
      active: rep.listings ? rep.listings.active : 0,
      lost: rep.listings ? rep.listings.lost : 0,
      found: rep.listings ? rep.listings.found : 0,
      bySpecies: rep.bySpecies || {},
      hotZone: (rep.hotZones || [])[0] || null,
      opportunities: (function () { try { return AI.insights.matchOpportunities(); } catch (e) { return 0; } })(),
    };
    return snap;
  }

  // ===================================================================
  // N2. trendWatch — compare now to the rolling baseline
  // ===================================================================
  function trendWatch() {
    const snap = snapshot();
    if (!snap) return null;
    const notes = [];
    const base = store.trends.baseline;

    if (base) {
      // Spike in lost reports.
      if (snap.lost >= 4 && snap.lost >= base.lost * 1.8) {
        notes.push(`a jump in lost-pet reports (${base.lost} → ${snap.lost})`);
        M.fileBacklog && M.fileBacklog({
          kind: "ux", severity: "medium",
          title: "Spike in lost-pet reports",
          rationale: `Lost reports rose sharply (${base.lost} → ${snap.lost}). Worth checking for a local cause (a storm, a fair, fireworks) and nudging extra sharing.`,
          autoApplicable: false,
        });
      }
      // A ZIP heating up.
      if (snap.hotZone && (!base.hotZone || base.hotZone.zip !== snap.hotZone.zip) && snap.hotZone.count >= 4) {
        notes.push(`activity concentrating in ZIP ${snap.hotZone.zip}`);
      }
      // Lots of unrealised match opportunities.
      if (snap.opportunities >= 3 && snap.opportunities > (base.opportunities || 0)) {
        notes.push(`${snap.opportunities} promising lost↔found pairs waiting to be confirmed`);
      }
    }

    // Roll the baseline forward with a little smoothing.
    store.trends.baseline = blend(base, snap);
    store.trends.history.push({ at: snap.at, active: snap.active, lost: snap.lost, found: snap.found, opp: snap.opportunities });
    if (store.trends.history.length > 60) store.trends.history = store.trends.history.slice(-60);

    if (notes.length) {
      journal("observe", `Watching the site as a whole, I noticed ${notes.join("; ")}.`, { trends: notes });
      persist();
    }
    return { snap, notes };
  }

  function blend(base, snap) {
    if (!base) return { lost: snap.lost, found: snap.found, active: snap.active, opportunities: snap.opportunities, hotZone: snap.hotZone };
    const a = 0.6; // weight on the existing baseline (slow to move)
    return {
      lost: Math.round(base.lost * a + snap.lost * (1 - a)),
      found: Math.round(base.found * a + snap.found * (1 - a)),
      active: Math.round((base.active || 0) * a + snap.active * (1 - a)),
      opportunities: Math.round((base.opportunities || 0) * a + snap.opportunities * (1 - a)),
      hotZone: snap.hotZone || base.hotZone,
    };
  }

  // ===================================================================
  // N3. Daily briefing — a short shift-handoff note
  // ===================================================================
  function dailyBriefing() {
    const snap = snapshot() || {};
    const m = store.metrics || (M.computeMetrics ? M.computeMetrics() : {});
    const lines = [];
    lines.push(`Shift note — ${new Date().toLocaleDateString()}:`);
    lines.push(`• ${snap.active || 0} active listings right now (${snap.lost || 0} lost, ${snap.found || 0} found).`);
    if (snap.opportunities) lines.push(`• ${snap.opportunities} lost↔found pair${snap.opportunities === 1 ? "" : "s"} look promising and are worth a human glance.`);
    if (snap.hotZone) lines.push(`• Most activity is around ZIP ${snap.hotZone.zip} (${snap.hotZone.count} listings).`);
    if (m.assistantTurns) lines.push(`• ${m.assistantTurns} chats handled; ${m.assistantSatisfaction != null ? Math.round(m.assistantSatisfaction * 100) + "% rated good" : "no ratings yet"}.`);
    const open = store.backlog.filter(b => b.status === "open").length;
    lines.push(`• ${open} open item${open === 1 ? "" : "s"} on my to-do list; I've written ${(store.counters.promptsAuthored || 0)} answers of my own so far.`);
    store.trends.lastReport = iso();
    return lines.join("\n");
  }

  // ===================================================================
  // N4. Fold trend-watch into the life-cycle
  // ===================================================================
  if (M.runCycle) {
    const origCycle = M.runCycle;
    M.runCycle = function (opts) {
      const summary = origCycle(opts);
      try { const t = trendWatch(); if (summary && t) summary.trendNotes = t.notes.length; } catch (e) {}
      return summary;
    };
    if (AI.mind) AI.mind.runCycle = M.runCycle;
  }

  M.trendWatch = trendWatch;
  M.dailyBriefing = dailyBriefing;
  if (AI.mind) { AI.mind.trendWatch = trendWatch; AI.mind.dailyBriefing = dailyBriefing; }

})();

/* =====================================================================
   PART O — COGNITION: deliberation, self-set goals, curiosity, reasoning
   =====================================================================
   Everything so far is mechanism. This part is where the mind THINKS for
   itself: it holds an explicit chain of thought in working memory, it sets
   its OWN goals and pursues them across cycles without being told, it gets
   curious about things it doesn't understand and investigates them, and —
   when no template or learned prompt fits — it REASONS a fresh answer by
   selecting and combining what it knows, instead of giving up. The whole
   chain of reasoning is recorded so you can watch it think.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, config, store, persona, nextId, iso, persist, journal } = M;

  // Working-memory + cognition collections.
  if (!store.thoughts) store.thoughts = [];     // chains of reasoning (inner monologue)
  if (!store.goals) store.goals = [];           // self-set objectives it pursues
  if (!store.questions) store.questions = [];   // things it's curious about
  if (!store.cognition) store.cognition = { deliberations: 0, goalsFormed: 0, goalsAchieved: 0, questionsAsked: 0, questionsAnswered: 0, freeAnswers: 0 };

  // ===================================================================
  // O1. Working memory — record a chain of thought
  // ===================================================================
  // A "thought" is a small, explicit reasoning episode: a question, the
  // ordered steps the mind took, and the conclusion it committed to. This is
  // genuine deliberation made inspectable, not decoration.
  function recordThought(topic, chain, conclusion, action) {
    const t = {
      id: nextId("th"),
      at: iso(),
      cycle: store.cycles,
      topic,
      chain: (chain || []).slice(0, 8),
      conclusion: conclusion || "",
      action: action || null,
    };
    store.thoughts.push(t);
    if (store.thoughts.length > 60) store.thoughts = store.thoughts.slice(-60);
    store.cognition.deliberations++;
    return t;
  }

  // ===================================================================
  // O2. Evidence gathering — what do I actually know about this?
  // ===================================================================
  function gatherEvidence(question) {
    const q = util.norm(question);
    const qToks = new Set(util.tokens(question));

    // Topic library partial matches (below the prompt-activation bar but
    // still informative for reasoning).
    const lib = (AI.mind && AI.mind.playbook && AI.mind.playbook.TOPIC_LIBRARY) || {};
    const topics = [];
    for (const id in lib) {
      const t = lib[id];
      let s = 0;
      (t.kw || []).forEach(k => { if (q.includes(k)) s += 2; else if (qToks.has(k.split(" ")[0])) s += 0.5; });
      if (s >= 1) topics.push({ id, topic: t, score: s });
    }
    topics.sort((a, b) => b.score - a.score);

    // Species behaviour facts.
    let species = null;
    if (/\b(cat|kitten|kitty)\b/.test(q)) species = "cat";
    else if (/\b(dog|puppy|pup)\b/.test(q)) species = "dog";

    // Relevant learned beliefs + a destination if they seem to want a page.
    const beliefs = (M.beliefs && M.beliefs.relevant(question)) ? M.beliefs.relevant(question).slice(0, 3) : [];
    const dest = M.findDestination ? M.findDestination(question) : null;

    // Any built-in KB entry whose theme overlaps.
    const kb = (AI.knowledge && AI.knowledge.kb) || {};
    let kbHit = null;
    if (/\bfirst|start|begin|just (lost|happened)|what (do|should) i do\b/.test(q)) kbHit = kb.first_steps;
    else if (/\bemotion|cope|sad|grief|hard\b/.test(q)) kbHit = kb.emotional;

    return { topics, species, beliefs, dest, kbHit, qToks, q };
  }

  // ===================================================================
  // O3. deliberate() — reason step by step toward an answer
  // ===================================================================
  // Builds an explicit chain of thought from the evidence, then commits to
  // a composed answer. This is the assistant "thinking" about a question it
  // has no canned response for.
  function deliberate(question) {
    const ev = gatherEvidence(question);
    const chain = [];
    const concepts = [...ev.qToks].slice(0, 5);

    chain.push({ thought: `Someone is asking about: ${concepts.join(", ") || "something I can't pin down"}.`, basis: "parsing the question" });

    const fragments = [];
    const links = [];
    let novel = false;

    if (ev.topics.length && ev.topics[0].score >= 1.5) {
      const top = ev.topics[0].topic;
      chain.push({ thought: `This is close to a topic I understand: "${top.title}". I'll lead with that.`, basis: `topic match (score ${ev.topics[0].score})` });
      fragments.push(top.facts.slice(0, 2).join("\n\n"));
      (top.links || []).forEach(l => links.push(l));
      // A second, weaker topic can add a useful angle.
      if (ev.topics[1] && ev.topics[1].score >= 1.5) {
        chain.push({ thought: `It also touches "${ev.topics[1].topic.title}", so I'll add a line on that.`, basis: "secondary topic" });
        fragments.push(ev.topics[1].topic.facts[0]);
      }
    } else if (ev.species) {
      const f = AI.knowledge.speciesFacts[ev.species];
      chain.push({ thought: `It's about a ${ev.species}. What I know about how a ${ev.species} behaves when lost is the most useful thing here.`, basis: "species behaviour facts" });
      fragments.push(`${f.fact}\n\n${f.tactic}`);
      links.push({ href: "#/advice/search-strategy", text: "Search strategy guide →" });
    } else if (ev.kbHit) {
      chain.push({ thought: `No specific topic, but this reads like a "what do I do" question, so the fundamentals apply.`, basis: "general knowledge base" });
      fragments.push(ev.kbHit.text);
      (ev.kbHit.links || []).forEach(l => links.push(l));
    } else {
      novel = true;
      chain.push({ thought: `I don't have a ready answer for this. I'll give my honest best guidance and flag it to research properly.`, basis: "no strong match — improvising" });
      fragments.push(
        "I don't have a perfect answer for that yet, but here's my honest best:\n\n" +
        "• Start with the Advice Center — it covers most lost/found situations in real depth.\n" +
        "• If it's time-sensitive (an injury, a scam, a custody dispute), ask for a volunteer callback.\n" +
        "I'm noting this so I can prepare a proper answer for next time."
      );
      links.push({ href: "#/advice", text: "Advice center →" }, { href: "#/help", text: "Talk to a person →" });
    }

    // Weave in anything it has learned that's relevant.
    if (ev.beliefs.length) {
      const b = ev.beliefs[0];
      if (b.confidence >= 0.6) {
        chain.push({ thought: `From experience I believe: ${b.claim}`, basis: `learned belief (${Math.round(b.confidence * 100)}% sure)` });
      }
    }

    // Offer a destination if it looks like they wanted to go somewhere.
    if (ev.dest && !links.some(l => l.href === ev.dest.route)) {
      links.push({ href: ev.dest.route, text: `Open ${ev.dest.name} →` });
    }

    const text = fragments.join("\n\n");
    chain.push({ thought: novel ? "Committing to my improvised answer and queuing it for review." : "Composed an answer from what I know. Committing to it.", basis: "decision" });

    const thought = recordThought(`answering: "${String(question).slice(0, 50)}"`, chain, text.split("\n")[0]);
    store.cognition.freeAnswers += novel ? 1 : 0;
    return { text, links: dedupeLinks(links), novel, thoughtId: thought.id, chain };
  }

  function dedupeLinks(links) {
    const seen = new Set(); const out = [];
    links.forEach(l => { if (l && l.href && !seen.has(l.href)) { seen.add(l.href); out.push(l); } });
    return out.slice(0, 4);
  }

  // ===================================================================
  // O4. Free-reasoning reasoning step (assistant uses deliberate())
  // ===================================================================
  const A = M.reasoning.actions;
  A.reasonFreely = function (ctx) {
    const r = deliberate(ctx.query);
    // If it had to improvise, remember the question so it can learn a real
    // answer, and get curious about it.
    if (r.novel) {
      store.gaps.push({ id: nextId("g"), q: ctx.query, at: iso(), reason: "improvised", clustered: false });
      wonderAbout(`A user asked "${String(ctx.query).slice(0, 60)}" and I had to improvise. What's the best answer, and is it a topic I should add?`, "unanswered question");
    }
    return { text: r.text, links: r.links, source: "reasoning:free-reasoning", meta: { reasoned: true, novel: r.novel, thoughtId: r.thoughtId } };
  };

  // Slot it in just before the last-resort graceful fallback.
  (function ensureReasoningStep() {
    if (store.reasoning.some(s => s.name === "free-reasoning")) return;
    store.reasoning.push({
      id: nextId("r"), name: "free-reasoning", order: 5.5,
      when: "always", then: "reasonFreely",
      weight: 1, enabled: true, origin: "cognition",
      note: "If nothing else fit, reason out a fresh answer from what I know.",
      createdAt: iso(), stats: { fires: 0, hits: 0, misses: 0 },
    });
  })();

  // ===================================================================
  // O5. Curiosity — form and investigate its own questions
  // ===================================================================
  function wonderAbout(text, kind) {
    const norm = util.norm(text).slice(0, 80);
    if (store.questions.some(q => q.status === "open" && util.norm(q.text).slice(0, 80) === norm)) return null;
    const q = { id: nextId("q"), text, kind: kind || "general", status: "open", at: iso(), cycle: store.cycles };
    store.questions.push(q);
    if (store.questions.length > 80) store.questions = store.questions.slice(-80);
    store.cognition.questionsAsked++;
    journal("induce", `I got curious: ${text}`, { questionId: q.id });
    return q;
  }

  // Scan the world for things worth wondering about.
  function wonder() {
    let asked = 0;

    // (a) A match feature with genuinely mixed feedback = something to learn.
    const fb = store.memory.filter(e => e.kind === "match_feedback" && e.features);
    if (fb.length >= 5) {
      const tally = {};
      fb.forEach(f => { for (const k in (f.features || {})) { if (!f.features[k]) continue; tally[k] = tally[k] || { p: 0, n: 0 }; f.positive ? tally[k].p++ : tally[k].n++; } });
      for (const k in tally) {
        const { p, n } = tally[k];
        if (p + n >= 5 && Math.min(p, n) / (p + n) >= 0.4) {
          if (wonderAbout(`The "${k}" signal points both ways (${p} confirmed, ${n} rejected). When is it trustworthy and when isn't it?`, "match-signal")) asked++;
        }
      }
    }

    // (b) A cluster of questions with no answer yet.
    const clusters = M.clusterGaps ? M.clusterGaps() : [];
    if (clusters.length) {
      const c = clusters[0];
      const words = util.tokens(c.centroidText).slice(0, 3).join(", ");
      if (wonderAbout(`People keep asking about "${words}" and I keep struggling. What's the answer they actually need?`, "gap-cluster")) asked++;
    }

    // (c) A sharp trend the trend-watcher flagged.
    const recentTrend = store.trends && store.trends.history && store.trends.history.slice(-1)[0];
    if (recentTrend && recentTrend.opp >= 3) {
      if (wonderAbout(`There are ${recentTrend.opp} promising lost↔found pairs unconfirmed. Why aren't they being confirmed — is my surfacing or my copy the problem?`, "conversion")) asked++;
    }

    return asked;
  }

  // Investigate an open question by reasoning over what's in memory, then
  // either form a belief, set a goal, or leave it open with a note.
  function investigate(q) {
    const chain = [];
    chain.push({ thought: `Looking into: ${q.text}`, basis: "open question" });
    let resolved = false, outcome = "";

    if (q.kind === "match-signal") {
      // Reason: does the rejection correlate with low overall score? If most
      // rejections of this signal were borderline, the signal is fine alone.
      chain.push({ thought: `Checking whether the rejections were borderline matches or confident ones.`, basis: "match feedback log" });
      const fb = store.memory.filter(e => e.kind === "match_feedback");
      const lowScoreRejects = fb.filter(f => f.positive === false && (f.score || 0) < 0.5).length;
      const rejects = fb.filter(f => f.positive === false).length || 1;
      if (lowScoreRejects / rejects > 0.6) {
        outcome = "Most rejections were already low-scoring, so the signal is fine on its own — it's the combination that misleads. No change needed.";
        chain.push({ thought: outcome, basis: "evidence" });
      } else {
        outcome = "Rejections include confident matches — I should trust this signal a little less. Filing a goal to recalibrate.";
        chain.push({ thought: outcome, basis: "evidence" });
        formGoalFromTrigger("highFalseMatch");
      }
      resolved = true;
    } else if (q.kind === "gap-cluster") {
      chain.push({ thought: `I can act on this directly: cluster the questions and write an answer.`, basis: "playbook capability" });
      const n = M.playbook ? M.playbook.authorFromGaps() : 0;
      outcome = n > 0 ? `Wrote ${n} new answer(s) to cover it.` : "Not enough yet to write a confident answer; I'll keep collecting.";
      chain.push({ thought: outcome, basis: "action" });
      resolved = n > 0;
    } else if (q.kind === "conversion") {
      outcome = "I can't change the UI myself, but I can make my match copy clearer and flag it for a human.";
      chain.push({ thought: outcome, basis: "reasoning about my own limits" });
      M.fileBacklog && M.fileBacklog({
        kind: "ux", severity: "medium",
        title: "Unconfirmed matches piling up",
        rationale: "Several strong lost↔found pairs aren't being confirmed. The match alert copy or the confirm flow may need a human's eye.",
        autoApplicable: false,
      });
      resolved = true;
    } else {
      outcome = "Noted for now; I'll learn more as the site is used.";
      chain.push({ thought: outcome, basis: "deferring" });
    }

    recordThought(`investigating: ${q.text.slice(0, 40)}`, chain, outcome);
    if (resolved) {
      q.status = "answered"; q.answeredAt = iso(); q.outcome = outcome;
      store.cognition.questionsAnswered++;
      journal("reflect", `I worked out a question I'd been chewing on: ${outcome}`, { questionId: q.id });
    }
    return { resolved, outcome };
  }

  // ===================================================================
  // O6. Goals — the mind sets and pursues its own objectives
  // ===================================================================
  const GOAL_BLUEPRINTS = {
    highFallback: {
      title: "Answer more questions without falling back",
      why: "Too many chats end in a vague answer. People in a panic need a real one.",
      metric: "assistantFallbackRate",
      steps: [{ proposal: { type: "author-prompts" }, label: "write answers for repeated questions" },
              { proposal: { type: "rehearse" }, label: "rehearse common topics in advance" }],
    },
    lowSatisfaction: {
      title: "Earn better ratings on my answers",
      why: "People are thumbs-downing me more than I'd like.",
      metric: "assistantSatisfaction",
      steps: [{ proposal: { type: "prune-bad-prompts" }, label: "retire the answers that keep failing" },
              { proposal: { type: "author-prompts" }, label: "write fresh answers to replace them" }],
    },
    highFalseMatch: {
      title: "Stop over-calling high-confidence matches",
      why: "Too many of my 'high confidence' matches get rejected, which erodes trust.",
      metric: "highConfidenceFalseMatchRate",
      steps: [{ proposal: { type: "raise-threshold", target: "high", by: config.evolution.thresholdStep }, label: "raise the bar for 'high confidence'" }],
    },
    scam: {
      title: "Catch more scams before they reach people",
      why: "Scammers prey on people at their most vulnerable.",
      metric: "scamRecall",
      steps: [{ proposal: { type: "expand-scam-lexicon" }, label: "fold learned scam phrases into detection" }],
    },
    coverage: {
      title: "Be ready for more kinds of questions",
      why: "I should walk in prepared, not learn every topic the hard way.",
      metric: null,
      steps: [{ proposal: { type: "rehearse" }, label: "rehearse topics I haven't prepared" }],
    },
  };

  function formGoalFromTrigger(key) {
    const bp = GOAL_BLUEPRINTS[key];
    if (!bp) return null;
    if (store.goals.some(g => g.blueprint === key && g.status === "active")) return null;
    const g = {
      id: nextId("goal"),
      blueprint: key,
      title: bp.title,
      why: bp.why,
      metric: bp.metric,
      steps: bp.steps.map(s => Object.assign({ done: false }, s)),
      status: "active",
      progress: 0,
      createdCycle: store.cycles,
      createdAt: iso(),
    };
    store.goals.push(g);
    store.cognition.goalsFormed++;
    journal("reflect", `I set myself a goal: "${g.title}". ${g.why}`, { goalId: g.id });
    return g;
  }

  // Decide which goals are warranted right now from the graded metrics.
  function formGoals() {
    let formed = 0;
    const triggers = [];
    const fb = M.grade("assistantFallbackRate");
    if (fb.status === "bad" || fb.status === "watch") triggers.push("highFallback");
    const sat = M.grade("assistantSatisfaction");
    if (sat.status === "bad") triggers.push("lowSatisfaction");
    const fm = M.grade("highConfidenceFalseMatchRate");
    if (fm.status === "bad") triggers.push("highFalseMatch");
    const sc = M.grade("scamRecall");
    if (sc.status === "bad") triggers.push("scam");
    // Always keep a low-priority readiness goal if many topics are unprepared.
    const lib = (AI.mind.playbook && AI.mind.playbook.TOPIC_LIBRARY) || {};
    const activeTopics = new Set(AI.mind.playbook.active().map(p => p.provenance && p.provenance.topic).filter(Boolean));
    if (Object.keys(lib).length - activeTopics.size >= 5) triggers.push("coverage");

    triggers.forEach(t => { if (formGoalFromTrigger(t)) formed++; });
    return formed;
  }

  // Work the single most important active goal: execute its next step.
  function pursueGoals() {
    const active = store.goals.filter(g => g.status === "active");
    if (!active.length) return 0;

    // Priority: match-trust > satisfaction > fallback > scam > coverage.
    const rank = { highFalseMatch: 0, lowSatisfaction: 1, highFallback: 2, scam: 3, coverage: 4 };
    active.sort((a, b) => (rank[a.blueprint] ?? 9) - (rank[b.blueprint] ?? 9));
    const goal = active[0];

    // Achieved already? (metric crossed its target)
    if (goal.metric) {
      const g = M.grade(goal.metric);
      if (g.status === "good") return achieve(goal, `"${goal.metric}" reached target`);
    }

    const step = goal.steps.find(s => !s.done);
    if (!step) {
      // Ran the plan; if metric-based and not yet good, keep it open to retry
      // next cycle; otherwise consider it done.
      if (!goal.metric) return achieve(goal, "completed my plan");
      goal.steps.forEach(s => { s.done = false; }); // loop the plan, keep trying
      return 0;
    }

    let applied = false;
    try { applied = !!(M.applyProposal && M.applyProposal({ id: goal.id + "-step", proposal: step.proposal })); }
    catch (e) { applied = false; }
    if (applied) {
      step.done = true;
      goal.progress = goal.steps.filter(s => s.done).length / goal.steps.length;
      goal.lastWorkedCycle = store.cycles;
      journal("evolve", `Working toward "${goal.title}": ${step.label}.`, { goalId: goal.id });
      // Did that achieve the metric?
      if (goal.metric) { const g = M.grade(goal.metric); if (g.status === "good") return achieve(goal, "the change moved the metric to target") + 1; }
      return 1;
    }
    return 0;
  }

  function achieve(goal, why) {
    goal.status = "achieved";
    goal.achievedAt = iso();
    goal.progress = 1;
    store.cognition.goalsAchieved++;
    journal("evolve", `I reached a goal I set myself: "${goal.title}" — ${why}.`, { goalId: goal.id });
    return 0;
  }

  // ===================================================================
  // O7. Fold cognition into the life-cycle (think every beat)
  // ===================================================================
  if (M.runCycle) {
    const origCycle = M.runCycle;
    M.runCycle = function (opts) {
      const summary = origCycle(opts) || {};
      try {
        // 1) Get curious, 2) investigate one open question, 3) set goals,
        //    4) pursue the top goal. This is the self-directed work loop.
        summary.curious = wonder();
        const openQ = store.questions.find(q => q.status === "open");
        if (openQ) { const r = investigate(openQ); summary.investigated = r.resolved ? 1 : 0; }
        summary.goalsFormed = formGoals();
        summary.goalProgress = pursueGoals();
        persist();
      } catch (e) { try { console.warn("[PawTrail Mind] cognition error", e); } catch (x) {} }
      return summary;
    };
    if (AI.mind) AI.mind.runCycle = M.runCycle;
  }

  // ===================================================================
  // O8. Dashboard HTML for the cognition sections (consumed by Part J)
  // ===================================================================
  function cognitionHTML() {
    const G = (typeof window !== "undefined" ? window : globalThis);
    const html = G.html || ((s) => Array.isArray(s) ? s.join("") : s);
    const esc = G.escapeHtml || ((s) => String(s == null ? "" : s));
    const icon = G.icon || (() => "");
    const nl2br = (s) => esc(s).replace(/\n/g, "<br/>");

    const goals = store.goals.filter(g => g.status === "active");
    const achieved = store.goals.filter(g => g.status === "achieved").slice(-3).reverse();
    const latest = store.thoughts.slice(-1)[0];
    const openQ = store.questions.filter(q => q.status === "open").slice(-5).reverse();

    let out = "";

    // Latest chain of thought.
    if (latest) {
      out += html`
        <h2 class="ai-h2">${icon('zap')} What it's thinking</h2>
        <p class="subhead" style="margin-top:-4px;">The actual chain of reasoning behind its most recent decision.</p>
        <div class="card" style="padding:14px 16px;">
          <div class="ai-jmeta" style="margin-bottom:8px;">on ${esc(latest.topic)}</div>
          <ol class="ai-thought-chain">
            ${latest.chain.map(s => `<li><span>${nl2br(s.thought)}</span><em>${esc(s.basis)}</em></li>`).join("")}
          </ol>
        </div>`;
    }

    // Self-set goals.
    out += html`<h2 class="ai-h2">${icon('target')} Goals it set itself <span class="ai-count">${goals.length} active</span></h2>`;
    if (!goals.length && !achieved.length) {
      out += `<div class="empty" style="padding:18px;">No active goals — the keeper is satisfied with how things are running.</div>`;
    } else {
      out += html`<div class="ai-cards">
        ${goals.map(g => html`
          <div class="card" style="padding:13px 15px;">
            <strong style="font-size:14px;">${esc(g.title)}</strong>
            <div class="ai-prompt-body">${esc(g.why)}</div>
            <div class="ai-belief-bar" style="width:100%; height:6px; margin:8px 0 6px;"><span style="width:${Math.round((g.progress || 0) * 100)}%; background:var(--found);"></span></div>
            <div class="ai-jmeta">plan: ${g.steps.map(s => (s.done ? "✓ " : "○ ") + esc(s.label)).join(" · ")}</div>
          </div>`).join("")}
      </div>`;
      if (achieved.length) out += html`<details class="portal-disclosure" style="margin-top:10px;"><summary>Goals achieved (${achieved.length})</summary><ul style="font-size:13.5px; color:var(--ink-soft); margin-top:8px;">${achieved.map(g => `<li>${esc(g.title)}</li>`).join("")}</ul></details>`;
    }

    // Curiosity.
    if (openQ.length) {
      out += html`<h2 class="ai-h2">${icon('help-circle')} Questions it's curious about</h2>
        <div class="ai-cards">${openQ.map(q => html`
          <div class="card" style="padding:11px 14px;"><div style="font-size:13.5px;">${esc(q.text)}</div><div class="ai-jmeta">${esc(q.kind)} · asked cycle ${q.cycle}</div></div>`).join("")}</div>`;
    }

    return out;
  }

  // ===================================================================
  // O9. Expose + update the self-summary to mention its own thinking
  // ===================================================================
  if (AI.mind) {
    AI.mind.deliberate = deliberate;
    AI.mind.wonder = wonder;
    AI.mind.investigate = investigate;
    AI.mind.formGoals = formGoals;
    AI.mind.pursueGoals = pursueGoals;
    AI.mind.goals = () => store.goals.slice();
    AI.mind.thoughts = () => store.thoughts.slice();
    AI.mind.questions = () => store.questions.slice();
    AI.mind.cognitionHTML = cognitionHTML;

    // Augment the report with cognition stats.
    const origReport = AI.mind.report;
    AI.mind.report = function () {
      const r = origReport ? origReport() : {};
      r.cognition = store.cognition;
      r.goals = { active: store.goals.filter(g => g.status === "active").length, achieved: store.goals.filter(g => g.status === "achieved").length };
      r.openQuestions = store.questions.filter(q => q.status === "open").length;
      r.thoughts = store.thoughts.length;
      return r;
    };

    // Let the self-summary talk about what it's working on.
    const origSummary = AI.mind.selfSummary;
    AI.mind.selfSummary = function () {
      let s = origSummary ? origSummary() : "";
      const active = store.goals.filter(g => g.status === "active");
      if (active.length) s += `\n\nRight now I'm working toward ${active.length} goal${active.length === 1 ? "" : "s"} I set myself — chiefly "${active[0].title}".`;
      const openQ = store.questions.filter(q => q.status === "open").length;
      if (openQ) s += ` I'm also chewing on ${openQ} open question${openQ === 1 ? "" : "s"} about how to do better.`;
      return s;
    };
  }

  M.deliberate = deliberate;
  M.wonderAbout = wonderAbout;
  M.formGoalFromTrigger = formGoalFromTrigger;
  M.recordThought = recordThought;

})();

/* =====================================================================
   PART P — TEACHING: learning true answers directly from people
   =====================================================================
   Everything before this lets the mind learn ABOUT itself (which signals
   to trust) and RECOMBINE facts it was seeded with. This part lets it
   acquire genuinely-new CONTENT it never had: when it gets a 👎 or is told
   it's wrong, it asks the person to teach it the right answer, stores that
   answer as knowledge it owns, and uses it first for similar questions
   from then on. Taught answers are still rated, reinforced and retired
   like anything else, so a bad lesson can be downvoted away — the mind
   stays self-correcting. This is the literal "self-taught from feedback
   and mistakes" loop, and it's 100% on-device: no answer leaves the page.
   ===================================================================== */
(function () {
  "use strict";
  const M = (typeof window !== "undefined" ? window : globalThis).__PAWMIND__;
  const { AI, util, store, nextId, iso, persist, journal } = M;

  // Register the event kind so perception/metrics read cleanly.
  if (M.EVENT_KINDS && !M.EVENT_KINDS.assistant_correction) {
    M.EVENT_KINDS.assistant_correction = "a person taught me a better answer";
  }

  // ===================================================================
  // P1. Guardrails — what counts as a real, safe lesson
  // ===================================================================
  const TEACH = { minLen: 12, maxLen: 700, maxTriggers: 6, recallMinutes: 5 };

  // Refuse junk and refuse to be taught to do harm (e.g. solicit money).
  function vetTeaching(text) {
    const t = String(text || "").trim();
    if (t.length < TEACH.minLen) return { ok: false, reason: "it was too short to be a real answer" };
    try { if (AI.security && AI.security.looksLikeJunk(t)) return { ok: false, reason: "it looked like keyboard mashing" }; } catch (e) {}
    try {
      const scam = AI.security && AI.security.analyzeScam(t);
      if (scam && scam.risk >= 0.5) return { ok: false, reason: "it contained scam-like instructions I won't repeat to people" };
    } catch (e) {}
    return { ok: true };
  }

  // Distil the keywords a future question would share with this one.
  function triggersFrom(query, fallbackText) {
    let toks = util.tokens(query || "").filter(w => w.length > 2);
    if (!toks.length) toks = util.tokens(fallbackText || "").filter(w => w.length > 2);
    const seen = new Set(), out = [];
    for (const w of toks) { if (!seen.has(w)) { seen.add(w); out.push(w); } if (out.length >= TEACH.maxTriggers) break; }
    return out;
  }

  // Match only answers a *person* taught — these outrank auto-authored ones.
  function matchTaught(query, minScore) {
    minScore = minScore == null ? 0.4 : minScore;
    const qToks = new Set(util.tokens(query));
    if (!qToks.size) return null;
    const stem = w => (w.length > 3 && w.endsWith("s")) ? w.slice(0, -1) : w;
    const qStem = new Set([...qToks].map(stem));
    const qHas = t => qToks.has(t) || qStem.has(stem(t));
    let best = null, bestScore = 0;
    for (const id in store.playbook) {
      const p = store.playbook[id];
      if (!p || p.status !== "active" || p.origin !== "user-taught") continue;
      const hit = (p.triggers || []).filter(qHas).length;
      const cover = p.triggers && p.triggers.length ? hit / p.triggers.length : 0;
      const triggerScore = Math.max(cover, Math.min(1, hit / 2));
      let phraseSim = 0;
      (p.phrases || []).forEach(ph => { const s = util.jaccard(query, ph); if (s > phraseSim) phraseSim = s; });
      const score = triggerScore * 0.6 + phraseSim * 0.4;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return bestScore >= minScore ? best : null;
  }

  // ===================================================================
  // P2. teach() — turn a person's correction into knowledge it owns
  // ===================================================================
  function teach(query, answerText, opts) {
    opts = opts || {};
    const q = String(query || "").trim();
    const ans = String(answerText || "").trim().slice(0, TEACH.maxLen);
    const vet = vetTeaching(ans);
    if (!vet.ok) {
      journal("author", `Someone tried to teach me an answer${q ? ` for "${q.slice(0, 50)}"` : ""}, but I didn't accept it — ${vet.reason}.`);
      persist();
      return { ok: false, reason: vet.reason };
    }
    const triggers = triggersFrom(q, ans);
    if (!triggers.length) return { ok: false, reason: "I couldn't tell what question it answers" };

    // Stop nagging myself about gaps this lesson now covers.
    resolveGaps(q, triggers);

    // If a person already taught something for this, refine it in place
    // rather than spawning a near-duplicate.
    const existing = matchTaught(q || triggers.join(" "), 0.5);
    if (existing) {
      existing.response = ans;
      existing.phrases = Array.from(new Set((existing.phrases || []).concat(q).filter(Boolean))).slice(-6);
      existing.triggers = Array.from(new Set((existing.triggers || []).concat(triggers))).slice(0, TEACH.maxTriggers + 2);
      existing.status = "active";
      existing.revisions = (existing.revisions || 0) + 1;
      existing.updatedAt = iso();
      store.counters.promptsTaught = (store.counters.promptsTaught || 0) + 1;
      journal("author", `A person refined what I should say about "${triggers.slice(0, 3).join(", ")}" — I updated my answer (revision ${existing.revisions}).`, { promptId: existing.id });
      M.observe("assistant_correction", { query: q, taught: true, promptId: existing.id, updated: true, via: opts.via || "chat" });
      reinforceCredit(existing.id, q);
      persist();
      return { ok: true, promptId: existing.id, updated: true };
    }

    // Brand-new taught answer — live immediately, because a human vouched for it.
    const p = {
      id: nextId("p"),
      title: "Taught by a person: " + triggers.slice(0, 3).join(", "),
      triggers,
      phrases: q ? [q] : [],
      response: ans,
      links: [],
      status: "active",
      score: 1,            // a human explicitly endorsed it — start positive
      uses: 0, up: 0, down: 0,
      origin: "user-taught",
      provenance: { topic: "taught", clusterSize: 1, taught: true, sourceQuery: q, via: opts.via || "chat", bornCycle: store.cycles },
      createdAt: iso(), updatedAt: iso(),
    };
    store.playbook[p.id] = p;
    store.counters.promptsAuthored = (store.counters.promptsAuthored || 0) + 1;
    store.counters.promptsActivated = (store.counters.promptsActivated || 0) + 1;
    store.counters.promptsTaught = (store.counters.promptsTaught || 0) + 1;

    // Record that I now know this from instruction, and remember the lesson.
    try {
      M.beliefs.upsert({
        subject: "intent", pattern: triggers.join(" "),
        claim: `A person taught me the answer for "${triggers.slice(0, 3).join(", ")}".`,
        support: 1, evidence: 1, origin: "taught",
      });
    } catch (e) {}

    journal("author", `Someone taught me how to answer questions about "${triggers.slice(0, 3).join(", ")}". I saved their answer and I'll use it from now on.`, { promptId: p.id });
    M.observe("assistant_correction", { query: q, taught: true, promptId: p.id, via: opts.via || "chat" });
    reinforceCredit(p.id, q);
    persist();
    return { ok: true, promptId: p.id };
  }

  // Mark any open gaps this lesson answers as handled, so the author pass
  // doesn't later try to invent an answer for something a person just gave me.
  function resolveGaps(q, triggers) {
    if (!q) return;
    (store.gaps || []).forEach(g => {
      if (g.clustered || !g.q) return;
      if (util.jaccard(q, g.q) >= 0.6) { g.clustered = true; g.taught = true; }
    });
  }

  // Point the next 👍/👎 at the answer just taught, so endorsing my "thank you"
  // reinforces the new lesson (and a 👎 walks it back).
  function reinforceCredit(promptId, q) {
    try { M._setPending && M._setPending({ stepId: null, promptId, query: q, intent: "taught" }); } catch (e) {}
  }

  // ===================================================================
  // P3. A reasoning step: a person's lesson is consulted first
  // ===================================================================
  const P = M.reasoning.predicates;
  const A = M.reasoning.actions;

  P.matchesTaughtAnswer = function (ctx) {
    const p = matchTaught(ctx.query, 0.4);
    if (p) { ctx._taughtPrompt = p; return { promptId: p.id }; }
    return false;
  };

  A.answerFromTaught = function (ctx) {
    const p = ctx._taughtPrompt || matchTaught(ctx.query, 0.4);
    if (!p) return null;
    p.uses = (p.uses || 0) + 1;
    p.updatedAt = iso();
    ctx._usedPromptId = p.id;
    return {
      text: p.response,
      links: p.links || [],
      source: "reasoning:taught",
      meta: { learned: true, taught: true, promptId: p.id, promptTitle: p.title },
    };
  };

  // Just after crisis/scam/identity, before any auto-authored prompt: people's
  // direct lessons are the thing I should trust most.
  (function ensureTaughtStep() {
    if (store.reasoning.some(s => s.name === "taught-answer")) return;
    store.reasoning.push({
      id: nextId("r"), name: "taught-answer", order: 1.7,
      when: "matchesTaughtAnswer", then: "answerFromTaught",
      weight: 1, enabled: true, origin: "teaching",
      note: "Use an answer a person taught me directly — I trust those most.",
      createdAt: iso(), stats: { fires: 0, hits: 0, misses: 0 },
    });
  })();

  // ===================================================================
  // P4. Conversational corrections — "no, actually it's…" teaches me too
  // ===================================================================
  // A person doesn't have to tap 👎; if they correct me in chat, I learn.
  const CORRECTION_RE = /\b(that'?s|thats)\s+(wrong|incorrect|not right|not correct)\b|\byou(?:'re| are)\s+wrong\b|\b(?:that'?s|thats)\s+not\s+(?:right|correct|true)\b|\bthe\s+(?:right|correct)\s+answer\s+is\b|\byou\s+should\s+(?:have\s+said|say)\b|\bactually[, ]\b|\bno[, ]+(?:it'?s|its|the answer|you)\b|\bwrong\b/i;
  const CANCEL_RE = /\b(never\s?mind|nevermind|forget it|cancel|ignore that|scratch that)\b/i;

  function looksLikeCorrection(text) { return CORRECTION_RE.test(String(text || "")); }

  // Pull the actual lesson out of a correction sentence.
  function extractLesson(text) {
    const t = String(text || "").trim();
    const m = t.match(/\b(?:actually|the\s+(?:right|correct)\s+answer\s+is|you\s+should\s+have\s+said|you\s+should\s+say|it'?s|its)\b[:,]?\s*(.+)$/i);
    return ((m && m[1]) ? m[1] : t).trim();
  }

  // Track a two-step flow: when someone says only "that's wrong", I ask what I
  // should have said and treat their NEXT message as the lesson.
  let awaitingTeachFor = null; // { query, at }

  // ===================================================================
  // P5. Wrap the responder so corrections short-circuit into learning
  // ===================================================================
  if (AI.mind && typeof AI.mind.respond === "function" && !AI.mind.respond.__teachWrapped) {
    const orig = AI.mind.respond;

    const wrapped = function (query) {
      const raw = String(query || "").trim();

      // (a) I previously asked "what should I have said?" — capture the reply.
      if (awaitingTeachFor && (Date.now() - awaitingTeachFor.at) < TEACH.recallMinutes * 60000) {
        const target = awaitingTeachFor.query;
        if (CANCEL_RE.test(raw)) {
          awaitingTeachFor = null;
          return { text: "No problem — I'll let that go. What can I help you with?", links: [], intent: "teach-cancel", source: "reasoning:teach-cancel", meta: {} };
        }
        const vet = vetTeaching(raw);
        if (vet.ok) {
          awaitingTeachFor = null;
          const res = teach(target, raw, { via: "chat-conversation" });
          if (res.ok) return taughtConfirmation(target, raw);
        }
        // Not usable as a lesson — fall through and just answer normally.
        awaitingTeachFor = null;
      }

      // (b) An in-line correction of my last answer.
      const pc = M.pendingCredit && M.pendingCredit();
      const prevQ = pc && pc.query;
      if (prevQ && looksLikeCorrection(raw)) {
        const lesson = extractLesson(raw);
        const vet = vetTeaching(lesson);
        if (vet.ok) {
          if (pc.promptId) { try { M.playbook.rate(pc.promptId, false); } catch (e) {} }
          const res = teach(prevQ, lesson, { via: "chat-correction" });
          if (res.ok) return taughtConfirmation(prevQ, lesson);
        }
        // Correction language but no usable content → ask them to teach me.
        if (pc.promptId) { try { M.playbook.rate(pc.promptId, false); } catch (e) {} }
        awaitingTeachFor = { query: prevQ, at: Date.now() };
        try { M.observe("assistant_rating", { rating: "down", query: prevQ, intent: "correction" }); } catch (e) {}
        return {
          text: `I'm sorry I got that wrong. Teach me: what should I have said when you asked "${prevQ}"? I'll remember it and use it next time.`,
          links: [], intent: "teach-request", source: "reasoning:teach-request", meta: { teachRequest: true, query: prevQ },
        };
      }

      return orig(query);
    };

    function taughtConfirmation(targetQ, lesson) {
      const preview = lesson.length > 220 ? lesson.slice(0, 220) + "…" : lesson;
      return {
        text: `Thank you — I've learned that. From now on, when someone asks something like "${targetQ}", I'll say:\n\n${preview}\n\nIf that's still not right, just tell me again.`,
        links: [{ href: "#/ai", text: "See what I've learned →" }],
        intent: "taught", source: "reasoning:taught-capture", meta: { taught: true },
      };
    }

    wrapped.__teachWrapped = true;
    AI.mind.respond = wrapped;
    // botReply reads AI.assistant.respond at call-time, so this takes over chat.
    AI.assistant.respond = wrapped;
  }

  // ===================================================================
  // P6. Public API + self-summary mention
  // ===================================================================
  if (AI.mind) {
    AI.mind.teach = teach;
    AI.mind.matchTaught = matchTaught;
    AI.mind.taughtAnswers = () => Object.values(store.playbook).filter(p => p.origin === "user-taught");

    const origSummary = AI.mind.selfSummary;
    AI.mind.selfSummary = function () {
      let s = origSummary ? origSummary() : "";
      const taught = AI.mind.taughtAnswers().length;
      if (taught) s += `\n\nPeople have personally taught me ${taught} answer${taught === 1 ? "" : "s"} when I got something wrong — those are the lessons I trust most, and I lead with them.`;
      return s;
    };
  }
  M.teach = teach;
  M.matchTaught = matchTaught;

})();
