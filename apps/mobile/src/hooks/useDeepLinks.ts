import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

/**
 * Deep-link URL structure for the Arremate app.
 *
 * Supported URI schemes:
 *   arremate://show/<id>          → /show/<id>
 *   arremate://live/<id>          → /live/<id>
 *   arremate://order/<id>         → /order/<id>
 *   arremate://auth/callback      → /auth/callback  (handled separately)
 */

function resolveDeepLink(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    // parsed.hostname is the host part after the scheme
    const host = parsed.hostname ?? '';
    const path = (parsed.path ?? '').replace(/^\//, '');

    // auth/callback is handled by AuthCallbackScreen; skip routing here
    if (host === 'auth') return null;

    if (host === 'show' && path) return `/show/${path}`;
    if (host === 'live' && path) return `/live/${path}`;
    if (host === 'order' && path) return `/order/${path}`;
  } catch {
    // Ignore malformed URLs
  }
  return null;
}

/**
 * useDeepLinks
 *
 * Subscribes to incoming deep links and routes the user to the correct screen.
 * Must be used inside a component that has access to expo-router's navigation.
 *
 * Handles both cold-start links (via Linking.getInitialURL) and foreground
 * links (via Linking.addEventListener).
 */
export function useDeepLinks() {
  const router = useRouter();

  useEffect(() => {
    // Handle cold-start deep link
    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      const route = resolveDeepLink(url);
      if (route) router.push(route as Parameters<typeof router.push>[0]);
    });

    // Handle foreground deep links
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const route = resolveDeepLink(url);
      if (route) router.push(route as Parameters<typeof router.push>[0]);
    });

    return () => subscription.remove();
  }, [router]);
}

export { resolveDeepLink };
