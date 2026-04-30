import { describe, it, expect } from 'vitest';
import { normalizeRoute } from '../app.js';

// ─── normalizeRoute ───────────────────────────────────────────────────────────

describe('normalizeRoute', () => {
  it('leaves static routes unchanged', () => {
    expect(normalizeRoute('/v1/admin/health')).toBe('/v1/admin/health');
    expect(normalizeRoute('/health')).toBe('/health');
    expect(normalizeRoute('/v1/admin/analytics/monetization')).toBe(
      '/v1/admin/analytics/monetization',
    );
  });

  it('replaces numeric id segments with :id', () => {
    expect(normalizeRoute('/v1/orders/123')).toBe('/v1/orders/:id');
    expect(normalizeRoute('/v1/shows/42/items')).toBe('/v1/shows/:id/items');
  });

  it('replaces UUID segments with :id', () => {
    expect(
      normalizeRoute('/v1/admin/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890/profile'),
    ).toBe('/v1/admin/users/:id/profile');
  });

  it('replaces multiple dynamic segments', () => {
    expect(normalizeRoute('/v1/admin/users/123/orders/456')).toBe(
      '/v1/admin/users/:id/orders/:id',
    );
  });

  it('handles paths with no trailing dynamic segment', () => {
    expect(normalizeRoute('/v1/seller/shows/999')).toBe('/v1/seller/shows/:id');
  });

  it('does not alter query strings or non-path portions', () => {
    // normalizeRoute only operates on the pathname, no query string expected
    expect(normalizeRoute('/v1/admin')).toBe('/v1/admin');
  });
});
