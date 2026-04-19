import { describe, it, expect } from 'vitest';
import {
  decodeJwtPayload,
  isTokenExpired,
  extractBearerToken,
} from '../index.js';

// Helper: create a mock JWT with arbitrary payload (unsigned, for decode tests only)
function makeFakeJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesignature`;
}

describe('decodeJwtPayload', () => {
  it('returns null for a malformed token', () => {
    expect(decodeJwtPayload('not.a.jwt.at.all')).toBeNull();
    expect(decodeJwtPayload('invalid')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });

  it('decodes a valid JWT payload', () => {
    const payload = { sub: 'user-123', email: 'user@example.com', role: 'BUYER', exp: 9999999999 };
    const token = makeFakeJwt(payload);
    const decoded = decodeJwtPayload(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe('user-123');
    expect(decoded?.email).toBe('user@example.com');
    expect(decoded?.role).toBe('BUYER');
  });
});

describe('isTokenExpired', () => {
  it('returns false when exp is in the future', () => {
    const payload = { sub: 'x', email: 'x@x.com', role: 'BUYER', exp: Math.floor(Date.now() / 1000) + 3600 };
    expect(isTokenExpired(payload)).toBe(false);
  });

  it('returns true when exp is in the past', () => {
    const payload = { sub: 'x', email: 'x@x.com', role: 'BUYER', exp: Math.floor(Date.now() / 1000) - 1 };
    expect(isTokenExpired(payload)).toBe(true);
  });

  it('returns false when exp is absent', () => {
    const payload = { sub: 'x', email: 'x@x.com', role: 'BUYER' };
    expect(isTokenExpired(payload)).toBe(false);
  });
});

describe('extractBearerToken', () => {
  it('returns null for undefined', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('returns null when header does not start with Bearer', () => {
    expect(extractBearerToken('Token abc')).toBeNull();
    expect(extractBearerToken('bearer abc')).toBeNull();
  });

  it('extracts the token from a valid Authorization header', () => {
    expect(extractBearerToken('Bearer my.jwt.token')).toBe('my.jwt.token');
  });
});
