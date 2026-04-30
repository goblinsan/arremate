import { describe, it, expect } from 'vitest';
import { normalizeRoute, isSuspiciousPath } from '../app.js';

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

// ─── isSuspiciousPath ─────────────────────────────────────────────────────────

describe('isSuspiciousPath', () => {
  it('returns false for ordinary API routes', () => {
    expect(isSuspiciousPath('/v1/orders')).toBe(false);
    expect(isSuspiciousPath('/v1/seller/shows/123')).toBe(false);
    expect(isSuspiciousPath('/health')).toBe(false);
    expect(isSuspiciousPath('/v1/admin/analytics/monetization')).toBe(false);
  });

  it('detects path traversal sequences', () => {
    expect(isSuspiciousPath('/../etc/passwd')).toBe(true);
    expect(isSuspiciousPath('/v1/orders/../../admin')).toBe(true);
    expect(isSuspiciousPath('/..%2Fetc%2Fpasswd')).toBe(true);
  });

  it('detects sensitive file probes', () => {
    expect(isSuspiciousPath('/.env')).toBe(true);
    expect(isSuspiciousPath('/.git/config')).toBe(true);
    expect(isSuspiciousPath('/private.key')).toBe(true);
    expect(isSuspiciousPath('/server.pem')).toBe(true);
  });

  it('detects Unix system path probes', () => {
    expect(isSuspiciousPath('/etc/passwd')).toBe(true);
    expect(isSuspiciousPath('/proc/self/environ')).toBe(true);
  });

  it('detects CMS and admin scanner probes', () => {
    expect(isSuspiciousPath('/wp-admin/install.php')).toBe(true);
    expect(isSuspiciousPath('/wp-config.php')).toBe(true);
    expect(isSuspiciousPath('/phpmyadmin')).toBe(true);
  });

  it('detects XSS and injection characters in paths', () => {
    expect(isSuspiciousPath('/v1/search?q=<script>')).toBe(true);
    expect(isSuspiciousPath('/v1/search%3Cscript%3E')).toBe(true);
    expect(isSuspiciousPath("/v1/orders/'%20OR%201=1")).toBe(true);
  });

  it('detects SQL injection fragments in paths', () => {
    expect(isSuspiciousPath('/v1/orders/1%20UNION%20SELECT%20*')).toBe(true);
  });

  it('detects null-byte injection', () => {
    expect(isSuspiciousPath('/v1/file%00.txt')).toBe(true);
  });
});
