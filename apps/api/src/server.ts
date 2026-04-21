// Local Node.js development server.
// Production deploys to Cloudflare Workers via worker.ts.
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, () => {
  console.log("API listening on http://0.0.0.0:" + port);
});
