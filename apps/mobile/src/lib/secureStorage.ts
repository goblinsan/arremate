import * as SecureStore from 'expo-secure-store';

/**
 * Thin async wrapper around expo-secure-store that exposes the same
 * getItem / setItem / removeItem interface used by AsyncStorage so the
 * call-sites are easy to migrate and test.
 *
 * On web (where SecureStore is unavailable) the implementation falls back
 * to in-memory storage so that Expo's web target continues to work.
 */

const memoryFallback = new Map<string, string>();

function isSecureStoreAvailable(): boolean {
  return SecureStore.isAvailableAsync !== undefined;
}

export async function getItem(key: string): Promise<string | null> {
  if (!isSecureStoreAvailable()) {
    return memoryFallback.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (!isSecureStoreAvailable()) {
    memoryFallback.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (!isSecureStoreAvailable()) {
    memoryFallback.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
