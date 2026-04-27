// Local Node.js development server.
// Production deploys to Cloudflare Workers via worker.ts.
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { logger } from "@arremate/observability";

const port = Number(process.env.PORT ?? 4000);

const liveVideoProvider = process.env.LIVE_VIDEO_PROVIDER ?? 'stub';
if (liveVideoProvider === 'stub' && process.env.NODE_ENV === 'production') {
  logger.warn('LIVE_VIDEO_PROVIDER is not configured for production. Set LIVE_VIDEO_PROVIDER=cloudflare_stream and provide CF_ACCOUNT_ID and CF_API_TOKEN to enable live streaming.', {});
}

serve({ fetch: app.fetch, port }, () => {
  console.log("API listening on http://0.0.0.0:" + port);
});
