/**
 * Returns the value of an environment variable, or undefined if not set.
 */
export function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Returns the value of an environment variable, throwing if it is not set.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Returns the current NODE_ENV, defaulting to 'development'.
 */
export function getNodeEnv(): string {
  return process.env.NODE_ENV ?? 'development';
}

export function isDevelopment(): boolean {
  return getNodeEnv() === 'development';
}

export function isProduction(): boolean {
  return getNodeEnv() === 'production';
}

export function isTest(): boolean {
  return getNodeEnv() === 'test';
}
