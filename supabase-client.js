/* PawTrail Supabase bridge.
   Configure in index.html or localStorage:
   window.PAWTRAIL_SUPABASE = { url: "...", anonKey: "..." }
*/

(function () {
  const cfg = window.PAWTRAIL_SUPABASE || {
    url: localStorage.getItem("pawtrail.supabase.url") || "",
    anonKey: localStorage.getItem("pawtrail.supabase.anonKey") || "",
  };

  const ready = Boolean(cfg.url && cfg.anonKey);

  async function request(path, options = {}) {
    if (!ready) throw new Error("Supabase is not configured.");
    const token = localStorage.getItem("pawtrail.auth.token");
    const res = await fetch(`${cfg.url}${path}`, {
      ...options,
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${token || cfg.anonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `Supabase request failed: ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function checkListingPolicy(listing) {
    if (!ready) return { allowed: true, mode: "local" };
    try {
      const result = await request("/functions/v1/listing-guard", {
        method: "POST",
        body: JSON.stringify({
          contact: listing.contact || "",
          listingId: listing.id,
          kind: listing.type,
        }),
      });
      return result || { allowed: true };
    } catch (err) {
      console.warn("Listing policy check failed; using local fallback.", err);
      return { allowed: true, mode: "fallback" };
    }
  }

  async function insertListing(listing, source = "public") {
    if (!ready) return { stored: false, mode: "local" };
    const payload = {
      client_id: listing.id,
      source,
      type: listing.type,
      species: listing.species,
      name: listing.name,
      breed: listing.breed,
      color: listing.color,
      size: listing.size,
      age: listing.age,
      photo: listing.photo,
      photos: listing.photos || [],
      location: listing.location,
      zip: listing.zip,
      happened_at: listing.when,
      contact: listing.contact,
      poster: listing.poster || {},
      features: listing.features,
      reward: listing.reward,
      condition: listing.condition,
      custody: listing.custody,
      status: listing.status || "active",
      posted_at: listing.posted || new Date().toISOString(),
      verified_source: Boolean(listing.verifiedSource),
      stay_deadline: listing.stayDeadline || null,
      raw: listing,
    };
    return request("/rest/v1/listings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function fetchListings() {
    if (!ready) return [];
    const rows = await request("/rest/v1/listings?select=*&status=eq.active&order=posted_at.desc&limit=200");
    return (rows || []).map(row => ({
      ...(row.raw || {}),
      id: row.client_id || row.id,
      type: row.type,
      species: row.species,
      name: row.name,
      breed: row.breed,
      color: row.color,
      size: row.size,
      age: row.age,
      photo: row.photo,
      photos: row.photos || [],
      location: row.location,
      zip: row.zip,
      when: row.happened_at,
      contact: row.contact,
      poster: row.poster || {},
      features: row.features,
      reward: row.reward,
      condition: row.condition,
      custody: row.custody,
      status: row.status,
      posted: row.posted_at,
      verifiedSource: row.verified_source,
      stayDeadline: row.stay_deadline,
    }));
  }

  // Calls the fetch-global-listings Edge Function which proxies Petfinder / shelter APIs
  async function fetchGlobalListings() {
    if (!ready) return [];
    try {
      const rows = await request("/functions/v1/fetch-global-listings", { method: "GET" });
      return (rows || []).map(row => ({
        id: "SB-GLOBAL-" + (row.id || row.client_id),
        source: "global",
        type: row.type || "found",
        species: row.species,
        name: row.name,
        breed: row.breed,
        color: row.color,
        size: row.size,
        age: row.age,
        photo: row.photo,
        photos: row.photos || [],
        location: row.location,
        zip: row.zip,
        when: row.happened_at || row.when,
        contact: row.contact || "Via shelter network",
        poster: row.poster || { name: "Shelter Network", initials: "SN", neighborhood: "" },
        features: row.features,
        reward: row.reward,
        condition: row.condition,
        custody: row.custody,
        status: "active",
        posted: row.posted_at || row.posted || new Date().toISOString(),
        verifiedSource: true,
        stayDeadline: row.stay_deadline || null,
        petfinderUrl: row.petfinder_url || null,
      }));
    } catch (err) {
      console.warn("fetchGlobalListings failed.", err);
      return [];
    }
  }

  async function moderateUser(subject, action, reason) {
    if (!ready) return { stored: false, mode: "local" };
    return request("/rest/v1/moderation_actions", {
      method: "POST",
      body: JSON.stringify({ subject, action, reason }),
    });
  }

  async function signIn(email, password) {
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Invalid email or password.");
    const data = await res.json();
    localStorage.setItem("pawtrail.auth.token", data.access_token);
    return data.user;
  }

  async function signUp(email, password) {
    const res = await fetch(`${cfg.url}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.msg || err.message || "Signup failed.");
    }
    return res.json();
  }

  window.PawTrailSupabase = {
    ready,
    checkListingPolicy,
    insertListing,
    fetchListings,
    fetchGlobalListings,
    moderateUser,
    signIn,
    signUp,
  };
})();
