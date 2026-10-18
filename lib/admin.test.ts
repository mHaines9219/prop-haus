import { describe, expect, it } from 'vitest';
import { adminEmails, isAdminEmail, parseViewAs } from './admin';

// The allowlist: a default so masquerade works unconfigured, an env override,
// case-insensitive matching, and the cookie parser that admits only real tiers.

describe('adminEmails', () => {
  it('defaults to the founder when ADMIN_EMAILS is unset or blank', () => {
    expect(adminEmails({})).toEqual(['mhaines9219@gmail.com']);
    expect(adminEmails({ ADMIN_EMAILS: '  ' })).toEqual(['mhaines9219@gmail.com']);
  });

  it('reads a comma-separated override, trimmed and lower-cased', () => {
    expect(adminEmails({ ADMIN_EMAILS: ' A@x.com, b@Y.com ,,' })).toEqual(['a@x.com', 'b@y.com']);
  });
});

describe('isAdminEmail', () => {
  it('matches case-insensitively and rejects empty', () => {
    expect(isAdminEmail('MHaines9219@Gmail.com', {})).toBe(true);
    expect(isAdminEmail('someone@else.com', {})).toBe(false);
    expect(isAdminEmail(null, {})).toBe(false);
    expect(isAdminEmail('', {})).toBe(false);
  });

  it('an override replaces the default rather than adding to it', () => {
    expect(isAdminEmail('mhaines9219@gmail.com', { ADMIN_EMAILS: 'ops@prophaus.co' })).toBe(false);
    expect(isAdminEmail('ops@prophaus.co', { ADMIN_EMAILS: 'ops@prophaus.co' })).toBe(true);
  });
});

describe('parseViewAs', () => {
  it('admits only known tiers', () => {
    expect(parseViewAs('free')).toBe('free');
    expect(parseViewAs('directory')).toBe('directory');
    expect(parseViewAs('pro')).toBe('pro');
    expect(parseViewAs('enterprise')).toBeNull();
    expect(parseViewAs('')).toBeNull();
    expect(parseViewAs(undefined)).toBeNull();
  });
});
