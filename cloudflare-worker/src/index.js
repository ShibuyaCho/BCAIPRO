const OPENAI_URL = "https://api.openai.com";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin, env) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true }, 200, origin, env);
    }

    if (
      request.method !== "POST" ||
      !["/v1/chat/completions", "/v1/images/generations"].includes(url.pathname)
    ) {
      return json({ error: { message: "Not found" } }, 404, origin, env);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: { message: "API key is not configured" } }, 500, origin, env);
    }

    try {
      const openAiResponse = await fetch(`${OPENAI_URL}${url.pathname}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: await request.text(),
      });

      return new Response(openAiResponse.body, {
        status: openAiResponse.status,
        headers: {
          ...corsHeaders(origin, env),
          "Content-Type": openAiResponse.headers.get("Content-Type") || "application/json",
        },
      });
    } catch {
      return json({ error: { message: "AI service unavailable" } }, 502, origin, env);
    }
  },
};

function corsHeaders(origin, env) {
  return {
    "Access-Control-Allow-Origin": origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin, env), "Content-Type": "application/json" },
  });
}