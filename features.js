/* features.js — PRD-complete feature additions
   Loaded after app.js; all helpers (state, $, $$, etc.) already available.
*/

// =========================================
// Dark mode
// =========================================
function toggleDarkMode() {
  state.settings.darkMode = !state.settings.darkMode;
  applyDarkMode();
  saveState();
  const btn = $("#darkmode-btn");
  if (btn) btn.title = state.settings.darkMode ? "Switch to light mode" : "Toggle dark mode";
  btn.textContent = state.settings.darkMode ? "☀️" : "🌙";
}

// =========================================
// Bookmarks
// =========================================
function isBookmarked(id) { return (state.bookmarks || []).includes(id); }
function toggleBookmark(id) {
  if (!state.bookmarks) state.bookmarks = [];
  if (isBookmarked(id)) state.bookmarks = state.bookmarks.filter(b => b !== id);
  else state.bookmarks.push(id);
  saveState();
  return isBookmarked(id);
}

// =========================================
// Share count tracking
// =========================================
function incrementShare(listingId, channel) {
  if (!state.shareCounts) state.shareCounts = {};
  if (!state.shareCounts[listingId]) state.shareCounts[listingId] = {};
  state.shareCounts[listingId][channel] = (state.shareCounts[listingId][channel] || 0) + 1;
  saveState();
}

// =========================================
// Canvas share-card generator (PRD §4.5)
// =========================================
function generateShareCard(listing, cb) {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 420;
  const ctx = canvas.getContext("2d");

  const isLost = listing.type === "lost";
  const bg = isLost ? "#fde9e7" : "#e1f3ec";
  const accent = isLost ? "#d93a2e" : "#2d9b6c";

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 420);

  // Top banner
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 800, 90);

  // Banner text
  ctx.fillStyle = "white";
  ctx.font = "bold 52px system-ui, -apple-system, sans-serif";
  ctx.fillText(isLost ? "🔴  LOST PET" : "🟢  FOUND PET", 30, 63);

  // Pet name
  ctx.fillStyle = "#1f1a14";
  ctx.font = "bold 38px system-ui, -apple-system, sans-serif";
  ctx.fillText(listing.name || `${listing.species[0].toUpperCase() + listing.species.slice(1)}`, 30, 152);

  // Attributes
  ctx.fillStyle = "#4a4135";
  ctx.font = "22px system-ui, -apple-system, sans-serif";
  const attrs = [listing.breed, listing.color, listing.size].filter(Boolean).join(" · ");
  ctx.fillText(attrs, 30, 192);

  ctx.fillStyle = "#1f1a14";
  ctx.font = "21px system-ui, -apple-system, sans-serif";
  ctx.fillText("📍  " + (listing.location || "See listing for details"), 30, 232);

  if (listing.reward) {
    ctx.fillStyle = "#b87800";
    ctx.font = "bold 21px system-ui, -apple-system, sans-serif";
    ctx.fillText(`💰  Reward $${listing.reward} offered`, 30, 268);
  }

  // QR placeholder box
  ctx.strokeStyle = "#ede4d8";
  ctx.lineWidth = 2;
  ctx.strokeRect(620, 110, 150, 150);
  ctx.fillStyle = "#8c7d6a";
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("QR code", 695, 188);
  ctx.fillText("scan to view", 695, 208);
  ctx.textAlign = "left";

  // URL bar
  ctx.fillStyle = "#f3ece0";
  ctx.fillRect(0, 370, 800, 50);
  ctx.fillStyle = "#4a4135";
  ctx.font = "17px system-ui, -apple-system, sans-serif";
  ctx.fillText(`🐾  pawtrail.example/listing/${listing.id}`, 24, 401);

  // PawTrail brand
  ctx.fillStyle = "#e87c2e";
  ctx.font = "bold 17px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("PawTrail", 776, 401);
  ctx.textAlign = "left";

  // Try to load the pet photo into a circle
  if (listing.photo && !listing.photo.startsWith("data:")) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(710, 310, 58, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 652, 252, 116, 116);
      ctx.restore();
      cb(canvas.toDataURL("image/png"));
    };
    img.onerror = () => cb(canvas.toDataURL("image/png"));
    img.src = listing.photo;
  } else {
    cb(canvas.toDataURL("image/png"));
  }
}

// =========================================
// My Listings (PRD §4.2, §4.4)
// =========================================
function renderMyListings() {
  const myListings = state.listings;
  const bookmarked = (state.bookmarks || [])
    .map(id => findListing(id))
    .filter(Boolean);

  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:6px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">My Listings</h1>
      <div class="row">
        <a href="#/lost" class="btn lost small" data-link>+ Report lost pet</a>
        <a href="#/found" class="btn found small" data-link>+ Report found pet</a>
      </div>
    </div>
    <p class="subhead">Listings you've submitted. Manage status, edit details, print flyers.</p>

    ${myListings.length === 0 ? html`
      <div class="card" style="text-align:center; padding:40px 20px; margin-bottom:22px;">
        <div style="font-size:48px; margin-bottom:12px;">📋</div>
        <h3 style="margin:0 0 8px;">No listings yet</h3>
        <p class="muted" style="margin-bottom:18px;">When you report a lost or found pet, it shows up here so you can track matches and manage the listing.</p>
        <div class="row" style="justify-content:center;">
          <a href="#/lost" class="btn lost" data-link>Report a lost pet</a>
          <a href="#/found" class="btn found" data-link>Report a found pet</a>
        </div>
      </div>
    ` : myListings.map(l => myListingCard(l)).join("")}

    ${bookmarked.length > 0 ? html`
      <h2 style="font-size:20px; font-weight:700; margin:28px 0 12px;">Bookmarked listings</h2>
      <div class="list-grid">${bookmarked.map(listingCard).join("")}</div>
    ` : ""}

    <div class="card" style="margin-top:22px; background:var(--info-soft); border-color:#c0d4f0;">
      <h3 style="margin:0 0 8px; font-size:16px;">📤 Export your data</h3>
      <p class="muted" style="margin-bottom:12px; font-size:13.5px;">Download a copy of all your submitted listings and alert history as JSON.</p>
      <button class="btn small" id="export-btn">Download JSON</button>
    </div>
  `;
  bindLinks();

  $$(".my-listing-action").forEach(b => b.addEventListener("click", handleMyListingAction));
  $("#export-btn")?.addEventListener("click", exportData);
}

function myListingCard(l) {
  const isExpired = l.status === "expired";
  const isPaused = l.status === "paused";
  const isReunited = l.status === "reunited";
  const isActive = l.status === "active";

  const matchCount = computeMatches(l).length;
  const shares = Object.values(state.shareCounts?.[l.id] || {}).reduce((a, b) => a + b, 0);
  const renewalNeeded = !isExpired && !isReunited && Date.now() - new Date(l.posted) > 75 * 86400000;

  return html`
    <div class="my-listing-card">
      <div class="my-listing-photo" style="${l.photo ? `background-image:url('${escapeHtml(l.photo)}')` : ""}">
        <span class="tag ${l.status === "active" ? l.type : l.status}">${
          { active: l.type === "lost" ? "Lost" : "Found", paused: "Paused", reunited: "Reunited ✓", expired: "Expired" }[l.status]
        }</span>
      </div>
      <div class="my-listing-body">
        <div class="row" style="align-items:flex-start; gap:8px;">
          <div style="flex:1; min-width:0;">
            <h3 style="margin:0 0 2px; font-size:17px;">${speciesEmoji(l.species)} ${escapeHtml(l.name || (l.type === "found" ? "Found " + l.species : "Lost " + l.species))}</h3>
            <p class="muted">${escapeHtml(l.location || "")} · ${fmtDate(l.posted)}</p>
          </div>
        </div>

        ${renewalNeeded ? `<div class="callout" style="margin:10px 0 0; font-size:13px; padding:8px 12px;">⚠️ This listing expires in ${90 - Math.floor((Date.now() - new Date(l.posted)) / 86400000)} days. <button class="btn small primary" style="padding:4px 10px; font-size:12px;" data-action="renew" data-id="${l.id}">Renew now</button></div>` : ""}
        ${isExpired ? `<div class="callout danger" style="margin:10px 0 0; font-size:13px; padding:8px 12px;">⛔ This listing expired 90 days after it was posted and is no longer visible. <button class="btn small" style="padding:4px 10px; font-size:12px;" data-action="renew" data-id="${l.id}">Repost listing</button></div>` : ""}

        <div class="my-listing-stats">
          <span>🎯 ${matchCount} match${matchCount !== 1 ? "es" : ""}</span>
          <span>📤 ${shares} share${shares !== 1 ? "s" : ""}</span>
          <span>🔔 ${state.alerts.filter(a => a.listingId === l.id).length} alert${state.alerts.filter(a => a.listingId === l.id).length !== 1 ? "s" : ""}</span>
        </div>

        <div class="my-listing-actions">
          <a href="#/listing/${l.id}" class="btn small" data-link>View</a>
          ${isActive ? `<button class="btn small my-listing-action" data-action="pause" data-id="${l.id}">⏸ Pause</button>` : ""}
          ${isPaused ? `<button class="btn small my-listing-action" data-action="resume" data-id="${l.id}">▶ Resume</button>` : ""}
          ${(isActive || isPaused) ? `<button class="btn small found my-listing-action" data-action="reunite" data-id="${l.id}">🎉 Mark reunited</button>` : ""}
          <button class="btn small ghost" data-action="flyer" data-id="${l.id}" onclick="openFlyer(findListing('${l.id}'))">🖨️ Flyer</button>
          <a href="#/share-wizard/${l.id}" class="btn small" data-link>📣 Share wizard</a>
          ${isExpired || isReunited ? `<button class="btn small ghost my-listing-action" data-action="delete" data-id="${l.id}" style="color:var(--lost);">🗑 Delete</button>` : ""}
        </div>
      </div>
    </div>
  `;
}

function handleMyListingAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const listing = state.listings.find(l => l.id === id);
  if (!listing) return;

  if (action === "pause") { listing.status = "paused"; toast("Listing paused — it won't appear in search results until you resume it."); }
  if (action === "resume") { listing.status = "active"; toast("Listing resumed and visible again."); }
  if (action === "reunite") {
    listing.status = "reunited";
    listing.reunitedAt = new Date().toISOString();
    state.reunions++;
    toast("🎉 Marked as reunited! Alerts paused. Thank you for updating the community.");
    addCelebrationAlert(listing);
  }
  if (action === "renew") {
    listing.posted = new Date().toISOString();
    listing.status = "active";
    toast("Listing renewed — it'll stay visible for another 90 days.");
  }
  if (action === "delete") {
    if (!confirm("Remove this listing from your history? This can't be undone.")) return;
    state.listings = state.listings.filter(l => l.id !== id);
    toast("Listing removed.");
  }
  saveState();
  renderMyListings();
}

function addCelebrationAlert(listing) {
  state.alerts.unshift({
    id: "A-celebrate-" + listing.id,
    listingId: listing.id,
    matchId: listing.id,
    score: 1,
    when: new Date().toISOString(),
    message: `🎉 ${listing.name || listing.species} is home! Reunited ${fmtDate(listing.reunitedAt)}`,
    read: false,
    celebration: true,
  });
  saveState();
  refreshAlertsBadge();
}

function exportData() {
  const data = { listings: state.listings, alerts: state.alerts, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "pawtrail-export.json"; a.click();
  URL.revokeObjectURL(url);
  toast("Downloaded pawtrail-export.json");
}

// =========================================
// Share Wizard (PRD §4.5)
// =========================================
function renderShareWizard(id) {
  const l = findListing(id);
  if (!l) { navigate("#/listings"); return; }

  const title = l.name || (l.type === "found" ? `Found ${l.species}` : `Lost ${l.species}`);
  const url = `https://pawtrail.example/listing/${l.id}`;
  const defaultCopy = `${l.type === "lost" ? "🔴 LOST PET" : "🟢 FOUND PET"}: ${title} near ${l.location || "our neighborhood"}.${l.reward ? ` Reward $${l.reward}.` : ""} ${l.breed ? l.breed + ". " : ""}${l.features ? l.features.slice(0, 80) + "... " : ""}Please share! 🐾 ${url}`;

  const groupsHtml = LOCAL_FB_GROUPS.map(g => html`
    <div class="fb-group-row">
      <div class="fb-group-info">
        <div class="fb-group-name">${escapeHtml(g.name)}</div>
        <div class="fb-group-meta">${escapeHtml(g.members)} members ${g.active ? "· ✅ Active" : "· 🕒 Less active"}</div>
      </div>
      <div class="row" style="gap:6px; flex-shrink:0;">
        <button class="btn small" data-copy-group="${escapeHtml(g.name)}">Copy text</button>
        <a class="btn small primary" href="${escapeHtml(g.url)}" target="_blank" rel="noopener">Open →</a>
      </div>
    </div>
  `).join("");

  $("#app").innerHTML = html`
    <a href="#/listing/${l.id}" data-link class="muted" style="display:inline-block; margin-bottom:16px;">← Back to listing</a>

    <div class="section-row" style="margin-bottom:6px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Share wizard</h1>
      <span class="tag-inline ${l.type}">${speciesEmoji(l.species)} ${escapeHtml(title)}</span>
    </div>
    <p class="subhead">The first hour matters most. Share to as many channels as you can right now.</p>

    <!-- Step 1: Auto-generated copy -->
    <div class="wizard-step">
      <div class="wizard-step-label">Step 1 — Your share copy (auto-generated, editable)</div>
      <textarea id="share-copy" rows="4" style="width:100%; padding:12px; border-radius:var(--radius-sm); border:1.5px solid var(--line); font-family:inherit; font-size:14px; resize:vertical; outline:none;">${escapeHtml(defaultCopy)}</textarea>
      <div class="row" style="margin-top:8px; gap:6px;">
        <button class="btn small" id="copy-text-btn">📋 Copy to clipboard</button>
        <button class="btn small ghost" id="reset-copy-btn">↺ Reset to default</button>
      </div>
    </div>

    <!-- Step 2: Platform buttons -->
    <div class="wizard-step">
      <div class="wizard-step-label">Step 2 — Share to social media</div>
      <div class="platform-grid">
        ${[
          ["facebook", "📘", "Facebook", "var(--info-soft)", "var(--info)"],
          ["x", "𝕏", "X / Twitter", "#f0e8f8", "#7c3aed"],
          ["whatsapp", "💬", "WhatsApp", "var(--found-soft)", "var(--found)"],
          ["nextdoor", "🏘️", "Nextdoor", "#fff5e4", "#b87800"],
          ["sms", "✉️", "SMS / Text", "var(--bg)", "var(--ink-soft)"],
          ["instagram", "📷", "Instagram", "#fde9e7", "var(--lost)"],
          ["copy", "🔗", "Copy link", "var(--bg)", "var(--muted)"],
        ].map(([ch, icon, label, bg, color]) => html`
          <button class="platform-btn" data-share="${ch}" data-lid="${l.id}"
            style="background:${bg}; color:${color};">
            <span style="font-size:24px;">${icon}</span>
            <span>${label}</span>
          </button>
        `).join("")}
      </div>
      <div class="share-count-strip" id="share-counts">
        ${renderShareCounts(l.id)}
      </div>
    </div>

    <!-- Step 3: Share image -->
    <div class="wizard-step">
      <div class="wizard-step-label">Step 3 — Download share image (auto-generated)</div>
      <p class="muted" style="font-size:13px; margin-bottom:12px;">Save this image and attach it to your Facebook / Instagram posts — images get far more reach than text-only posts.</p>
      <div id="share-card-wrap" style="text-align:center;">
        <div class="share-card-loading">⏳ Generating share card…</div>
      </div>
    </div>

    <!-- Step 4: Local Facebook groups -->
    <div class="wizard-step">
      <div class="wizard-step-label">Step 4 — Post to local Facebook lost-pet groups</div>
      <p class="muted" style="font-size:13px; margin-bottom:14px;">These groups are where your neighbors already look. Post your listing text in each. One-click to open each group, then paste the copy from Step 1.</p>
      <div class="fb-groups-list">${groupsHtml}</div>
    </div>

    <!-- Step 5: Print flyer -->
    <div class="wizard-step">
      <div class="wizard-step-label">Step 5 — Physical flyers (underestimated every time)</div>
      <p class="muted" style="font-size:13px; margin-bottom:12px;">Delivery drivers, mail carriers, and neighbors who don't use social media. Neon paper, every intersection within 1 mile.</p>
      <button class="btn primary" id="wizard-flyer-btn">🖨️ Print flyer with QR code</button>
    </div>
  `;

  bindLinks();

  // Copy text
  const textarea = () => $("#share-copy");
  const defaultText = defaultCopy;
  $("#copy-text-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(textarea().value || "");
    toast("Share copy copied to clipboard!");
  });
  $("#reset-copy-btn").addEventListener("click", () => { textarea().value = defaultText; });

  // Platform share buttons
  $$(".platform-btn[data-share]").forEach(b => b.addEventListener("click", () => {
    const ch = b.dataset.share;
    const lid = b.dataset.lid;
    const text = textarea().value;
    doShareWizard(ch, l, text);
    incrementShare(lid, ch);
    $("#share-counts").innerHTML = renderShareCounts(lid);
  }));

  // Copy group text buttons
  $$("[data-copy-group]").forEach(b => b.addEventListener("click", () => {
    navigator.clipboard?.writeText(textarea().value || "");
    toast(`Text copied for "${b.dataset.copyGroup}". Open the group and paste!`);
  }));

  // Flyer
  $("#wizard-flyer-btn").addEventListener("click", () => openFlyer(l));

  // Generate share card
  generateShareCard(l, dataUrl => {
    const wrap = $("#share-card-wrap");
    if (!wrap) return;
    wrap.innerHTML = `
      <img src="${dataUrl}" alt="Share card" style="max-width:100%; border-radius:var(--radius-sm); border:1.5px solid var(--line); margin-bottom:10px;" />
      <br/><a href="${dataUrl}" download="pawtrail-share-${l.id}.png" class="btn small primary">⬇ Download share image</a>
    `;
  });
}

function renderShareCounts(listingId) {
  const counts = state.shareCounts?.[listingId] || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return `<span class="muted" style="font-size:12px;">No shares tracked yet — every share matters!</span>`;
  return Object.entries(counts).map(([ch, n]) =>
    `<span class="share-count-badge">${ch} ×${n}</span>`
  ).join("") + `<span class="share-count-badge" style="background:var(--found-soft);color:var(--found);">Total: ${total}</span>`;
}

function doShareWizard(channel, l, customText) {
  const url = `https://pawtrail.example/listing/${l.id}`;
  const t = encodeURIComponent(customText || "");
  const u = encodeURIComponent(url);
  const targets = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`,
    x: `https://x.com/intent/tweet?text=${t}`,
    whatsapp: `https://wa.me/?text=${t}`,
    sms: `sms:?body=${t}`,
    nextdoor: null,
    instagram: null,
  };
  if (channel === "copy") { navigator.clipboard?.writeText(url); toast("Link copied!"); return; }
  if (channel === "instagram") { toast("Copy the text and image, then paste into Instagram."); return; }
  if (channel === "nextdoor") { toast("Opening Nextdoor — paste your share text there."); window.open("https://nextdoor.com", "_blank", "noopener"); return; }
  if (targets[channel]) window.open(targets[channel], "_blank", "noopener,width=620,height=500");
}

// =========================================
// Shelter Portal (PRD §4.10)
// =========================================
function renderShelterPortal() {
  const shelterIntakes = allListings().filter(l => l.verifiedSource && l.shelterId);

  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:6px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Shelter Portal</h1>
      <span class="tag-inline" style="background:var(--info-soft);color:var(--info);">v1.0 — Read-only at launch</span>
    </div>
    <p class="subhead">Partner shelter and vet intake records — matched automatically against Lost listings. Shelter workers do nothing extra.</p>

    <div class="card" style="background:var(--info-soft); border-color:#c0d4f0; margin-bottom:22px;">
      <h3 style="margin:0 0 6px; font-size:16px;">ℹ️ How shelter integration works</h3>
      <p style="font-size:14px; margin:0; color:var(--ink-soft);">PawTrail pulls intake records from PetPoint and Shelterluv (the two largest shelter management systems). Shelters that don't use these systems can submit intakes manually using the form below. All intake records appear in the matching pipeline with a verified-source badge.</p>
    </div>

    <!-- Partner shelters -->
    <h2 style="font-size:20px; font-weight:700; margin-bottom:12px;">Partner shelters & clinics</h2>
    <div class="shelter-grid">
      ${SHELTER_NETWORK.map(s => html`
        <div class="shelter-card">
          <div class="shelter-type-badge ${s.type}">${{ vet:"🏥 Vet", shelter:"🏠 Shelter", rescue:"🤝 Rescue", emergency:"🚨 Emergency" }[s.type]}</div>
          <h3 style="margin:8px 0 4px; font-size:16px;">${escapeHtml(s.name)}</h3>
          <p class="muted" style="font-size:13px; margin:0 0 8px;">${escapeHtml(s.address)}</p>
          <div class="shelter-meta">
            <span>${escapeHtml(s.hours)}</span>
            ${s.chipScan ? `<span class="chip-badge">✓ Chip scan</span>` : ""}
            ${s.holdDays ? `<span class="hold-badge">Hold: ${s.holdDays} days</span>` : ""}
          </div>
          <div class="row" style="margin-top:10px; gap:6px;">
            ${s.phone ? `<a href="tel:${s.phone}" class="btn small">${escapeHtml(s.phone)}</a>` : ""}
            <a href="#/listings?shelter=${s.id}" class="btn small primary" data-link>View intakes</a>
          </div>
        </div>
      `).join("")}
    </div>

    <!-- Current shelter intakes in system -->
    ${shelterIntakes.length ? html`
      <h2 style="font-size:20px; font-weight:700; margin:28px 0 12px;">Current verified intakes</h2>
      <div class="list-grid">${shelterIntakes.map(l => listingCard(l)).join("")}</div>
    ` : ""}

    <!-- Manual intake form -->
    <h2 style="font-size:20px; font-weight:700; margin:28px 0 12px;">Submit a manual intake</h2>
    <p class="subhead">For shelters not on PetPoint or Shelterluv. Four fields. Submit takes under a minute.</p>
    <div class="card" style="max-width:560px;">
      <form id="shelter-intake-form">
        <div class="field">
          <label>Species *</label>
          <div class="species-row" id="shelter-species-row">
            ${["dog","cat","rabbit","bird","fish","other"].map(s => `
              <button type="button" class="species-pick" data-species="${s}">${speciesEmoji(s)} ${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <label>Photo *</label>
          <label class="photo-input" for="shelter-photo">
            <div style="font-size:24px;">📷</div>
            <div style="font-weight:600; margin-top:4px;">Upload intake photo</div>
            <input id="shelter-photo" type="file" accept="image/*" />
          </label>
          <div id="shelter-photo-preview" style="margin-top:8px;"></div>
        </div>
        <div class="row" style="gap:10px; align-items:flex-start;">
          <div class="field" style="flex:1; min-width:120px;">
            <label>Intake date *</label>
            <input type="date" id="shelter-date" value="${todayISO()}" required />
          </div>
          <div class="field" style="flex:1; min-width:100px;">
            <label>ZIP *</label>
            <input type="text" id="shelter-zip" maxlength="5" placeholder="97214" required />
          </div>
        </div>
        <div class="field">
          <label>Shelter / clinic name *</label>
          <input type="text" id="shelter-name" placeholder="e.g. Belmont Veterinary Clinic" required />
        </div>
        <div class="field">
          <label>Animal description (optional but helpful)</label>
          <textarea id="shelter-desc" placeholder="Breed, color, approximate age, distinguishing marks, condition…"></textarea>
        </div>
        <div class="field">
          <label>Stray hold deadline (optional)</label>
          <input type="date" id="shelter-deadline" />
          <div class="hint">If left blank, no hold countdown will be shown. Most holds are 3–7 days.</div>
        </div>
        <div class="row" style="gap:8px; margin-top:4px;">
          <button type="submit" class="btn primary">Submit intake</button>
          <label style="display:flex; align-items:center; gap:6px; font-size:14px; cursor:pointer;">
            <input type="checkbox" id="shelter-csv-check" /> Or upload a CSV instead
          </label>
        </div>
        <div id="csv-upload-area" hidden style="margin-top:12px;">
          <label class="photo-input" style="font-size:14px;" for="csv-file">
            📄 Upload CSV file (columns: species, photo_url, intake_date, zip, description)
            <input id="csv-file" type="file" accept=".csv" style="display:none;" />
          </label>
          <div class="hint">Max 500 rows per upload. Rows are matched against active Lost listings immediately.</div>
        </div>
      </form>
    </div>

    <!-- Microchip registry links -->
    <h2 style="font-size:20px; font-weight:700; margin:28px 0 12px;">Microchip registry quick links</h2>
    <p class="subhead">Scan every intake for a chip. If found, look up ownership in these registries — most are free.</p>
    <div class="chip-registry-grid">
      ${CHIP_REGISTRIES.map(r => html`
        <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700; font-size:15px;">${escapeHtml(r.name)}</div>
            <div class="muted" style="font-size:12.5px;">${escapeHtml(r.note)}${r.phone ? " · " + r.phone : ""}</div>
          </div>
          <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="btn small primary">Look up chip →</a>
        </div>
      `).join("")}
    </div>
  `;

  bindLinks();
  initShelterIntakeForm();
}

function initShelterIntakeForm() {
  let species = null;
  let photoData = null;

  $$("#shelter-species-row .species-pick").forEach(b => {
    b.addEventListener("click", () => {
      $$("#shelter-species-row .species-pick").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      let selected = b.dataset.species;
      if (selected === "other") {
        const custom = prompt("What kind of animal is it? (e.g., Hamster, Turtle, Snake)");
        if (custom) {
          selected = custom.toLowerCase().trim();
          b.textContent = speciesEmoji(selected) + " " + custom;
        }
      }
      species = selected;
    });
  });

  $("#shelter-photo")?.addEventListener("change", e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      photoData = ev.target.result;
      const p = $("#shelter-photo-preview");
      if (p) p.innerHTML = `<img src="${photoData}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1.5px solid var(--line);" />`;
    };
    reader.readAsDataURL(f);
  });

  $("#shelter-csv-check")?.addEventListener("change", e => {
    const area = $("#csv-upload-area");
    if (area) area.hidden = !e.target.checked;
  });

  $("#shelter-intake-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!species) { toast("Please pick a species."); return; }
    const shelterName = document.getElementById("shelter-date") ? document.getElementById("shelter-name").value.trim() : "";
    if (!shelterName) { toast("Please enter the shelter or clinic name."); return; }
    const validation = validateListingData({
      location: shelterName + " intake",
      zip: document.getElementById("shelter-zip").value,
      contact: "shelter",
      features: document.getElementById("shelter-desc").value,
    });
    if (!validation.ok) {
      toast(validation.message, validation.banned ? 5200 : 4200);
      return;
    }
    const id = "SH-U-" + Date.now().toString(36).toUpperCase();
    const listing = {
      id, type: "found", species,
      photo: photoData || (PHOTOS[species] || PHOTOS.other)[0],
      location: shelterName + " intake",
      zip: document.getElementById("shelter-zip").value,
      distance: 0,
      when: document.getElementById("shelter-date").value,
      contact: "shelter",
      poster: { name: shelterName, initials: shelterName.slice(0, 2).toUpperCase(), neighborhood: "Local" },
      features: document.getElementById("shelter-desc").value,
      custody: "shelter", condition: "healthy",
      status: "active", posted: new Date().toISOString(),
      verifiedSource: true,
      stayDeadline: document.getElementById("shelter-deadline").value
        ? new Date(document.getElementById("shelter-deadline").value).toISOString()
        : null,
    };
    const policy = await canSubmitListing(listing);
    if (!policy.allowed) {
      toast(policy.reason || "Intake blocked by automated moderation.");
      return;
    }
    const matches = computeMatches(listing).slice(0, 3);
    matches.forEach(m => {
      state.alerts.unshift({ id: "A-"+Date.now()+"-"+m.listing.id, listingId: listing.id, matchId: m.listing.id, score: m.score, when: new Date().toISOString(), message: `Shelter intake match ${Math.round(m.score*100)}% — ${m.reasons.slice(0,2).join(", ")}`, read: false });
    });
    await persistListing(listing, "shelter");
    saveState();
    refreshAlertsBadge();
    toast(`Intake recorded${matches.length ? " — " + matches.length + " possible match" + (matches.length > 1 ? "es" : "") + " found!" : "."}`);
    navigate("#/listing/" + id);
  });
}

// =========================================
// Notification Settings (PRD §4.7)
// =========================================
function renderSettings() {
  const s = state.settings;

  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:6px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Settings</h1>
    </div>
    <div style="max-width:580px;">

      <div class="settings-section">
        <h2 class="settings-heading">Alert preferences</h2>
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info">
              <strong>Email alerts</strong>
              <p>High and medium-confidence matches. Always on by default.</p>
            </div>
            <label class="toggle"><input type="checkbox" id="set-email" ${s.email ? "checked" : ""}/><span></span></label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <strong>SMS alerts</strong>
              <p>High-confidence matches only. Opt-in. Max 1 SMS per hour to prevent fatigue.</p>
            </div>
            <label class="toggle"><input type="checkbox" id="set-sms" ${s.sms ? "checked" : ""}/><span></span></label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <strong>Alert frequency</strong>
              <p>Instant sends matches immediately. Digest bundles low-confidence matches daily.</p>
            </div>
            <select id="set-freq" style="padding:7px 11px; border-radius:var(--radius-sm); border:1.5px solid var(--line); font-family:inherit; font-size:14px;">
              <option value="instant" ${s.freq === "instant" ? "selected" : ""}>Instant (high + medium)</option>
              <option value="digest" ${s.freq === "digest" ? "selected" : ""}>Daily digest (all)</option>
              <option value="high-only" ${s.freq === "high-only" ? "selected" : ""}>High-confidence only</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <strong>Pause all alerts</strong>
              <p>Turn off all match notifications temporarily. Useful after a reunion.</p>
            </div>
            <label class="toggle"><input type="checkbox" id="set-paused" ${s.paused ? "checked" : ""}/><span></span></label>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-heading">Appearance</h2>
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info">
              <strong>Dark mode</strong>
              <p>Easier on the eyes at night when you're searching.</p>
            </div>
            <label class="toggle"><input type="checkbox" id="set-dark" ${s.darkMode ? "checked" : ""}/><span></span></label>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-heading">Privacy</h2>
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info">
              <strong>Contact relay</strong>
              <p>All messages are routed through PawTrail's anonymous relay. Your email and phone are never exposed publicly.</p>
            </div>
            <span class="tag-inline found">Always on</span>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <strong>Scam detection</strong>
              <p>Messages mentioning payment, gift cards, or wire transfers are automatically flagged and quarantined.</p>
            </div>
            <span class="tag-inline found">Always on</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-heading">Data & account</h2>
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info">
              <strong>Export my data</strong>
              <p>Download your listings and alerts as JSON.</p>
            </div>
            <button class="btn small" id="settings-export">Download</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <strong>Clear local data</strong>
              <p>Remove all your listings and settings from this browser.</p>
            </div>
            <button class="btn small ghost" id="settings-clear" style="color:var(--lost);">Clear</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-heading">Crisis support</h2>
        <div class="settings-card" style="background:var(--lost-soft); border-color:#f0c4c0;">
          <p style="font-size:14px; margin-bottom:12px;">Losing a pet is real grief. If you're distressed and need to talk to someone, PawTrail volunteers call back within 1 hour (9am–9pm local).</p>
          <button class="btn primary" id="crisis-btn">Request a callback</button>
        </div>
      </div>

      <button class="btn primary block" id="save-settings" style="margin-top:8px;">Save settings</button>
    </div>
  `;

  bindLinks();

  $("#save-settings").addEventListener("click", () => {
    state.settings.email = document.getElementById("set-email").checked;
    state.settings.sms = document.getElementById("set-sms").checked;
    state.settings.freq = document.getElementById("set-freq").value;
    state.settings.paused = document.getElementById("set-paused").checked;
    state.settings.darkMode = document.getElementById("set-dark").checked;
    applyDarkMode();
    const btn = $("#darkmode-btn");
    if (btn) btn.textContent = state.settings.darkMode ? "☀️" : "🌙";
    saveState();
    toast("Settings saved.");
  });

  $("#settings-export").addEventListener("click", exportData);
  $("#settings-clear").addEventListener("click", () => {
    if (!confirm("Clear all local data? Your submitted listings and alerts will be removed from this browser.")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
  $("#crisis-btn").addEventListener("click", openCrisisModal);
}

function renderAdmin() {
  const userListings = state.listings.filter(l => l.poster?.name === "You" || l.contact);
  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:6px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Admin</h1>
    </div>
    <p class="subhead">Moderate abusive submitters without removing legitimate lost-pet reports. IP-based limits are enforced by the Supabase Edge Function when configured.</p>

    <div class="settings-card" style="margin-bottom:16px;">
      <div class="setting-row">
        <div class="setting-info">
          <strong>Automated listing throttle</strong>
          <p>Blocks a network after 10 listings in 30 days and records a reviewable moderation event.</p>
        </div>
        <span class="tag-inline ${window.PawTrailSupabase?.ready ? "found" : ""}">${window.PawTrailSupabase?.ready ? "Supabase active" : "Local fallback"}</span>
      </div>
    </div>

    <div class="list-grid">
      ${userListings.length ? userListings.map(l => html`
        <div class="card">
          <div class="row" style="justify-content:space-between; gap:10px; align-items:flex-start;">
            <div style="min-width:0;">
              <strong>${speciesEmoji(l.species)} ${escapeHtml(l.name || l.species || "Pet listing")}</strong>
              <p class="muted" style="font-size:13px;">${escapeHtml(l.contact || "No public contact")} Â· ${escapeHtml(l.zip || "")} Â· ${fmtDate(l.posted)}</p>
            </div>
            <span class="tag-inline ${l.status === "suspended" ? "lost" : "found"}">${escapeHtml(l.status || "active")}</span>
          </div>
          <div class="row" style="margin-top:12px;">
            <button class="btn small ghost admin-action" data-action="suspend" data-subject="${escapeHtml(l.contact || l.id)}">Suspend</button>
            <button class="btn small ghost admin-action" data-action="ban" data-subject="${escapeHtml(l.contact || l.id)}" style="color:var(--lost);">Ban</button>
            <button class="btn small admin-action" data-action="clear" data-subject="${escapeHtml(l.contact || l.id)}">Clear</button>
          </div>
        </div>
      `).join("") : `<div class="empty"><div class="emoji">Admin</div>No user-submitted listings to review yet.</div>`}
    </div>
  `;

  $$(".admin-action").forEach(btn => btn.addEventListener("click", async () => {
    const action = btn.dataset.action;
    const subject = btn.dataset.subject;
    const reason = action === "clear" ? "Manual review cleared" : prompt(`Reason for ${action}?`, "Spam or abusive listing pattern");
    if (reason === null) return;
    try {
      await window.PawTrailSupabase?.moderateUser(subject, action, reason);
      toast(`Admin action recorded: ${action}.`);
    } catch {
      toast("Admin action saved locally only. Configure Supabase to enforce bans across devices.");
    }
  }));
}

// =========================================
// Crisis callback form (PRD §4.8)
// =========================================
function openCrisisModal() {
  const m = openModal(html`
    <h3>🆘 Request a callback</h3>
    <p class="muted" style="font-size:13.5px; margin-top:0;">A PawTrail volunteer will call you back within 1 hour during staffed hours (9am–9pm local). For an immediate crisis, please also call:</p>
    <ul style="font-size:14px; padding-left:18px; margin:8px 0 14px;">
      <li><strong>ASPCA Pet Loss Hotline:</strong> 1-877-474-3310</li>
      <li><strong>Tufts Pet Loss Support:</strong> 1-508-839-7966</li>
    </ul>
    <div class="field">
      <label>Your phone number</label>
      <input type="tel" id="crisis-phone" placeholder="(503) 555-0100" style="width:100%; padding:11px 13px; border-radius:var(--radius-sm); border:1.5px solid var(--line); font-size:15px; font-family:inherit; outline:none;" />
    </div>
    <div class="field">
      <label>What's happening? (optional — helps our volunteer prepare)</label>
      <textarea id="crisis-note" placeholder="I've been searching for 4 days and I'm falling apart…" style="width:100%; padding:11px 13px; border-radius:var(--radius-sm); border:1.5px solid var(--line); font-size:14px; font-family:inherit; resize:vertical; min-height:80px; outline:none;"></textarea>
    </div>
    <div class="callout info" style="font-size:13px;">You don't have to be in a crisis to use this. Searching is exhausting. We're here.</div>
    <div class="actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="crisis-submit">Request callback</button>
    </div>
  `);
  m.querySelector("[data-close]").addEventListener("click", () => m.remove());
  m.querySelector("#crisis-submit").addEventListener("click", () => {
    const phone = m.querySelector("#crisis-phone").value.trim();
    if (!phone) { toast("Please enter your phone number."); return; }
    toast("Callback request received. A volunteer will call within 1 hour. 🧡");
    m.remove();
  });
}

// =========================================
// Search (PRD implicit — form completion)
// =========================================
function renderSearchPage() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const q = params.get("q") || "";
  const results = searchListings(q);

  $("#app").innerHTML = html`
    <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em; margin-bottom:6px;">Search</h1>
    <form id="search-page-form" class="zipbar" style="max-width:560px; margin:0 0 16px;">
      <input type="text" id="search-page-q" value="${escapeHtml(q)}" placeholder="Pet name, breed, neighborhood, ZIP…" style="flex:1;" />
      <button class="btn primary" type="submit">Search</button>
    </form>
    ${q ? `<p class="subhead">${results.length} result${results.length !== 1 ? "s" : ""} for "${escapeHtml(q)}"</p>` : ""}
    ${q && results.length === 0 ? `<div class="empty"><div class="emoji">🔍</div>No listings match "${escapeHtml(q)}". Try a shorter term or <a href="#/listings" data-link>browse all</a>.</div>` : ""}
    <div class="list-grid">${results.map(listingCard).join("")}</div>
  `;
  bindLinks();

  $("#search-page-form").addEventListener("submit", e => {
    e.preventDefault();
    const v = document.getElementById("search-page-q").value.trim();
    navigate(`#/search?q=${encodeURIComponent(v)}`);
  });
}

function searchListings(q) {
  if (!q) return [];
  const lq = q.toLowerCase();
  return allListings().filter(l => {
    const hay = [l.name, l.breed, l.color, l.location, l.zip, l.species, l.features,
      l.poster?.name, l.poster?.neighborhood].join(" ").toLowerCase();
    return hay.includes(lq);
  });
}

// =========================================
// Bookmarks page
// =========================================
function renderBookmarks() {
  const items = (state.bookmarks || []).map(id => findListing(id)).filter(Boolean);
  $("#app").innerHTML = html`
    <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em; margin-bottom:6px;">Bookmarked listings</h1>
    <p class="subhead">Tap the bookmark icon on any listing to save it here.</p>
    ${items.length === 0 ? `<div class="empty"><div class="emoji">🔖</div>No bookmarks yet. Browse listings and tap ★ to save them here.</div>` : ""}
    <div class="list-grid">${items.map(listingCard).join("")}</div>
  `;
  bindLinks();
}

// =========================================
// Search overlay (inline/quick)
// =========================================
function initSearchOverlay() {
  const overlay = document.getElementById("search-overlay");
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  if (!overlay) return;

  const openSearch = () => {
    overlay.hidden = false;
    input?.focus();
  };
  const closeSearch = () => {
    overlay.hidden = true;
    if (input) input.value = "";
    if (results) results.innerHTML = "";
  };

  document.getElementById("search-btn")?.addEventListener("click", () => {
    openSearch();
  });
  document.getElementById("search-close")?.addEventListener("click", closeSearch);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeSearch();
  });
  results?.addEventListener("click", e => {
    const link = e.target.closest("a[data-link]");
    if (!link) return;
    e.preventDefault();
    closeSearch();
    navigate(link.getAttribute("href"));
  });

  document.addEventListener("keydown", e => {
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      openSearch();
    }
    if (e.key === "Escape" && !overlay.hidden) closeSearch();
  });

  input?.addEventListener("input", () => {
    const q = input.value.trim();
    if (!results) return;
    if (q.length < 2) { results.innerHTML = ""; return; }
    const found = searchListings(q).slice(0, 8);
    if (!found.length) {
      results.innerHTML = `<div class="empty" style="padding:20px;">No results for "${escapeHtml(q)}"</div>`;
      return;
    }
    results.innerHTML = found.map(l => html`
      <a class="search-result-row" href="#/listing/${l.id}" data-link>
        <div class="search-result-photo" style="${l.photo ? `background-image:url('${escapeHtml(l.photo)}')` : ""}"></div>
        <div class="search-result-body">
          <strong>${speciesEmoji(l.species)} ${escapeHtml(l.name || (l.type==="found"?"Found "+l.species:"Lost "+l.species))}</strong>
          <div class="muted" style="font-size:12px;">${escapeHtml([l.breed, l.location].filter(Boolean).join(" · "))}</div>
        </div>
        <span class="tag-inline ${l.status==="reunited"?"reunited":l.type}">${l.status==="reunited"?"Reunited":l.type==="lost"?"Lost":"Found"}</span>
      </a>
    `).join("");
    $$(".search-result-row[data-link]").forEach(a => {
      a._bound = false;
      a.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); closeSearch(); navigate(a.getAttribute("href")); });
    });
    // "See all" link
    results.innerHTML += `<a href="#/search?q=${encodeURIComponent(q)}" class="btn ghost block" style="margin:8px 12px; text-align:center;" data-link>See all results for "${escapeHtml(q)}" →</a>`;
  });
}

// =========================================
// PWA Install prompt (PRD §2 "low-friction")
// =========================================
function initPWA() {
  let installTimer = null;

  // Register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  const showInstallBannerLater = () => {
    clearTimeout(installTimer);
    installTimer = setTimeout(() => {
      if (state.pwaInstallDismissed || !state._installPrompt) return;
      const banner = document.getElementById("install-banner");
      if (banner) banner.hidden = false;
      updateBodyPad();
    }, 5 * 60 * 1000);
  };

  // Capture install prompt
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    state._installPrompt = e;
    if (!state.pwaInstallDismissed) showInstallBannerLater();
  });

  document.getElementById("install-yes")?.addEventListener("click", async () => {
    if (state._installPrompt) {
      state._installPrompt.prompt();
      const { outcome } = await state._installPrompt.userChoice;
      if (outcome === "accepted") toast("PawTrail installed! Find it on your home screen.");
    }
    document.getElementById("install-banner").hidden = true;
    updateBodyPad();
  });

  document.getElementById("install-no")?.addEventListener("click", () => {
    document.getElementById("install-banner").hidden = true;
    state.pwaInstallDismissed = true;
    saveState();
    updateBodyPad();
  });

  window.addEventListener("appinstalled", () => {
    toast("PawTrail installed successfully! 🐾");
    document.getElementById("install-banner").hidden = true;
    updateBodyPad();
  });
}

// =========================================
// Stray hold countdown display
// =========================================
function strayHoldBadge(listing) {
  if (!listing.stayDeadline) return "";
  const msLeft = new Date(listing.stayDeadline) - Date.now();
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft < 0) return `<span class="tag-inline" style="background:#fde9e7;color:#d93a2e;">⛔ Hold expired</span>`;
  if (daysLeft === 0) return `<span class="tag-inline" style="background:#fde9e7;color:#d93a2e; animation:pulse 1s infinite;">🚨 Hold expires TODAY</span>`;
  if (daysLeft <= 2) return `<span class="tag-inline" style="background:#fff8e1;color:#b87800;">⚠️ ${daysLeft}d until hold expires</span>`;
  return `<span class="tag-inline" style="background:var(--found-soft);color:var(--found);">✓ ${daysLeft}d hold remaining</span>`;
}

// =========================================
// Dark mode toggle button in init
// =========================================
function initDarkModeBtn() {
  const btn = document.getElementById("darkmode-btn");
  if (btn) {
    btn.textContent = state.settings?.darkMode ? "☀️" : "🌙";
    btn.addEventListener("click", toggleDarkMode);
  }
}

// =========================================
// Keyboard shortcut overlay ("?")
// =========================================
function initKeyboardShortcuts() {
  document.addEventListener("keydown", e => {
    if (e.key === "?" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) {
      showShortcutsModal();
    }
  });
}

function showShortcutsModal() {
  const m = openModal(html`
    <h3>⌨️ Keyboard shortcuts</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      ${[
        ["/", "Open search"],
        ["?", "Show this panel"],
        ["Esc", "Close drawers / search"],
        ["G then L", "Go to Listings"],
        ["G then C", "Go to Community"],
        ["G then A", "Go to Advice"],
      ].map(([key, action]) => `
        <tr style="border-bottom:1px solid var(--line);">
          <td style="padding:8px 0;"><kbd style="background:var(--bg);border:1.5px solid var(--line);border-radius:5px;padding:2px 8px;font-family:monospace;">${escapeHtml(key)}</kbd></td>
          <td style="padding:8px 0 8px 12px; color:var(--ink-soft);">${escapeHtml(action)}</td>
        </tr>
      `).join("")}
    </table>
    <div class="actions"><button class="btn primary" data-close>Got it</button></div>
  `);
  m.querySelector("[data-close]").addEventListener("click", () => m.remove());
}

// =========================================
// "G + key" navigation shortcuts
// =========================================
function initGShortcuts() {
  let gPressed = false;
  let gTimer = null;
  document.addEventListener("keydown", e => {
    if (["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) return;
    if (e.key === "g" || e.key === "G") { gPressed = true; clearTimeout(gTimer); gTimer = setTimeout(() => { gPressed = false; }, 1500); return; }
    if (gPressed) {
      const map = { l: "#/listings", c: "#/community", a: "#/advice", t: "#/tips", m: "#/my-listings", h: "#/help" };
      if (map[e.key]) { navigate(map[e.key]); gPressed = false; }
    }
  });
}

// =========================================
// Listing detail bookmark + stay badge patches
// (monkey-patch renderListingDetail to add features)
// =========================================
const _origDetail = renderListingDetail;
window.renderListingDetail = async function(id) {
  await _origDetail(id);
  // After render, patch in bookmark + stray hold badge
  const l = findListing(id);
  if (!l) return;

  // Bookmark button — inject after the detail heading
  const h1 = $("#app h1");
  if (h1 && l) {
    const bm = document.createElement("button");
    bm.className = "btn small ghost";
    bm.style.marginLeft = "8px";
    bm.textContent = isBookmarked(id) ? "★ Bookmarked" : "☆ Bookmark";
    bm.addEventListener("click", () => {
      const added = toggleBookmark(id);
      bm.textContent = added ? "★ Bookmarked" : "☆ Bookmark";
      toast(added ? "Listing bookmarked! Find it in My Listings." : "Bookmark removed.");
    });
    h1.appendChild(bm);
  }

  // Stray hold badge — inject under the tag row if it's a shelter intake
  const badge = strayHoldBadge(l);
  if (badge && l.verifiedSource) {
    const tagRow = $("#app [class*='tag-inline']")?.parentElement;
    if (tagRow) tagRow.insertAdjacentHTML("beforeend", " " + badge);
  }
};

// =========================================
// features.js init — called after app.js init
// =========================================
function initFeatures() {
  initDarkModeBtn();
  initSearchOverlay();
  initPWA();
  initKeyboardShortcuts();
  initGShortcuts();
}

// Hook into DOMContentLoaded (app.js already has one; features.js adds its own)
document.addEventListener("DOMContentLoaded", initFeatures);
