/* ai-engine.js — PawTrail AI Engine ("the brain")
   =====================================================================
   The central intelligence layer for PawTrail. Loaded AFTER data.js,
   app.js and features.js, so every global helper (state, allListings,
   icon, navigate, toast, getImageSimilarity, ARTICLES, HELPLINE, …) is
   already available. Nothing here is required for the site to render —
   if this file fails to load, app.js falls back to its built-in logic.

   What lives here:
     • PawTrailAI.knowledge   — breed graph, color taxonomy, scam lexicon,
                                 species behaviour facts, the answer KB.
     • PawTrailAI.util        — text / math / fuzzy helpers used everywhere.
     • PawTrailAI.vision      — perceptual hashing + colour histograms.
     • PawTrailAI.match       — the matching algorithm + online learning.
     • PawTrailAI.security    — bot / abuse / scam detection + reputation.
     • PawTrailAI.nlu         — intent classification + entity extraction.
     • PawTrailAI.assistant   — the conversational brain (memory + actions).
     • PawTrailAI.insights    — situational awareness over all listings.
     • PawTrailAI.brain       — the orchestrator that ties it together.

   Design notes:
     - Everything is defensive: missing globals never throw at load time.
     - Persistence is self-contained under its own localStorage key, so the
       engine never has to touch app.js's saveState() whitelist.
     - The matching + learning model is a real (small) logistic regression
       with online gradient updates driven by user "this is / isn't my pet"
       feedback — not a static rule table.
   ===================================================================== */
(function () {
  "use strict";

  // ===================================================================
  // 0. Boot guards + tiny shims so the engine is standalone-safe
  // ===================================================================
  const G = (typeof window !== "undefined") ? window : globalThis;
  const hasState = typeof G.state === "object" && G.state;
  const noop = () => {};
  const _toast = (m, ms) => { try { (G.toast || noop)(m, ms); } catch (e) {} };
  const _save = () => { try { (G.saveState || noop)(); } catch (e) {} };
  const listingsAll = () => {
    try { return (G.allListings ? G.allListings() : (hasState ? G.state.listings : [])) || []; }
    catch (e) { return []; }
  };

  const AI_STORE_KEY = "pawtrail.ai.v1";
  const VERSION = "2.0.0";

  // ===================================================================
  // 1. Configuration — every magic number the brain uses, in one place
  // ===================================================================
  const config = {
    // Confidence bands (PRD §4.4). A composite score maps to one of these.
    bands: {
      high:   { min: 0.75, label: "High confidence",   channel: "push+sms" },
      medium: { min: 0.50, label: "Medium confidence", channel: "email" },
      low:    { min: 0.25, label: "Low confidence",     channel: "digest" },
      none:   { min: 0.00, label: "Suppressed",         channel: "none" },
    },
    match: {
      maxDistanceMiles: 25,     // PRD hard filter
      dateWindowDays: 45,       // a little more lenient than the 30 in the PRD
      minReportableScore: 0.10, // below this we don't even surface a card
      microchipInstant: 0.985,  // an exact chip hit is as close to certain as we get
      learningRate: 0.06,       // online gradient step size
      l2: 0.0008,               // weight decay so the model can't run away
    },
    security: {
      // Velocity ceilings used to compute a bot-likelihood, NOT hard blocks.
      perMinute: 4,
      perHour: 12,
      perDay: 40,
      duplicateJaccard: 0.82,   // two submissions this similar = near-duplicate
      gibberishRatio: 0.55,     // share of "words" that look like keyboard mash
      minHumanFormMs: 2500,     // a real person rarely fills the form this fast
      blockScore: 0.86,         // bot-likelihood at/above this → block
      challengeScore: 0.6,      // …above this → soft challenge / extra checks
      reputationFloor: -8,      // reputation below this is treated as hostile
    },
    assistant: {
      memoryTurns: 24,          // how many turns of transcript we retain
      typingDelayMs: 280,
    },
  };

  // ===================================================================
  // 2. Self-contained persistence (own localStorage key)
  // ===================================================================
  const store = {
    model: null,      // logistic-regression weights for matching
    security: null,   // event log + reputation map
    session: null,    // assistant memory
    stats: null,      // lifetime counters the brain keeps about itself
  };

  function loadStore() {
    try {
      const raw = G.localStorage && G.localStorage.getItem(AI_STORE_KEY);
      if (raw) Object.assign(store, JSON.parse(raw));
    } catch (e) { /* ignore corrupt store */ }
    if (!store.model) store.model = defaultModel();
    if (!store.security) store.security = { events: [], reputation: {}, blocks: 0, challenges: 0 };
    if (!store.session) store.session = { slots: {}, transcript: [], startedAt: Date.now() };
    if (!store.stats) store.stats = { matchesRun: 0, feedbackPos: 0, feedbackNeg: 0, assistantTurns: 0, scamsCaught: 0 };
  }

  function persist() {
    try {
      // Keep the event log bounded so the store never balloons.
      if (store.security && store.security.events.length > 400) {
        store.security.events = store.security.events.slice(-400);
      }
      if (store.session && store.session.transcript.length > 120) {
        store.session.transcript = store.session.transcript.slice(-120);
      }
      G.localStorage && G.localStorage.setItem(AI_STORE_KEY, JSON.stringify(store));
    } catch (e) { /* quota — non-fatal */ }
  }

  // ===================================================================
  // 3. Utilities — text, math, fuzzy matching
  // ===================================================================
  const STOPWORDS = new Set((
    "a an and are as at be but by for if in into is it no not of on or such that " +
    "the their then there these they this to was will with i im my me you your we " +
    "our he she his her they them do does did has have had can could would should " +
    "about just got get gonna wanna please thanks thank hi hello hey ok okay yeah"
  ).split(" "));

  const util = {
    clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); },
    sigmoid(x) { return 1 / (1 + Math.exp(-x)); },
    mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; },
    round(x, d = 3) { const p = Math.pow(10, d); return Math.round(x * p) / p; },

    norm(s) {
      return String(s == null ? "" : s)
        .toLowerCase()
        .replace(/[‘’]/g, "'")
        .replace(/[^a-z0-9'\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    },

    tokens(s, keepStop = false) {
      const t = util.norm(s).split(" ").filter(Boolean);
      return keepStop ? t : t.filter(w => !STOPWORDS.has(w));
    },

    // Bag-of-words Jaccard similarity in [0,1].
    jaccard(a, b) {
      const A = new Set(util.tokens(a)), B = new Set(util.tokens(b));
      if (!A.size || !B.size) return 0;
      let inter = 0;
      A.forEach(x => { if (B.has(x)) inter++; });
      return inter / (A.size + B.size - inter);
    },

    // Character-shingle (n-gram) Jaccard — better for near-duplicate spam text.
    shingleJaccard(a, b, n = 4) {
      const sh = s => {
        const x = util.norm(s).replace(/\s+/g, " ");
        const set = new Set();
        for (let i = 0; i + n <= x.length; i++) set.add(x.slice(i, i + n));
        return set;
      };
      const A = sh(a), B = sh(b);
      if (!A.size || !B.size) return 0;
      let inter = 0;
      A.forEach(x => { if (B.has(x)) inter++; });
      return inter / (A.size + B.size - inter);
    },

    // Levenshtein distance — used for fuzzy token / breed matching.
    levenshtein(a, b) {
      a = String(a); b = String(b);
      if (a === b) return 0;
      const m = a.length, n = b.length;
      if (!m) return n; if (!n) return m;
      let prev = new Array(n + 1);
      for (let j = 0; j <= n; j++) prev[j] = j;
      for (let i = 1; i <= m; i++) {
        let cur = [i];
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
      }
      return prev[n];
    },

    // Normalised fuzzy similarity for two short strings, in [0,1].
    fuzzy(a, b) {
      a = util.norm(a); b = util.norm(b);
      if (!a || !b) return 0;
      if (a === b) return 1;
      const d = util.levenshtein(a, b);
      return 1 - d / Math.max(a.length, b.length);
    },

    // Shannon entropy of a string's characters — low = repetitive ("aaaa").
    entropy(s) {
      const x = util.norm(s).replace(/\s/g, "");
      if (!x) return 0;
      const freq = {};
      for (const c of x) freq[c] = (freq[c] || 0) + 1;
      let h = 0;
      for (const c in freq) { const p = freq[c] / x.length; h -= p * Math.log2(p); }
      return h;
    },

    // Haversine great-circle distance in miles.
    haversine(lat1, lon1, lat2, lon2) {
      const R = 3958.8, toRad = d => d * Math.PI / 180;
      const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
      const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    },

    nowIso() { return new Date().toISOString(); },

    hoursBetween(a, b) {
      if (!a || !b) return Infinity;
      return Math.abs(new Date(a) - new Date(b)) / 3600000;
    },

    titleCase(s) {
      return String(s || "").replace(/\b\w/g, c => c.toUpperCase());
    },
  };

  // ===================================================================
  // 4. Knowledge base — the brain's long-term memory
  // ===================================================================
  const knowledge = {
    // ---- 4a. Colour taxonomy -----------------------------------------
    // Each canonical colour maps to the words that imply it. Used by the
    // matcher (overlap) and the NLU entity extractor (detect colour).
    colorGroups: {
      black:    ["black", "ebony", "jet", "raven", "charcoal"],
      white:    ["white", "cream", "ivory", "snow", "albino"],
      brown:    ["brown", "chocolate", "liver", "mahogany", "chestnut", "sable"],
      gold:     ["tan", "gold", "golden", "yellow", "blond", "blonde", "fawn", "wheaten", "apricot", "buff"],
      gray:     ["gray", "grey", "blue", "silver", "slate", "smoke", "ash"],
      orange:   ["orange", "ginger", "red", "rust", "marmalade", "copper"],
      patterned:["tricolor", "tri-color", "tri color", "brindle", "merle", "calico",
                 "tabby", "tortoiseshell", "tortie", "spotted", "patched", "bicolor",
                 "piebald", "harlequin", "dappled", "tuxedo"],
    },

    // ---- 4b. Breed knowledge graph -----------------------------------
    // Breeds that belong to the same visual "family" should partially match
    // even when not identical (e.g. lab ↔ golden are both retrievers).
    breedFamilies: {
      retriever:  ["labrador", "lab", "golden", "retriever", "goldendoodle", "labradoodle"],
      shepherd:   ["german shepherd", "gsd", "shepherd", "malinois", "belgian", "aussie", "australian shepherd"],
      terrier:    ["terrier", "pitbull", "pit bull", "staffordshire", "staffy", "bull terrier", "jack russell", "yorkie", "yorkshire"],
      toy:        ["chihuahua", "pomeranian", "pom", "maltese", "shih tzu", "shihtzu", "papillon", "toy poodle"],
      hound:      ["beagle", "hound", "basset", "dachshund", "doxie", "wiener", "coonhound", "bloodhound", "greyhound"],
      working:    ["husky", "malamute", "rottweiler", "rottie", "doberman", "boxer", "mastiff", "great dane", "bernese"],
      spaniel:    ["spaniel", "cocker", "cavalier", "springer"],
      poodle:     ["poodle", "doodle", "bichon"],
      catLong:    ["persian", "maine coon", "mainecoon", "ragdoll", "himalayan", "norwegian"],
      catShort:   ["domestic shorthair", "dsh", "tabby", "siamese", "bengal", "russian blue", "british shorthair"],
    },

    // ---- 4c. Coat / size synonyms ------------------------------------
    sizeWords: {
      small:  ["small", "tiny", "little", "toy", "miniature", "mini", "petite"],
      medium: ["medium", "mid", "average", "med"],
      large:  ["large", "big", "huge", "giant", "xl", "tall"],
    },

    // ---- 4d. Distinguishing-feature keywords -------------------------
    // Strong identity cues; a shared one is highly informative.
    featureCues: [
      "microchip", "chip", "collar", "tag", "harness", "scar", "limp", "blind",
      "one eye", "blue eye", "heterochromia", "missing", "amputee", "three legs",
      "tripod", "deaf", "neutered", "spayed", "tattoo", "freckle", "spot", "patch",
      "white paw", "white chest", "docked tail", "bobtail", "floppy ear", "torn ear",
    ],

    // ---- 4e. Scam lexicon (weighted) ---------------------------------
    // Each phrase carries a weight; the scam analyser sums hits.
    scamSignals: [
      { re: /\bgift\s?cards?\b/i, w: 0.9, why: "asks for gift cards" },
      { re: /\b(venmo|paypal|zelle|cashapp|cash app|wire transfer|western union|bitcoin|crypto)\b/i, w: 0.7, why: "wants an untraceable payment" },
      { re: /\bshipping (fee|cost|charge)|deliver(y|ed) fee|courier\b/i, w: 0.9, why: "claims a shipping/delivery fee" },
      { re: /\b(send|pay|transfer|deposit)\b.{0,24}\b(money|funds|\$|amount|fee)\b/i, w: 0.75, why: "asks you to send money" },
      { re: /\bverif(y|ication)\b.{0,20}\b(code|otp|pin)\b/i, w: 0.85, why: "fishing for a verification code" },
      { re: /\bclaim your\b|\byou(?:'ve| have) won\b/i, w: 0.5, why: "prize-bait language" },
      { re: /\bvet bill|medical (cost|bill)|treatment fee\b/i, w: 0.55, why: "invents a vet bill to pre-pay" },
      { re: /\bi have your (pet|dog|cat)\b.{0,40}\b(but|first|before|need)\b/i, w: 0.6, why: "conditional 'I have your pet'" },
      { re: /\burgent|act now|right away|immediately\b/i, w: 0.2, why: "manufactured urgency" },
      { re: /\b(out of state|another (city|state)|currently (away|traveling))\b/i, w: 0.35, why: "claims to be far away" },
    ],

    // ---- 4f. Junk / troll tokens -------------------------------------
    junkTerms: /\b(rizz|skibidi|skibi|gyatt|sigma|fanum|gronk|sus|amogus|asdf|qwerty|test123)\b/i,

    // ---- 4g. Species behaviour facts (used by the assistant) ----------
    speciesFacts: {
      cat: {
        hideRadius: "3–5 houses",
        fact: "Frightened cats freeze and hide silently, usually within 3–5 houses of where they got out. Most 'lost' indoor cats are still inside the home.",
        tactic: "Search at night with a flashlight for eye-shine, check sheds/crawlspaces, and put the litter box and your worn clothing outside at dusk.",
      },
      dog: {
        hideRadius: "up to 5–10 miles",
        fact: "A scared dog runs, often in a straight line, and can cover 5–10 miles. Their behaviour is the opposite of a cat's.",
        tactic: "Drive the route slowly with the windows down calling calmly, drop smelly food (rotisserie chicken), and never chase — sit, look small, and toss food.",
      },
    },

    // ---- 4h. Answer knowledge base -----------------------------------
    // Each entry can be returned by the assistant. `links` reference real
    // routes that already exist in app.js's router.
    kb: {
      first_steps: {
        text: "The next 30 minutes matter most:\n\n1. Search calmly on foot — don't run or shout, it scares pets further away.\n2. If it's a cat, search inside first — most are still in the house.\n3. Post a listing now so matching starts immediately.\n4. Tell every neighbour in person and ask them to check garages and sheds.",
        links: [{ href: "#/lost", text: "Report a lost pet →" }, { href: "#/advice/first-24-hours", text: "First 24 hours checklist →" }],
      },
      flyer: {
        text: "A flyer a passing driver can read in 2 seconds:\n\n• One word, huge: LOST (or REWARD)\n• One big, clear colour photo\n• A short description\n• ONE phone number in the largest font that fits\n• A QR code to your listing (auto-generated on any listing page)",
        links: [{ href: "#/advice/flyers", text: "Full flyer guide →" }],
      },
      microchip: {
        text: "Mark the chip as 'lost' with the registry right away:\n\n• HomeAgain: 1-888-466-3242\n• AKC Reunite: 1-800-252-7894\n• 24PetWatch: 1-866-597-2424\n\nIf you FOUND a pet, any vet or shelter will scan it free in about 30 seconds.",
        links: [{ href: "#/shelter", text: "Microchip registry links →" }, { href: "#/help", text: "All helpline numbers →" }],
      },
      shelters: {
        text: "Go in person — shelter sites are often a week out of date and staff routinely mis-tag breed, colour and sex.\n\n• Ask: 'May I come look in person?'\n• Ask: 'How long is the stray hold?' (sometimes only 72 hours)\n• Call every shelter within 25 miles, not just the closest.",
        links: [{ href: "#/advice/shelters", text: "Working with shelters →" }, { href: "#/shelter", text: "Partner shelters →" }],
      },
      scent: {
        text: "Scent brings pets home:\n\n• Put a piece of your unwashed clothing and (for cats) the litter box outside the door.\n• Don't wash their bed — leave it out.\n• Leave a little smelly food out at dusk, but watch it so you don't feed wildlife instead.",
        links: [{ href: "#/advice/scent", text: "Using scent to attract pets →" }],
      },
      emotional: {
        text: "This is real grief and exhaustion, not 'just a pet'. You're doing the right things.\n\nTake water and a break when you can — a clear head searches better. If you want to talk to a person, PawTrail volunteers call back within an hour during staffed hours.",
        links: [{ href: "#/help", text: "Support & helplines →" }],
        crisis: true,
      },
      injured: {
        text: "For an injured animal:\n\n• Approach low, slow and from the side; use a towel or gloves.\n• Move small animals in a box or laundry basket; support an injured dog with a board.\n• Go to the nearest emergency vet — they treat first and sort billing later.\n• NEVER give Tylenol or ibuprofen — both are deadly to cats and dogs.\n\nPoison emergency (24/7): ASPCA 1-888-426-4435.",
        links: [{ href: "#/advice/injured", text: "Injured-animal guide →" }, { href: "#/help", text: "Emergency numbers →" }],
        urgent: true,
      },
      how_matching: {
        text: "Here's how PawTrail's matching actually works:\n\n1. Hard filters first — same species, opposite report type, within ~25 miles and a ~45-day window.\n2. Then it scores colour, breed family, size, age, location, timing, distinguishing features and a photo similarity check.\n3. Those combine into one confidence score (0–100%). 75%+ pings you instantly; lower scores go to email or a digest.\n4. Every 'this is my pet' / 'not a match' you tap retrains the model so it gets sharper over time.",
        links: [{ href: "#/my-listings", text: "See your matches →" }],
      },
    },
  };

  // Expose what we have so far; later parts attach more.
  G.PawTrailAI = {
    version: VERSION,
    config,
    util,
    knowledge,
    _store: store,
    _persist: persist,
  };

  // Stash internals other parts (appended below) will reuse.
  G.__PAWAI__ = { G, store, config, util, knowledge, persist, loadStore,
    listingsAll, _toast, _save, defaultModelRef: null };

  // ===================================================================
  // 5. The matching model — feature schema + defaults
  // ===================================================================
  // A small logistic-regression model. Each named feature contributes
  // weight * featureValue to a logit; sigmoid(logit) is the match prob.
  function defaultModel() {
    return {
      bias: -1.15,
      weights: {
        microchip:     6.0,   // a chip hit dominates everything
        colorOverlap:  1.35,
        colorExact:    0.7,
        breedExact:    1.5,
        breedFamily:   0.8,
        breedFuzzy:    0.45,
        sizeMatch:     0.6,
        sizeAdjacent: -0.3,   // off by one size band: mild penalty
        ageBand:       0.4,
        sexMatch:      0.5,
        sexMismatch:  -0.9,
        geoSameZip:    1.4,
        geoNearZip:    0.7,
        geoDistance:   1.1,   // scaled proximity (1=same spot, 0=25mi)
        timeClose:     0.8,
        timeMedium:    0.3,
        featureShared: 1.2,   // shared distinguishing feature
        featureText:   0.9,   // free-text similarity
        imageSim:      2.2,   // perceptual photo similarity
        collarMatch:   0.5,
      },
      trainedOn: 0,
      updatedAt: util.nowIso(),
    };
  }
  G.__PAWAI__.defaultModelRef = defaultModel;

  // Initialise persistence immediately so weights survive reloads.
  loadStore();

})();

/* =====================================================================
   PART 2 — VISION + MATCH ENGINE
   ===================================================================== */
(function () {
  "use strict";
  const { G, store, config, util, knowledge, persist, listingsAll } = G_AI();
  function G_AI() { return (typeof window !== "undefined" ? window : globalThis).__PAWAI__; }

  // ===================================================================
  // 6. Vision — perceptual hash + colour histogram comparison
  // ===================================================================
  // A self-contained image comparison that does NOT depend on app.js. It
  // builds a tiny luminance "difference hash" (dHash) plus a coarse colour
  // histogram, and blends Hamming-distance + histogram cosine into [0,1].
  const _imgCache = new Map();   // url -> Promise<fingerprint|null>
  const _simCache = new Map();   // "a||b" -> number

  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (_imgCache.has(src)) return _imgCache.get(src);
    const p = new Promise(resolve => {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(fingerprint(img));
        img.onerror = () => resolve(null);
        img.src = src;
      } catch (e) { resolve(null); }
    });
    _imgCache.set(src, p);
    return p;
  }

  function fingerprint(img) {
    try {
      const S = 17; // dHash needs S x (S-1) comparisons; 17 → 16-wide rows
      const cv = document.createElement("canvas");
      cv.width = S; cv.height = S;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      const lum = [];
      const hist = new Array(64).fill(0); // 4x4x4 RGB histogram
      let total = 0;
      for (let i = 0; i < S * S; i++) {
        const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        lum.push(0.299 * r + 0.587 * g + 0.114 * b);
        const bin = (Math.min(3, r >> 6) << 4) | (Math.min(3, g >> 6) << 2) | Math.min(3, b >> 6);
        hist[bin]++; total++;
      }
      // dHash: compare each pixel to its right neighbour, per row.
      const bits = [];
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S - 1; x++) {
          const i = y * S + x;
          bits.push(lum[i] > lum[i + 1] ? 1 : 0);
        }
      }
      // Normalise histogram.
      for (let i = 0; i < hist.length; i++) hist[i] = total ? hist[i] / total : 0;
      return { bits, hist };
    } catch (e) { return null; }
  }

  function hamming(a, b) {
    let same = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] === b[i]) same++;
    return n ? same / n : 0;
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  const vision = {
    // Returns a similarity in [0,1]. Prefers our own engine; if both photos
    // are missing/unloadable, returns a neutral 0 (no evidence either way).
    async compare(srcA, srcB) {
      if (!srcA || !srcB) return 0;
      const key = srcA + "||" + srcB;
      if (_simCache.has(key)) return _simCache.get(key);
      let val = 0;
      try {
        const [fa, fb] = await Promise.all([loadImage(srcA), loadImage(srcB)]);
        if (fa && fb) {
          const structural = hamming(fa.bits, fb.bits);   // shape/edges
          const colour = util.clamp(cosine(fa.hist, fb.hist), 0, 1); // palette
          // Both must agree for a high score; colour weighted a touch more.
          val = util.clamp(structural * 0.45 + colour * 0.55, 0, 1);
        } else if (typeof G.getImageSimilarity === "function") {
          // Fall back to app.js's comparator if our canvas path failed.
          val = await G.getImageSimilarity(srcA, srcB);
        }
      } catch (e) { val = 0; }
      _simCache.set(key, val);
      return val;
    },
  };

  // ===================================================================
  // 7. Feature extraction for a candidate pair
  // ===================================================================
  function colorSet(color, breed) {
    const text = util.norm(`${color || ""} ${breed || ""}`);
    const out = new Set();
    for (const grp in knowledge.colorGroups) {
      for (const w of knowledge.colorGroups[grp]) {
        if (text.includes(w)) { out.add(grp); break; }
      }
    }
    return out;
  }

  function breedFamily(breed) {
    const text = util.norm(breed);
    if (!text) return null;
    for (const fam in knowledge.breedFamilies) {
      for (const w of knowledge.breedFamilies[fam]) {
        if (text.includes(w)) return fam;
      }
    }
    return null;
  }

  function sizeBand(size) {
    const text = util.norm(size);
    if (!text) return null;
    for (const band in knowledge.sizeWords) {
      if (knowledge.sizeWords[band].some(w => text.includes(w))) return band;
    }
    return null;
  }

  function chipOf(l) {
    const direct = l.microchip || l.chip || l.chipId;
    if (direct) return String(direct).replace(/\D/g, "");
    // Try to pull a 9–15 digit number out of the features text.
    const m = util.norm(l.features).match(/\b\d{9,15}\b/);
    return m ? m[0] : null;
  }

  function sexOf(l) {
    const t = util.norm(`${l.sex || ""} ${l.features || ""}`);
    if (/\b(female|girl|she|spayed)\b/.test(t)) return "f";
    if (/\b(male|boy|he|neutered)\b/.test(t)) return "m";
    return null;
  }

  function sharedFeatureCue(a, b) {
    const ta = util.norm(a.features), tb = util.norm(b.features);
    if (!ta || !tb) return null;
    for (const cue of knowledge.featureCues) {
      if (ta.includes(cue) && tb.includes(cue)) return cue;
    }
    return null;
  }

  function geoProximity(a, b) {
    // Returns {scaled, sameZip, nearZip, miles} — scaled in [0,1].
    if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      const miles = util.haversine(a.lat, a.lng, b.lat, b.lng);
      const scaled = util.clamp(1 - miles / config.match.maxDistanceMiles, 0, 1);
      return { scaled, sameZip: a.zip && a.zip === b.zip, nearZip: false, miles };
    }
    if (a.zip && b.zip) {
      if (a.zip === b.zip) return { scaled: 0.95, sameZip: true, nearZip: false, miles: null };
      if (a.zip.slice(0, 3) === b.zip.slice(0, 3)) return { scaled: 0.55, sameZip: false, nearZip: true, miles: null };
      return { scaled: 0.1, sameZip: false, nearZip: false, miles: null };
    }
    if (a.distance != null && b.distance != null) {
      const d = Math.abs(a.distance - b.distance);
      return { scaled: util.clamp(1 - d / config.match.maxDistanceMiles, 0, 1), sameZip: false, nearZip: false, miles: d };
    }
    return { scaled: 0, sameZip: false, nearZip: false, miles: null };
  }

  // Build the named feature vector + a human-readable reason for each fired
  // signal. `imageSim` is supplied separately (it's async).
  function extractFeatures(src, cand, imageSim) {
    const f = {};            // featureName -> value in roughly [0,1] or {-1,0,1}
    const reasons = [];

    // --- microchip (decisive) ---
    const cs = chipOf(src), cc = chipOf(cand);
    if (cs && cc) {
      if (cs === cc) { f.microchip = 1; reasons.push({ key: "microchip", text: "microchip numbers match" }); }
      else { f.microchip = -1; } // different chips → almost certainly not the same animal
    }

    // --- colour ---
    const colA = colorSet(src.color, src.breed), colB = colorSet(cand.color, cand.breed);
    if (colA.size && colB.size) {
      const overlap = [...colA].filter(c => colB.has(c));
      if (overlap.length) {
        f.colorOverlap = 1;
        reasons.push({ key: "colorOverlap", text: overlap.includes("patterned") ? "matching coat pattern" : `${overlap[0]} coat` });
        if (colA.size === colB.size && overlap.length === colA.size) f.colorExact = 1;
      } else {
        f.colorOverlap = -1; // colour groups disagree → strong negative
      }
    }

    // --- breed ---
    const ba = util.norm(src.breed), bb = util.norm(cand.breed);
    if (ba && bb) {
      if (ba === bb) { f.breedExact = 1; reasons.push({ key: "breedExact", text: "same breed" }); }
      else {
        const famA = breedFamily(ba), famB = breedFamily(bb);
        if (famA && famA === famB) { f.breedFamily = 1; reasons.push({ key: "breedFamily", text: `same breed family (${famA})` }); }
        else {
          const fz = util.fuzzy(ba, bb);
          if (fz > 0.7) { f.breedFuzzy = fz; reasons.push({ key: "breedFuzzy", text: "similar breed name" }); }
        }
      }
    }

    // --- size ---
    const sa = sizeBand(src.size), sb = sizeBand(cand.size);
    if (sa && sb) {
      const order = ["small", "medium", "large"];
      const diff = Math.abs(order.indexOf(sa) - order.indexOf(sb));
      if (diff === 0) { f.sizeMatch = 1; reasons.push({ key: "sizeMatch", text: "same size" }); }
      else if (diff === 1) f.sizeAdjacent = 1;
      else f.sizeAdjacent = 2; // two bands apart → doubled penalty via weight
    }

    // --- age band ---
    const ageA = parseFloat(src.age), ageB = parseFloat(cand.age);
    if (!isNaN(ageA) && !isNaN(ageB) && Math.abs(ageA - ageB) <= 2) {
      f.ageBand = 1; reasons.push({ key: "ageBand", text: "similar age" });
    }

    // --- sex ---
    const sxA = sexOf(src), sxB = sexOf(cand);
    if (sxA && sxB) {
      if (sxA === sxB) { f.sexMatch = 1; reasons.push({ key: "sexMatch", text: "same sex" }); }
      else f.sexMismatch = 1;
    }

    // --- geo ---
    const geo = geoProximity(src, cand);
    f.geoDistance = geo.scaled;
    if (geo.sameZip) { f.geoSameZip = 1; reasons.push({ key: "geoSameZip", text: "same ZIP code" }); }
    else if (geo.nearZip) { f.geoNearZip = 1; reasons.push({ key: "geoNearZip", text: "nearby area" }); }
    if (geo.miles != null && geo.miles <= 3) reasons.push({ key: "geoDistance", text: `${geo.miles.toFixed(1)} mi apart` });

    // --- timing ---
    const hrs = util.hoursBetween(src.when, cand.when);
    if (hrs < 24) { f.timeClose = 1; reasons.push({ key: "timeClose", text: "within 24 hours" }); }
    else if (hrs < 96) { f.timeMedium = 1; reasons.push({ key: "timeMedium", text: "within a few days" }); }

    // --- distinguishing features ---
    const cue = sharedFeatureCue(src, cand);
    if (cue) { f.featureShared = 1; reasons.push({ key: "featureShared", text: `both mention "${cue}"` }); }
    const textSim = util.jaccard(src.features, cand.features);
    if (textSim > 0.18) { f.featureText = textSim; reasons.push({ key: "featureText", text: "matching description details" }); }

    // --- collar ---
    const colSrc = /\bcollar\b/.test(util.norm(src.features)), colCand = /\bcollar\b/.test(util.norm(cand.features));
    if (colSrc && colCand) { f.collarMatch = 1; }

    // --- image ---
    if (imageSim != null && imageSim > 0) {
      f.imageSim = imageSim;
      if (imageSim > 0.8) reasons.push({ key: "imageSim", text: "strong photo resemblance" });
      else if (imageSim > 0.55) reasons.push({ key: "imageSim", text: "similar appearance in photos" });
    }

    return { f, reasons, geo };
  }

  // ===================================================================
  // 8. Scoring — logistic regression over the feature vector
  // ===================================================================
  function getModel() {
    if (!store.model || !store.model.weights) store.model = G_AI().defaultModelRef();
    return store.model;
  }

  function scoreFeatures(f) {
    const model = getModel();
    let logit = model.bias;
    for (const key in f) {
      const w = model.weights[key];
      if (w == null) continue;
      logit += w * f[key];
    }
    return util.sigmoid(logit);
  }

  function band(score) {
    const b = config.bands;
    if (score >= b.high.min) return b.high.label;
    if (score >= b.medium.min) return b.medium.label;
    if (score >= b.low.min) return b.low.label;
    return b.none.label;
  }

  // Quick, synchronous, metadata-only score (no image) — used by the
  // assistant and live form sidebars where awaiting image loads is too slow.
  function quickScore(src, cand) {
    const { f, reasons } = extractFeatures(src, cand, 0);
    return { score: scoreFeatures(f), reasons: reasons.map(r => r.text) };
  }

  // ===================================================================
  // 9. computeMatches — the public, async, ranked matcher
  // ===================================================================
  async function computeMatches(source, pool) {
    store.stats.matchesRun++;
    const all = pool || listingsAll();
    const candidates = all.filter(l =>
      l && l.id !== source.id &&
      l.status !== "reunited" &&
      l.type && source.type && l.type !== source.type &&
      l.species === source.species &&
      withinWindow(l.when, source.when)
    );

    const scored = await Promise.all(candidates.map(async cand => {
      // Cheap pre-filter: if colour groups exist and don't overlap at all,
      // and there's no chip, skip the expensive image load entirely.
      const colA = colorSet(source.color, source.breed), colB = colorSet(cand.color, cand.breed);
      const colourClash = colA.size && colB.size && ![...colA].some(c => colB.has(c));
      const chipPair = chipOf(source) && chipOf(cand);
      let imageSim = 0;
      if (!colourClash || chipPair) {
        imageSim = await vision.compare(source.photo, cand.photo);
      }
      const { f, reasons } = extractFeatures(source, cand, imageSim);
      let score = scoreFeatures(f);

      // A decisive chip match shortcuts to near-certainty.
      if (f.microchip === 1) score = Math.max(score, config.match.microchipInstant);
      // A chip mismatch hard-suppresses.
      if (f.microchip === -1) score = Math.min(score, 0.05);

      return {
        listing: cand,
        score: util.round(util.clamp(score, 0, 1), 4),
        confidence: band(score),
        reasons: reasons.map(r => r.text),
        _features: f,
      };
    }));

    return scored
      .filter(m => m.score >= config.match.minReportableScore)
      .sort((a, b) => b.score - a.score);
  }

  function withinWindow(a, b) {
    if (!a || !b) return true;
    return Math.abs(new Date(a) - new Date(b)) / 86400000 <= config.match.dateWindowDays;
  }

  // ===================================================================
  // 10. Online learning — gradient update from user feedback
  // ===================================================================
  // When a user confirms / rejects a match we treat it as a labelled
  // example (y = 1 / 0) and take one logistic-regression gradient step.
  function learn(source, matched, positive) {
    const model = getModel();
    const imageSim = 0; // feedback is metadata-driven; image already informed the surfaced score
    const { f } = extractFeatures(source, matched, imageSim);
    const y = positive ? 1 : 0;
    const pred = scoreFeatures(f);
    const err = pred - y;                 // dLoss/dLogit for log-loss + sigmoid
    const lr = config.match.learningRate;
    const l2 = config.match.l2;

    model.bias -= lr * err;
    for (const key in f) {
      if (model.weights[key] == null) continue;
      const grad = err * f[key] + l2 * model.weights[key];
      model.weights[key] = util.round(model.weights[key] - lr * grad, 4);
      // Keep weights in a sane range so one troll can't poison the model.
      model.weights[key] = util.clamp(model.weights[key], -8, 8);
    }
    model.trainedOn = (model.trainedOn || 0) + 1;
    model.updatedAt = util.nowIso();
    if (positive) store.stats.feedbackPos++; else store.stats.feedbackNeg++;
    persist();
    return { trainedOn: model.trainedOn, prediction: util.round(pred, 3) };
  }

  function resetModel() {
    store.model = G_AI().defaultModelRef();
    persist();
  }

  // Publish the match API.
  G.PawTrailAI.vision = vision;
  G.PawTrailAI.match = {
    enabled: true,
    computeMatches,
    quickScore,
    band,
    learn,
    resetModel,
    getModel,
    extractFeatures,
    _internals: { colorSet, breedFamily, sizeBand, chipOf, geoProximity },
  };

})();

/* =====================================================================
   PART 3 — SECURITY: bot / abuse / scam detection + reputation
   ===================================================================== */
(function () {
  "use strict";
  function G_AI() { return (typeof window !== "undefined" ? window : globalThis).__PAWAI__; }
  const { G, store, config, util, knowledge, persist, listingsAll } = G_AI();

  // ===================================================================
  // 11. Lightweight client fingerprint
  // ===================================================================
  // We can't see the real IP client-side, so we derive a stable-ish browser
  // signature. It's only used to bucket reputation locally; the authoritative
  // per-IP limit still lives in the Supabase edge function.
  function fingerprint() {
    if (store.security._fp) return store.security._fp;
    let raw = "";
    try {
      const n = G.navigator || {};
      raw = [
        n.userAgent, n.language, (n.languages || []).join(","),
        (G.screen ? `${G.screen.width}x${G.screen.height}x${G.screen.colorDepth}` : ""),
        new Date().getTimezoneOffset(),
        n.hardwareConcurrency, n.deviceMemory, n.maxTouchPoints,
      ].join("|");
    } catch (e) { raw = "unknown"; }
    // djb2 hash → short hex id.
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
    const fp = "fp_" + (h >>> 0).toString(16);
    store.security._fp = fp;
    return fp;
  }

  function reputationOf(fp) {
    fp = fp || fingerprint();
    if (store.security.reputation[fp] == null) store.security.reputation[fp] = 0;
    return store.security.reputation[fp];
  }

  function adjustReputation(delta, fp) {
    fp = fp || fingerprint();
    store.security.reputation[fp] = util.clamp(reputationOf(fp) + delta, -50, 50);
    persist();
    return store.security.reputation[fp];
  }

  // ===================================================================
  // 12. Behavioural signal extraction
  // ===================================================================
  function recentEvents(ms) {
    const cutoff = Date.now() - ms;
    return store.security.events.filter(e => e.t >= cutoff);
  }

  function gibberishRatio(text) {
    const words = util.tokens(text, true).filter(w => w.length >= 2);
    if (!words.length) return 0;
    let bad = 0;
    for (const w of words) {
      const vowels = (w.match(/[aeiou]/g) || []).length;
      const hasNoVowel = w.length >= 4 && vowels === 0;
      const runs = /(.)\1{2,}/.test(w);                 // "aaaa"
      const lowEntropy = util.entropy(w) < 1.2 && w.length >= 5;
      const consonantPile = /[bcdfghjklmnpqrstvwxz]{5,}/.test(w);
      if (hasNoVowel || runs || lowEntropy || consonantPile) bad++;
    }
    return bad / words.length;
  }

  // Compare a candidate's text against this browser's recent submissions to
  // catch copy-paste flooding.
  function maxDuplicateSimilarity(text) {
    const mine = recentEvents(7 * 86400000).filter(e => e.kind === "listing" && e.text);
    let max = 0;
    for (const e of mine) {
      const sim = util.shingleJaccard(text, e.text);
      if (sim > max) max = sim;
    }
    return max;
  }

  // ===================================================================
  // 13. Junk / content quality check (single field or blob)
  // ===================================================================
  function looksLikeJunk(value) {
    const text = util.norm(value);
    if (!text) return false;
    if (knowledge.junkTerms.test(text)) return true;
    const letters = text.replace(/[^a-z]/g, "");
    if (letters.length >= 8 && new Set(letters).size <= 2) return true; // "aaaaaaaa"
    if (text.length >= 6 && gibberishRatio(text) >= 0.75) return true;
    return false;
  }

  // ===================================================================
  // 14. The bot-likelihood assessment
  // ===================================================================
  // Returns { score, decision, reasons, signals } where decision is one of
  // "allow" | "challenge" | "block". Higher score = more bot-like.
  function assess(submission) {
    submission = submission || {};
    const fp = fingerprint();
    const reasons = [];
    const signals = {};
    let score = 0;

    const text = [submission.location, submission.features, submission.breed,
      submission.color, submission.name, submission.desc].filter(Boolean).join(" ");

    // --- velocity ---
    const perMin = recentEvents(60000).length;
    const perHour = recentEvents(3600000).length;
    const perDay = recentEvents(86400000).length;
    signals.velocity = { perMin, perHour, perDay };
    if (perMin >= config.security.perMinute) { score += 0.45; reasons.push("rapid-fire submissions (per-minute)"); }
    else if (perMin >= config.security.perMinute - 1) { score += 0.2; }
    if (perHour >= config.security.perHour) { score += 0.25; reasons.push("high hourly submission volume"); }
    if (perDay >= config.security.perDay) { score += 0.2; reasons.push("daily submission cap exceeded"); }

    // --- gibberish / junk ---
    const gib = gibberishRatio(text);
    signals.gibberish = util.round(gib, 2);
    if (gib >= config.security.gibberishRatio) { score += 0.35; reasons.push("text looks like keyboard mashing"); }
    if (knowledge.junkTerms.test(util.norm(text))) { score += 0.3; reasons.push("contains junk/troll terms"); }

    // --- duplicate flooding ---
    const dup = maxDuplicateSimilarity(text);
    signals.duplicate = util.round(dup, 2);
    if (dup >= config.security.duplicateJaccard) { score += 0.4; reasons.push("near-duplicate of a recent post"); }

    // --- timing: form filled implausibly fast ---
    if (submission.formMs != null && submission.formMs < config.security.minHumanFormMs) {
      score += 0.3; reasons.push("form completed faster than a human could");
    }

    // --- honeypot field (should always be empty for real users) ---
    if (submission.honeypot) { score += 0.95; reasons.push("hidden honeypot field was filled"); }

    // --- ZIP hopping: many distinct ZIPs from one browser in a short window ---
    const zips = new Set(recentEvents(3600000).map(e => e.zip).filter(Boolean));
    if (submission.zip) zips.add(submission.zip);
    signals.distinctZips = zips.size;
    if (zips.size >= 5) { score += 0.25; reasons.push("posting across many ZIP codes quickly"); }

    // --- reputation ---
    const rep = reputationOf(fp);
    signals.reputation = rep;
    if (rep <= config.security.reputationFloor) { score += 0.4; reasons.push("this browser has a poor reputation history"); }
    else if (rep > 6) { score -= 0.15; } // trusted history earns slack

    score = util.clamp(score, 0, 1);
    let decision = "allow";
    if (score >= config.security.blockScore) decision = "block";
    else if (score >= config.security.challengeScore) decision = "challenge";

    return { score: util.round(score, 3), decision, reasons, signals, fingerprint: fp };
  }

  // Record a submission event (call AFTER a real attempt) so velocity /
  // duplicate detection has history to work with.
  function recordEvent(kind, submission) {
    submission = submission || {};
    const text = [submission.location, submission.features, submission.breed,
      submission.color, submission.name, submission.desc].filter(Boolean).join(" ");
    store.security.events.push({
      t: Date.now(),
      kind: kind || "listing",
      zip: submission.zip || null,
      text: text.slice(0, 240),
      fp: fingerprint(),
    });
    persist();
  }

  // Convenience used by app.js: gate a listing submission. Returns the same
  // shape app.js already expects from canSubmitListing: {allowed, reason}.
  function gateListing(submission) {
    const a = assess(submission);
    if (a.decision === "block") {
      store.security.blocks++;
      adjustReputation(-4);
      persist();
      return { allowed: false, reason: `Automated moderation blocked this submission: ${a.reasons[0] || "suspicious activity"}.`, assessment: a };
    }
    if (a.decision === "challenge") store.security.challenges++;
    return { allowed: true, assessment: a };
  }

  // ===================================================================
  // 15. Scam-message analyser (PRD §4.9 scam mitigation)
  // ===================================================================
  // Scores a message (e.g. a relayed reply to a listing) for scam risk.
  function analyzeScam(message) {
    const text = String(message || "");
    if (!text.trim()) return { risk: 0, level: "none", hits: [], verdict: "Nothing to analyse yet." };
    let risk = 0;
    const hits = [];
    for (const sig of knowledge.scamSignals) {
      if (sig.re.test(text)) { risk += sig.w; hits.push(sig.why); }
    }
    // A bare money mention with a request verb compounds risk.
    if (/\$\s?\d/.test(text) && /\b(send|pay|need|transfer|deposit)\b/i.test(text)) risk += 0.2;
    risk = util.clamp(risk, 0, 1);

    let level = "low", verdict = "";
    if (risk >= 0.7) {
      level = "high";
      verdict = "This is almost certainly a scam. A real finder NEVER asks for money before you've seen your pet in person. Do not send anything.";
      store.stats.scamsCaught++;
      persist();
    } else if (risk >= 0.35) {
      level = "medium";
      verdict = "This message has warning signs of a scam. Be very careful — verify the pet in person before any money changes hands.";
    } else if (hits.length) {
      level = "low";
      verdict = "Mostly fine, but stay alert: never pay before seeing your pet in person.";
    } else {
      level = "none";
      verdict = "No obvious scam signals — but the golden rule still holds: verify in person, never pay up front.";
    }
    return { risk: util.round(risk, 2), level, hits: [...new Set(hits)], verdict };
  }

  G.PawTrailAI.security = {
    fingerprint,
    reputationOf,
    adjustReputation,
    assess,
    recordEvent,
    gateListing,
    looksLikeJunk,
    gibberishRatio,
    analyzeScam,
    stats() {
      return {
        events: store.security.events.length,
        blocks: store.security.blocks,
        challenges: store.security.challenges,
        knownFingerprints: Object.keys(store.security.reputation).length,
        reputation: reputationOf(),
      };
    },
  };

})();

/* =====================================================================
   PART 4 — NLU: intent classification + entity extraction
   ===================================================================== */
(function () {
  "use strict";
  function G_AI() { return (typeof window !== "undefined" ? window : globalThis).__PAWAI__; }
  const { G, util, knowledge } = G_AI();

  // ===================================================================
  // 16. Intent catalogue
  // ===================================================================
  // Each intent has weighted patterns. A pattern can be a RegExp (strong)
  // or a keyword string (matched as a word, lighter weight). The classifier
  // sums hits, normalises by a soft cap, and returns ranked intents.
  const INTENTS = [
    { id: "scam_check", base: 0,
      strong: [/\bis\b.{0,15}\bscam\b/, /\bscam\b/, /\bgift\s?cards?\b/, /\b(asking|wants|asked)\b.{0,20}\bmoney\b/, /\b(venmo|paypal|zelle|cashapp|wire|bitcoin)\b/, /shipping (fee|cost)/],
      words: ["scam", "extort", "fraud", "suspicious", "money", "payment", "pay", "fee"] },

    { id: "injured", base: 0,
      strong: [/\b(injur|bleed|hit by|wounded|broken leg|can'?t walk|in pain)\b/, /\bhurt\b/, /\bemergenc/],
      words: ["injured", "hurt", "bleeding", "emergency", "wound", "poison", "sick", "dying"] },

    { id: "lost_pet", base: 0,
      strong: [/\b(i|we)\b.{0,12}\b(lost|missing)\b/, /\b(ran away|ran off|escaped|got out|slipped (out|the gate)|went missing)\b/, /\bmy (dog|cat|pet|puppy|kitten|bird|rabbit)\b.{0,18}\b(gone|missing|lost)\b/, /\bcan'?t find my\b/],
      words: ["lost", "missing", "gone", "escaped", "runaway", "disappeared"] },

    { id: "found_pet", base: 0,
      strong: [/\bi\b.{0,12}\bfound\b/, /\b(stray|in my yard|wandering|showed up|came to my (door|porch))\b/, /\bthere'?s a (dog|cat)\b/],
      words: ["found", "stray", "wandering", "yard", "porch"] },

    { id: "search_cat", base: 0,
      strong: [/\b(cat|kitten|kitty)\b.{0,25}\b(hid|hiding|find|search|look|where)\b/, /\bhow.{0,15}find.{0,10}cat\b/, /\bwhere (do|would) (a )?cat/],
      words: ["cat", "kitten", "kitty", "hiding"] },

    { id: "search_dog", base: 0,
      strong: [/\b(dog|puppy)\b.{0,25}\b(find|search|look|running|where|catch)\b/, /\bhow.{0,15}(find|catch).{0,10}dog\b/, /\bwon'?t come/],
      words: ["dog", "puppy", "running"] },

    { id: "flyer", base: 0,
      strong: [/\b(flyer|flier|poster|print|sign)\b/],
      words: ["flyer", "flier", "poster", "print", "qr"] },

    { id: "microchip", base: 0,
      strong: [/\b(micro)?chip\b/, /\bregistr(y|ies|ar)\b/, /\bscanned?\b/],
      words: ["chip", "microchip", "registry", "homeagain", "akc", "scan"] },

    { id: "shelters", base: 0,
      strong: [/\b(shelter|pound|animal control|humane society|spca)\b/, /\b(vet|veterinarian|clinic)\b/],
      words: ["shelter", "pound", "vet", "clinic", "rescue"] },

    { id: "scent", base: 0,
      strong: [/\b(scent|smell|litter box|worn clothing|familiar smell)\b/],
      words: ["scent", "smell", "litter"] },

    { id: "emotional", base: 0,
      strong: [/\b(falling apart|can'?t (cope|stop crying|sleep|eat)|devastat|heartbroken|so (scared|worried|sad)|giving up|hopeless|grief|grieving)\b/, /\bi'?m (a mess|losing it|so tired|exhausted)\b/],
      words: ["scared", "worried", "crying", "devastated", "hopeless", "exhausted", "grief", "sad"] },

    { id: "how_matching", base: 0,
      strong: [/\bhow (does|do).{0,20}(match|matching|algorithm|work)\b/, /\bwhat (is|are) (the )?match/, /\bhow.{0,15}\bmatch(es|ing)?\b/],
      words: ["matching", "algorithm", "confidence", "how"] },

    { id: "my_matches", base: 0,
      strong: [/\b(my|any) (match|matches)\b/, /\bdo i have (any )?match/, /\bcheck (my )?(match|listing|alert)/, /\bany (alert|update)s?\b/],
      words: ["matches", "alerts", "updates"] },

    { id: "find_listings", base: 0,
      strong: [/\b(search|find|show me|look for|any)\b.{0,30}\b(dog|cat|pet|listing|near|in)\b/, /\bnear (me|\d{5})\b/],
      words: ["search", "find", "browse", "near", "listings"] },

    { id: "greeting", base: 0,
      strong: [/^(hi|hello|hey|hiya|yo|good (morning|afternoon|evening))\b/],
      words: ["hi", "hello", "hey"] },

    { id: "thanks", base: 0,
      strong: [/\b(thank|thanks|thx|appreciate|helpful|great help)\b/],
      words: ["thanks", "thank", "appreciate"] },

    { id: "human", base: 0,
      strong: [/\b(human|real person|agent|call me|callback|talk to someone|volunteer)\b/],
      words: ["human", "person", "agent", "callback", "volunteer"] },
  ];

  // ===================================================================
  // 17. Entity extraction
  // ===================================================================
  function extractEntities(text) {
    const t = util.norm(text);
    const ent = {};

    // species
    if (/\b(dog|puppy|pup|doggo|canine)\b/.test(t)) ent.species = "dog";
    else if (/\b(cat|kitten|kitty|feline)\b/.test(t)) ent.species = "cat";
    else if (/\b(rabbit|bunny)\b/.test(t)) ent.species = "rabbit";
    else if (/\bbird|parrot|parakeet\b/.test(t)) ent.species = "bird";

    // colour (canonical groups)
    const colours = [];
    for (const grp in knowledge.colorGroups) {
      if (knowledge.colorGroups[grp].some(w => t.includes(w))) colours.push(grp);
    }
    if (colours.length) ent.colors = colours;

    // breed family
    for (const fam in knowledge.breedFamilies) {
      if (knowledge.breedFamilies[fam].some(w => t.includes(w))) { ent.breedFamily = fam; break; }
    }

    // size
    for (const band in knowledge.sizeWords) {
      if (knowledge.sizeWords[band].some(w => t.includes(w))) { ent.size = band; break; }
    }

    // zip
    const zip = (text.match(/\b\d{5}\b/) || [])[0];
    if (zip) ent.zip = zip;

    // money mention (a scam tell)
    if (/\$\s?\d|\b\d+\s?(dollars|usd|bucks)\b|\b(venmo|paypal|zelle|gift\s?card)\b/.test(t)) ent.money = true;

    // urgency / distress cue counts (feed sentiment)
    ent.distress = (t.match(/\b(scared|worried|crying|please help|desperate|hopeless|terrified|exhausted|can'?t)\b/g) || []).length;

    // time hints
    if (/\b(just now|minutes ago|right now|today)\b/.test(t)) ent.recency = "now";
    else if (/\b(yesterday|last night|this morning)\b/.test(t)) ent.recency = "recent";
    else if (/\b(days? ago|week|while ago)\b/.test(t)) ent.recency = "older";

    return ent;
  }

  // ===================================================================
  // 18. The classifier
  // ===================================================================
  function classify(text) {
    const t = util.norm(text);
    const toks = new Set(util.tokens(text, true));
    const scores = [];

    for (const intent of INTENTS) {
      let s = intent.base || 0;
      for (const re of (intent.strong || [])) if (re.test(t)) s += 1.0;
      for (const w of (intent.words || [])) if (toks.has(w)) s += 0.35;
      if (s > 0) scores.push({ id: intent.id, score: util.round(s, 3) });
    }
    scores.sort((a, b) => b.score - a.score);

    const top = scores[0] || { id: "fallback", score: 0 };
    // Confidence: how dominant the top intent is.
    const total = scores.reduce((a, b) => a + b.score, 0) || 1;
    const confidence = util.round(top.score / total, 3);

    return {
      intent: top.score >= 0.35 ? top.id : "fallback",
      confidence,
      ranked: scores.slice(0, 4),
      entities: extractEntities(text),
    };
  }

  G.PawTrailAI.nlu = { classify, extractEntities, _intents: INTENTS };

})();

/* =====================================================================
   PART 5 — ASSISTANT: the conversational brain (memory + actions)
   ===================================================================== */
(function () {
  "use strict";
  function G_AI() { return (typeof window !== "undefined" ? window : globalThis).__PAWAI__; }
  const { G, store, util, knowledge, persist, listingsAll } = G_AI();

  const AI = G.PawTrailAI;
  const KB = knowledge.kb;

  // ===================================================================
  // 19. Session memory (slot filling)
  // ===================================================================
  const session = {
    get slots() { return store.session.slots; },
    remember(ent) {
      const s = store.session.slots;
      if (ent.species) s.species = ent.species;
      if (ent.colors) s.colors = ent.colors;
      if (ent.breedFamily) s.breedFamily = ent.breedFamily;
      if (ent.size) s.size = ent.size;
      if (ent.zip) s.zip = ent.zip;
      if (ent.recency) s.recency = ent.recency;
      // running distress tally drives empathy
      if (ent.distress) s.distress = (s.distress || 0) + ent.distress;
      persist();
    },
    log(role, text) {
      store.session.transcript.push({ role, text: String(text).slice(0, 600), t: Date.now() });
      store.stats.assistantTurns++;
      persist();
    },
    reset() {
      store.session = { slots: {}, transcript: [], startedAt: Date.now() };
      persist();
    },
  };

  // ===================================================================
  // 20. Helpers shared by handlers
  // ===================================================================
  function speciesLabel(sp) {
    return ({ dog: "dog", cat: "cat", rabbit: "rabbit", bird: "bird" }[sp]) || "pet";
  }

  // Live search over all listings using free-text + remembered slots.
  function searchLive(query, opts) {
    opts = opts || {};
    const ent = AI.nlu.extractEntities(query);
    const sp = opts.species || ent.species || session.slots.species;
    const zip = opts.zip || ent.zip || session.slots.zip;
    const colors = ent.colors || session.slots.colors;
    const q = util.norm(query);

    let pool = listingsAll().filter(l => l && l.status === "active");
    if (opts.type) pool = pool.filter(l => l.type === opts.type);
    if (sp) pool = pool.filter(l => l.species === sp);

    const scored = pool.map(l => {
      let s = 0;
      const hay = util.norm([l.name, l.breed, l.color, l.location, l.zip, l.features, l.species].join(" "));
      // token overlap with the query
      for (const tok of util.tokens(query)) if (hay.includes(tok)) s += 1;
      if (zip && l.zip) { if (l.zip === zip) s += 3; else if (l.zip.slice(0, 3) === zip.slice(0, 3)) s += 1.2; }
      if (colors && colors.length) {
        const lc = AI.match._internals.colorSet(l.color, l.breed);
        if (colors.some(c => lc.has(c))) s += 1.5;
      }
      return { l, s };
    }).filter(x => x.s > 0 || (!q && sp));
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 5).map(x => x.l);
  }

  function listingLinks(listings) {
    return listings.map(l => ({
      href: `#/listing/${l.id}`,
      text: `${l.type === "lost" ? "Lost" : "Found"}: ${l.name || util.titleCase(l.species)}${l.location ? " · " + l.location : ""} →`,
    }));
  }

  // Synchronous best-effort match preview for the user's own listings.
  function myMatchPreview() {
    const mine = (store && G.state && G.state.listings || []).filter(l => l.poster && l.poster.name === "You");
    const out = [];
    for (const src of mine) {
      const pool = listingsAll().filter(l =>
        l.id !== src.id && l.status !== "reunited" &&
        l.type !== src.type && l.species === src.species);
      let best = null;
      for (const cand of pool) {
        const { score } = AI.match.quickScore(src, cand);
        if (!best || score > best.score) best = { cand, score };
      }
      if (best && best.score >= 0.25) out.push({ src, best });
    }
    return out;
  }

  // ===================================================================
  // 21. Intent handlers — each returns { text, links?, meta? }
  // ===================================================================
  const handlers = {
    greeting() {
      const s = session.slots;
      const back = s.species ? ` Last time we were talking about your ${speciesLabel(s.species)} — want to pick that back up?` : "";
      return {
        text: `Hi — I'm the PawTrail assistant, and I can actually do things, not just chat.${back}\n\nI can:\n• Walk you through reporting a lost or found pet\n• Search live listings near you\n• Check a suspicious message for scam signs\n• Tell you exactly what to do in the next 30 minutes\n\nWhat's going on?`,
      };
    },

    thanks() {
      return { text: "You're welcome. Searching is exhausting — you're doing the right things. I'm here whenever you need to think the next step through." };
    },

    lost_pet(ctx) {
      session.slots.side = "lost";
      const sp = ctx.entities.species || session.slots.species;
      let lead = "I'm sorry — let's move fast.";
      if (sp === "cat") lead = "I'm sorry. First, the most important thing for a cat:";
      const facts = sp && knowledge.speciesFacts[sp] ? `\n\n${knowledge.speciesFacts[sp].fact}` : "";
      const base = KB.first_steps;
      // Offer to look at what's already posted on the found side.
      const found = searchLive("", { type: "found", species: sp });
      const links = base.links.slice();
      if (found.length) links.push({ href: "#/listings", text: `See ${found.length} found-pet listing${found.length > 1 ? "s" : ""} that could match →` });
      return { text: `${lead}\n\n${base.text}${facts}`, links };
    },

    found_pet(ctx) {
      session.slots.side = "found";
      const sp = ctx.entities.species || session.slots.species;
      const lost = searchLive("", { type: "lost", species: sp });
      const links = [
        { href: "#/found", text: "Report a found pet (90 seconds, no account) →" },
        { href: "#/advice/found-pet", text: "Full found-pet guide →" },
      ];
      let extra = "";
      if (lost.length) {
        extra = `\n\nGood news: there ${lost.length === 1 ? "is" : "are"} already ${lost.length} matching LOST listing${lost.length > 1 ? "s" : ""} — the owner may be looking right now.`;
        links.unshift(...listingLinks(lost).slice(0, 3));
      }
      return {
        text: `Thank you for helping.\n\n1. If they have a tag, call the number on it.\n2. Post a Found listing so the owner's alerts fire immediately.\n3. Get them scanned for a microchip at any vet — free, 30 seconds.\n4. You do NOT have to take them to a shelter.${extra}`,
        links,
      };
    },

    search_cat() {
      session.slots.species = "cat";
      const f = knowledge.speciesFacts.cat;
      return { text: `Cats hide — they almost always stay within ${f.hideRadius}, frozen and silent.\n\n${f.tactic}\n\nSet a humane trap if you haven't found them within 48 hours.`,
        links: [{ href: "#/advice/search-strategy", text: "Cats vs. dogs search guide →" }] };
    },

    search_dog() {
      session.slots.species = "dog";
      const f = knowledge.speciesFacts.dog;
      return { text: `Dogs travel — ${f.hideRadius}, often in a straight line.\n\n${f.tactic}\n\nHand flyers to mail carriers and delivery drivers; they cover enormous ground daily.`,
        links: [{ href: "#/advice/search-strategy", text: "Search strategy guide →" }] };
    },

    flyer() { return KB.flyer; },
    microchip() { return KB.microchip; },
    shelters() { return KB.shelters; },
    scent() { return KB.scent; },
    how_matching() { return KB.how_matching; },

    injured() {
      const k = KB.injured;
      return { text: k.text, links: k.links, meta: { urgent: true } };
    },

    emotional() {
      const k = KB.emotional;
      return { text: k.text, links: k.links, meta: { crisis: true } };
    },

    scam_check(ctx) {
      // If the user pasted an actual message, analyse it. Otherwise teach.
      const raw = ctx.raw || "";
      const looksPasted = raw.length > 40 || ctx.entities.money;
      if (looksPasted) {
        const r = AI.security.analyzeScam(raw);
        let text = `Scam risk: ${r.level.toUpperCase()} (${Math.round(r.risk * 100)}%).\n\n${r.verdict}`;
        if (r.hits.length) text += `\n\nWhat tripped the check:\n${r.hits.map(h => "• " + h).join("\n")}`;
        text += `\n\nSafe next steps:\n1. Don't send money or codes — ever.\n2. Ask for a fresh photo of a specific feature you never posted publicly.\n3. Meet only in a public place (vet, police lot) with a friend.`;
        return { text, links: [{ href: "#/advice/scams", text: "Full scam guide →" }] };
      }
      return {
        text: "Paste the suspicious message here and I'll score it for you.\n\nThe golden rule: a real finder NEVER asks for money, gift cards, or a 'shipping fee' before you've seen your pet in person. If money comes up before a meeting, it's a scam.",
        links: [{ href: "#/advice/scams", text: "Common scam patterns →" }],
      };
    },

    my_matches() {
      const previews = myMatchPreview();
      if (!previews.length) {
        return {
          text: "I don't see any strong matches for your listings yet. That's normal early on — matching keeps running automatically as new reports come in, and I'll surface anything promising.\n\nMeanwhile, sharing widens the net fastest.",
          links: [{ href: "#/my-listings", text: "Manage my listings →" }],
        };
      }
      const lines = previews.slice(0, 3).map(p =>
        `• ${util.titleCase(p.src.name || p.src.species)} → ${Math.round(p.best.score * 100)}% (${AI.match.band(p.best.score)})`);
      return {
        text: `Here's what I'm seeing across your listings:\n\n${lines.join("\n")}\n\nOpen a listing to review the side-by-side and confirm or reject — every answer sharpens future matches.`,
        links: previews.slice(0, 3).map(p => ({ href: `#/listing/${p.best.cand.id}`, text: `Review match for ${util.titleCase(p.src.name || p.src.species)} →` })),
      };
    },

    find_listings(ctx) {
      const results = searchLive(ctx.raw);
      if (!results.length) {
        return {
          text: "I couldn't find an active listing matching that. Try a species, colour, or ZIP — e.g. \"black cat near 97214\" — or browse everything.",
          links: [{ href: "#/listings", text: "Browse all listings →" }],
        };
      }
      return {
        text: `I found ${results.length} active listing${results.length > 1 ? "s" : ""} that match. Tap any to see the full report:`,
        links: listingLinks(results),
      };
    },

    human() {
      return {
        text: "Of course. I've noted that you'd like a real person — tap \"Get human help\" below and a PawTrail volunteer will call you back within an hour during staffed hours (9am–9pm local).\n\nFor an immediate poison emergency: ASPCA 1-888-426-4435 (24/7).",
        links: [{ href: "#/help", text: "All helpline numbers →" }],
        meta: { escalate: true },
      };
    },

    fallback(ctx) {
      // Try to be useful even when unsure: if we have a remembered side, nudge.
      const s = session.slots;
      if (s.side === "lost") return handlers.lost_pet(ctx);
      if (s.side === "found") return handlers.found_pet(ctx);
      return {
        text: "I want to make sure I help with the right thing. I can:\n• Tell you what to do right now (lost or found)\n• Search live listings near you\n• Check a message for scam signs\n• Explain how matching works\n• Find shelters, registries, or flyer tips\n\nWhat's happening?",
        links: [{ href: "#/tips", text: "Quick tips →" }, { href: "#/advice", text: "Advice center →" }],
      };
    },
  };

  // ===================================================================
  // 22. respond() — the single public entry point
  // ===================================================================
  function respond(query) {
    const raw = String(query || "").trim();
    session.log("user", raw);

    const nlu = AI.nlu.classify(raw);
    session.remember(nlu.entities);

    // Distress overlay: if the running distress tally is high and the intent
    // isn't already emotional/injured, gently surface support alongside.
    const distress = session.slots.distress || 0;

    const handler = handlers[nlu.intent] || handlers.fallback;
    const ctx = { raw, entities: nlu.entities, nlu, slots: session.slots };
    let result;
    try { result = handler(ctx) || handlers.fallback(ctx); }
    catch (e) { result = handlers.fallback(ctx); }

    // Append a soft empathy line for distressed users on practical answers.
    if (distress >= 2 && !["emotional", "injured", "thanks", "greeting"].includes(nlu.intent)) {
      result = Object.assign({}, result);
      result.text += "\n\nAnd — this is hard. You're doing everything right. Breathe when you can.";
      result.links = (result.links || []).concat([{ href: "#/help", text: "Talk to a volunteer →" }]);
    }

    session.log("bot", result.text);
    return {
      text: result.text,
      links: result.links || [],
      intent: nlu.intent,
      confidence: nlu.confidence,
      meta: result.meta || {},
    };
  }

  AI.assistant = {
    respond,
    session,
    searchLive,
    greeting: () => handlers.greeting().text,
    reset: () => session.reset(),
  };

})();

/* =====================================================================
   PART 6 — INSIGHTS + BRAIN ORCHESTRATOR + INTEGRATION
   ===================================================================== */
(function () {
  "use strict";
  function G_AI() { return (typeof window !== "undefined" ? window : globalThis).__PAWAI__; }
  const { G, store, config, util, persist, listingsAll } = G_AI();
  const AI = G.PawTrailAI;

  // ===================================================================
  // 23. Insights — the brain's situational awareness over all data
  // ===================================================================
  const insights = {
    // A high-level snapshot used for an internal dashboard / debugging.
    situationReport() {
      const all = listingsAll();
      const active = all.filter(l => l.status === "active");
      const lost = active.filter(l => l.type === "lost");
      const found = active.filter(l => l.type === "found");

      // Hot ZIP zones: where are reports concentrating?
      const byZip = {};
      active.forEach(l => { if (l.zip) byZip[l.zip] = (byZip[l.zip] || 0) + 1; });
      const hotZones = Object.entries(byZip).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([zip, n]) => ({ zip, count: n }));

      // Species breakdown.
      const bySpecies = {};
      active.forEach(l => { bySpecies[l.species] = (bySpecies[l.species] || 0) + 1; });

      return {
        version: AI.version,
        listings: { total: all.length, active: active.length, lost: lost.length, found: found.length },
        bySpecies,
        hotZones,
        model: { trainedOn: AI.match.getModel().trainedOn, updatedAt: AI.match.getModel().updatedAt },
        security: AI.security.stats(),
        engineStats: store.stats,
      };
    },

    // Estimate how many lost↔found match opportunities currently exist
    // (metadata-only, fast). Useful as a "the brain is watching" signal.
    matchOpportunities(minScore) {
      minScore = minScore || 0.4;
      const active = listingsAll().filter(l => l.status === "active");
      const lost = active.filter(l => l.type === "lost");
      const found = active.filter(l => l.type === "found");
      let count = 0;
      for (const a of lost) {
        for (const b of found) {
          if (a.species !== b.species) continue;
          const { score } = AI.match.quickScore(a, b);
          if (score >= minScore) count++;
        }
      }
      return count;
    },
  };
  AI.insights = insights;

  // ===================================================================
  // 24. Brain — the orchestrator other code calls
  // ===================================================================
  // A single funnel for "a new listing just arrived": run abuse defence,
  // record the event for velocity tracking, compute matches, and hand back
  // a structured result the UI can turn into alerts.
  const brain = {
    async onListingCreated(listing, meta) {
      meta = meta || {};
      // 1. Abuse / bot gate (non-fatal: callers decide what to do).
      const gate = AI.security.gateListing({
        location: listing.location, features: listing.features, breed: listing.breed,
        color: listing.color, name: listing.name, zip: listing.zip,
        formMs: meta.formMs, honeypot: meta.honeypot,
      });
      // 2. Always record the event so later submissions are rate-aware.
      AI.security.recordEvent("listing", listing);
      // 3. Matching.
      const matches = await AI.match.computeMatches(listing);
      return { gate, matches, top: matches.slice(0, 5) };
    },

    // Called by app.js when a user confirms/rejects a surfaced match.
    onFeedback(source, matched, positive) {
      const r = AI.match.learn(source, matched, positive);
      // A confirmed real match is a reputation positive for the submitter.
      if (positive) AI.security.adjustReputation(1);
      return r;
    },

    assistantReply(query) { return AI.assistant.respond(query); },
    checkScam(message) { return AI.security.analyzeScam(message); },
    report() { return insights.situationReport(); },
  };
  AI.brain = brain;

  // ===================================================================
  // 25. Integration — wire the brain into the existing app surface
  // ===================================================================
  // We override a few globals (functions resolve via the global object, so
  // reassigning window.X changes what app.js/features.js call). Each keeps a
  // reference to the original so nothing breaks if the engine is disabled.
  function wire() {
    // --- 25a. Matching: delegate computeMatches to the engine ----------
    if (typeof G.computeMatches === "function" && !G.computeMatches.__aiWrapped) {
      const orig = G.computeMatches;
      const wrapped = async function (source) {
        try { return await AI.match.computeMatches(source, listingsAll()); }
        catch (e) { console.warn("[PawTrailAI] match fallback", e); return orig(source); }
      };
      wrapped.__aiWrapped = true;
      wrapped.__orig = orig;
      G.computeMatches = wrapped;
    }

    // --- 25b. Learning: route trainMatchAlgorithm through the engine ----
    if (typeof G.trainMatchAlgorithm === "function" && !G.trainMatchAlgorithm.__aiWrapped) {
      const orig = G.trainMatchAlgorithm;
      const wrapped = function (source, matchedListing, positive) {
        try { brain.onFeedback(source, matchedListing, positive); }
        catch (e) { console.warn("[PawTrailAI] learn error", e); }
        // Keep the original behaviour too (it maintains app.js's own weights
        // and the matchFeedback log used elsewhere).
        try { return orig(source, matchedListing, positive); } catch (e) {}
      };
      wrapped.__aiWrapped = true;
      G.trainMatchAlgorithm = wrapped;
    }

    // --- 25c. Assistant: replace botReply with the real brain ----------
    if (typeof G.botReply === "function" && !G.botReply.__aiWrapped) {
      const orig = G.botReply;
      const wrapped = function (q) {
        try {
          const r = AI.assistant.respond(q);
          return { text: r.text, links: r.links };
        } catch (e) { console.warn("[PawTrailAI] assistant fallback", e); return orig(q); }
      };
      wrapped.__aiWrapped = true;
      wrapped.__orig = orig;
      G.botReply = wrapped;
    }

    // --- 25d. Abuse defence: augment canSubmitListing ------------------
    if (typeof G.canSubmitListing === "function" && !G.canSubmitListing.__aiWrapped) {
      const orig = G.canSubmitListing;
      const wrapped = async function (listing) {
        // Run the original (handles ban state + Supabase policy) first.
        const base = await orig(listing);
        if (base && base.allowed === false) return base;
        // Then layer the engine's behavioural assessment.
        try {
          const gate = AI.security.gateListing({
            location: listing.location, features: listing.features, breed: listing.breed,
            color: listing.color, name: listing.name, zip: listing.zip,
          });
          AI.security.recordEvent("listing", listing);
          if (gate.allowed === false) return gate;
        } catch (e) { /* never block on engine error */ }
        return base;
      };
      wrapped.__aiWrapped = true;
      wrapped.__orig = orig;
      G.canSubmitListing = wrapped;
    }
  }

  // ===================================================================
  // 26. init — called by app.js (or self-fires after load)
  // ===================================================================
  let _inited = false;
  function init() {
    if (_inited) return AI;
    _inited = true;
    try { wire(); } catch (e) { console.warn("[PawTrailAI] wire failed", e); }
    try {
      const rep = AI.insights.situationReport();
      console.info(`%c🐾 PawTrail AI ${AI.version} online`, "color:#e87c2e;font-weight:700",
        `· model trained on ${rep.model.trainedOn} examples · ${rep.listings.active} active listings · ${AI.insights.matchOpportunities()} live match opportunities`);
    } catch (e) {}
    return AI;
  }
  AI.init = init;

  // Self-initialise: if app.js already finished, wire now; otherwise wait.
  if (typeof G.document !== "undefined" && G.document.readyState === "complete") {
    init();
  } else {
    G.addEventListener && G.addEventListener("load", () => init());
    // Also try shortly after DOMContentLoaded in case 'load' is far off.
    G.addEventListener && G.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  }

})();
