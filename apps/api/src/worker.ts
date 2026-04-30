// Cloudflare Workers entry point.
// `app` is a standard Hono application — its `.fetch` handler is the Workers fetch handler.
/// <reference types="@cloudflare/workers-types" />
import { app } from './app.js';
import { runProbes } from './probes.js';

export default {
  fetch: app.fetch.bind(app),

  /**
   * Cloudflare Cron Trigger handler.
   *
   * Runs every 5 minutes (see `[triggers]` in wrangler.toml) and executes all
   * configured synthetic probes, emitting availability and latency metrics
   * independently of normal user traffic.
   */
  async scheduled(_event: ScheduledEvent, _env: unknown, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runProbes());
  },
};
