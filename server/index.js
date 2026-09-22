import cors from "cors";
import express from "express";

const app = express();
const port = process.env.PORT || 8787;
const openAiKey = process.env.OPENAI_API_KEY;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!openAiKey) {
  console.error("OPENAI_API_KEY is required");
  process.exit(1);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed"));
  },
}));
app.use(express.json({ limit: "25mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/v1/chat/completions", proxyToOpenAi);
app.post("/v1/images/generations", proxyToOpenAi);

async function proxyToOpenAi(request, response) {
  try {
    const openAiResponse = await fetch(`https://api.openai.com${request.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify(request.body),
    });

    response.status(openAiResponse.status);
    response.setHeader(
      "Content-Type",
      openAiResponse.headers.get("content-type") || "application/json",
    );
    response.send(await openAiResponse.text());
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: { message: "AI service unavailable" } });
  }
}

app.listen(port, () => {
  console.log(`SalesEdge API listening on port ${port}`);
});