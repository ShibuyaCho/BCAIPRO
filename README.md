# BCAIPRO

## Deploying the API for free

GitHub Pages hosts the frontend only. Deploy the included Cloudflare Worker as the API proxy:

1. Create a free Cloudflare account and install Wrangler: `npm install -g wrangler`.
2. From `cloudflare-worker`, run `wrangler login`.
3. Store your new OpenAI key: `wrangler secret put OPENAI_API_KEY`.
4. Deploy it: `wrangler deploy`.
5. Optionally add the Worker URL to the GitHub repository variable `VITE_API_URL` under **Settings > Secrets and variables > Actions > Variables**. The Pages build defaults to `https://bcaipro.dinofreud.workers.dev`.
6. Push a commit to `main` to rebuild the Pages site.

Verify the Worker at `https://bcaipro.dinofreud.workers.dev/health` before testing the frontend. It should return `{ "ok": true }`.