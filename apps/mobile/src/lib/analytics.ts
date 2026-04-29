/**
 * Analytics – lightweight event tracking for the Arremate mobile app.
 *
 * Design goals:
 * - Zero-dependency in production: uses console.log in development and a
 *   pluggable backend in production (swap `sendEvent` to integrate with
 *   Segment, Amplitude, Firebase Analytics, etc.).
 * - Type-safe event catalogue: all tracked events are declared as a union so
 *   callers get auto-complete and catch typos at compile time.
 * - Fire-and-forget: callers never await analytics; errors are swallowed so
 *   they never surface to the user.
 */

// ─── Event catalogue ──────────────────────────────────────────────────────────

export type AnalyticsEvent =
  // Onboarding funnel
  | 'app_opened'
  | 'sign_in_started'
  | 'sign_in_success'
  | 'sign_in_failed'
  | 'sign_up_started'
  | 'sign_up_success'
  // Discovery
  | 'shows_list_viewed'
  | 'show_detail_viewed'
  // Live room
  | 'live_room_entered'
  | 'live_room_exited'
  | 'bid_submitted'
  | 'bid_success'
  | 'claim_confirmed'
  | 'playback_error'
  // Checkout
  | 'checkout_started'
  | 'pix_code_copied'
  | 'payment_confirmed'
  // Orders
  | 'orders_list_viewed'
  | 'order_detail_viewed'
  // Notifications
  | 'push_permission_granted'
  | 'push_permission_denied'
  | 'device_registered'
  | 'notification_opened';

export type EventProperties = Record<string, string | number | boolean | null | undefined>;

// ─── Backend ──────────────────────────────────────────────────────────────────

/**
 * Replace this function with a real analytics provider call.
 *
 * Example (Segment):
 *   import { Analytics } from '@segment/analytics-react-native';
 *   Analytics.track(event, properties);
 *
 * Example (Firebase):
 *   import analytics from '@react-native-firebase/analytics';
 *   analytics().logEvent(event, properties);
 */
async function sendEvent(event: AnalyticsEvent, properties?: EventProperties): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, properties ?? {});
  }
  // TODO: integrate with your analytics provider here
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Track an analytics event. Fire-and-forget – never throws.
 */
export function trackEvent(event: AnalyticsEvent, properties?: EventProperties): void {
  void sendEvent(event, properties).catch(() => {
    // Swallow errors so analytics never affects the user experience.
  });
}
