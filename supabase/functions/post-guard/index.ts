import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Automated admin for the community board:
// allow up to LIMIT posts per IP per rolling WINDOW_DAYS window, then auto-limit.
const LIMIT = 20;
const WINDOW_DAYS = 1;

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

  // Respect manual admin suspensions/bans applied to this network.
  const { data: subjects } = await supabase
    .from("moderation_subjects")
    .select("status, reason")
    .in("subject", [ipHash]);

  const blocked = subjects?.find(s => s.status === "banned" || s.status === "suspended");
  if (blocked) {
    return json({ allowed: false, reason: blocked.reason || "Posting from this network is temporarily blocked." }, 403);
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const { count } = await supabase
    .from("post_submissions")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if ((count || 0) >= LIMIT) {
    await supabase.from("moderation_actions").insert({
      subject: ipHash,
      action: "auto_limit",
      reason: `More than ${LIMIT} community posts from the same IP in ${WINDOW_DAYS} day(s)`,
    });
    return json({
      allowed: false,
      reason: `You have reached the limit of ${LIMIT} community posts per day from this network. Please try again tomorrow.`,
      remaining: 0,
    }, 429);
  }

  await supabase.from("post_submissions").insert({
    ip_hash: ipHash,
    post_id: body.postId || null,
    kind: body.kind || null,
  });

  return json({ allowed: true, remaining: Math.max(0, LIMIT - (count || 0) - 1) });
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
