import { describe, it, expect } from 'vitest';

// ─── Pure helpers extracted for unit testing ─────────────────────────────────

const VALID_PLATFORMS = ['IOS', 'ANDROID'] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

function isValidPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (VALID_PLATFORMS as readonly string[]).includes(value);
}

function buildPreferenceUpdate(body: Record<string, unknown>) {
  const BOOLEAN_FIELDS = [
    'showStartingSoon',
    'sellerLive',
    'claimExpiring',
    'paymentConfirmed',
    'orderShipped',
  ] as const;

  const errors: string[] = [];
  const data: Partial<Record<(typeof BOOLEAN_FIELDS)[number], boolean>> = {};

  for (const field of BOOLEAN_FIELDS) {
    if (field in body) {
      if (typeof body[field] !== 'boolean') {
        errors.push(`${field} must be a boolean`);
      } else {
        data[field] = body[field] as boolean;
      }
    }
  }

  return { errors, data };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('isValidPlatform', () => {
  it('accepts IOS and ANDROID', () => {
    expect(isValidPlatform('IOS')).toBe(true);
    expect(isValidPlatform('ANDROID')).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isValidPlatform('ios')).toBe(false);
    expect(isValidPlatform('android')).toBe(false);
    expect(isValidPlatform('WINDOWS')).toBe(false);
    expect(isValidPlatform('')).toBe(false);
    expect(isValidPlatform(null)).toBe(false);
    expect(isValidPlatform(undefined)).toBe(false);
    expect(isValidPlatform(42)).toBe(false);
  });
});

describe('buildPreferenceUpdate', () => {
  it('collects valid boolean fields', () => {
    const { errors, data } = buildPreferenceUpdate({
      showStartingSoon: false,
      orderShipped: true,
    });
    expect(errors).toHaveLength(0);
    expect(data).toEqual({ showStartingSoon: false, orderShipped: true });
  });

  it('ignores unknown fields', () => {
    const { errors, data } = buildPreferenceUpdate({ unknownField: true, sellerLive: false });
    expect(errors).toHaveLength(0);
    expect(data).toEqual({ sellerLive: false });
    expect('unknownField' in data).toBe(false);
  });

  it('reports a validation error for non-boolean values', () => {
    const { errors, data } = buildPreferenceUpdate({ claimExpiring: 'yes' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('claimExpiring');
    expect(Object.keys(data)).toHaveLength(0);
  });

  it('returns empty data for empty body', () => {
    const { errors, data } = buildPreferenceUpdate({});
    expect(errors).toHaveLength(0);
    expect(data).toEqual({});
  });

  it('handles all five preference fields', () => {
    const { errors, data } = buildPreferenceUpdate({
      showStartingSoon: true,
      sellerLive: false,
      claimExpiring: true,
      paymentConfirmed: false,
      orderShipped: true,
    });
    expect(errors).toHaveLength(0);
    expect(data).toEqual({
      showStartingSoon: true,
      sellerLive: false,
      claimExpiring: true,
      paymentConfirmed: false,
      orderShipped: true,
    });
  });
});
