/**
 * Crash reporting – centralised error capture for the Arremate mobile app.
 *
 * Design goals:
 * - Drop-in: swap `sendError` to integrate with Sentry, Bugsnag, Firebase
 *   Crashlytics, or any other provider without changing call-sites.
 * - Always safe: capture() never throws back to the caller.
 * - Contextual: accepts structured extras so errors arrive with enough context
 *   to triage without reproducing.
 *
 * Usage:
 *   import { captureError } from '../lib/crashReporting';
 *
 *   try { ... } catch (err) {
 *     captureError(err, { screen: 'LiveRoom', showId });
 *   }
 */

export type ErrorExtras = Record<string, string | number | boolean | null | undefined>;

// ─── Backend ──────────────────────────────────────────────────────────────────

/**
 * Replace this function with a real crash-reporting provider call.
 *
 * Example (Sentry):
 *   import * as Sentry from '@sentry/react-native';
 *   Sentry.captureException(error, { extra: extras });
 *
 * Example (Firebase Crashlytics):
 *   import crashlytics from '@react-native-firebase/crashlytics';
 *   crashlytics().recordError(error instanceof Error ? error : new Error(String(error)));
 */
async function sendError(error: unknown, extras?: ErrorExtras): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[crash-reporting]', message, extras ?? {});
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
  }
  // TODO: integrate with your crash reporting provider here
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Capture and report an error. Fire-and-forget – never throws.
 */
export function captureError(error: unknown, extras?: ErrorExtras): void {
  void sendError(error, extras).catch(() => {
    // Swallow secondary errors so crash reporting never cascades into the UI.
  });
}

/**
 * Record a non-fatal breadcrumb message (e.g. a recoverable network error).
 */
export function recordBreadcrumb(message: string, extras?: ErrorExtras): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn('[breadcrumb]', message, extras ?? {});
  }
  // TODO: integrate with your crash reporting provider here
}
