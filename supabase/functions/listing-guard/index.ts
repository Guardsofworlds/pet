import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LIMIT = 10;
const WINDOW_DAYS = 30;

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const salt = Deno.env.get("PAWTRAIL_IP_HASH_SALT") || "change-me";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json().catch(() => ({}));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const ipHash = await sha256(`${salt}:${ip}`);
  const contactHash = body.contact ? await sha256(`${salt}:${String(body.contact).toLowerCase()}`) : null;

  const subjectKeys = [ipHash, contactHash].filter(Boolean);
  if (subjectKeys.length) {
    const { data: subjects } = await supabase
      .from("moderation_subjects")
      .select("status, reason")
      .in("subject", subjectKeys);

    const blocked = subjects?.find(s => s.status === "banned" || s.status === "suspended");
    if (blocked) {
      return json({ allowed: false, reason: blocked.reason || "This submitter is temporarily blocked." }, 403);
    }
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const { count } = await supabase
    .from("listing_submissions")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if ((count || 0) >= LIMIT) {
    await supabase.from("moderation_actions").insert({
      subject: ipHash,
      action: "auto_limit",
      reason: `More than ${LIMIT} listings from the same IP in ${WINDOW_DAYS} days`,
    });
    return json({
      allowed: false,
      reason: "Too many listings were submitted from this network this month. An admin can review and clear this if it is a shelter or rescue.",
    }, 429);
  }

  await supabase.from("listing_submissions").insert({
    ip_hash: ipHash,
    contact_hash: contactHash,
    listing_id: body.listingId || null,
    kind: body.kind || null,
  });

  return json({ allowed: true });
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
