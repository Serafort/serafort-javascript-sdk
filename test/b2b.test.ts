import { describe, it, expect, vi } from 'vitest';
import { B2BModule } from '../src/b2b/b2b.js';
import { AuthenticationError } from '../src/errors.js';

// Helper to create an unsigned mock JWT string
function createMockJwt(header: object, payload: object): string {
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  return `${encode(header)}.${encode(payload)}.mockSignature`;
}

describe('B2BModule', () => {
  const b2b = new B2BModule({
    endpoint: 'https://auth.acme.com',
  });

  describe('validateToken (skipSignatureCheck=true for claim parsing)', () => {
    it('should correctly parse valid JWT and decode into UserContext', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createMockJwt(
        { alg: 'RS256', kid: 'key-1' },
        {
          sub: 'usr_abc123',
          tenant_id: 'ten_enterprise456',
          email: 'admin@enterprise.com',
          roles: ['admin', 'manager'],
          permissions: ['org:read', 'org:write', 'billing:read'],
          iss: 'https://auth.acme.com',
          exp: now + 3600,
        }
      );

      const user = await b2b.validateToken(token, { skipSignatureCheck: true });

      expect(user.userId).toBe('usr_abc123');
      expect(user.tenantId).toBe('ten_enterprise456');
      expect(user.email).toBe('admin@enterprise.com');
      expect(user.roles).toEqual(['admin', 'manager']);
      expect(user.permissions).toEqual(['org:read', 'org:write', 'billing:read']);
    });

    it('should throw AuthenticationError if token is expired', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createMockJwt(
        { alg: 'RS256' },
        {
          sub: 'usr_old',
          exp: now - 500, // Expired 500s ago
        }
      );

      await expect(
        b2b.validateToken(expiredToken, { skipSignatureCheck: true, clockToleranceSeconds: 0 })
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError if issuer does not match', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createMockJwt(
        { alg: 'RS256' },
        {
          sub: 'usr_1',
          iss: 'https://malicious-issuer.com',
          exp: now + 3600,
        }
      );

      await expect(
        b2b.validateToken(token, {
          expectedIssuer: 'https://auth.acme.com',
          skipSignatureCheck: true,
        })
      ).rejects.toThrow('Invalid token issuer');
    });
  });

  describe('RBAC & Permission Checking', () => {
    const userContext = {
      userId: 'usr_1',
      tenantId: 'ten_1',
      roles: ['editor'],
      permissions: ['posts:read', 'posts:write', 'users:*'],
      claims: {},
    };

    it('should accurately verify exact permission', () => {
      expect(b2b.hasPermission(userContext, 'posts:read')).toBe(true);
      expect(b2b.hasPermission(userContext, 'posts:delete')).toBe(false);
    });

    it('should support wildcard permission checking', () => {
      expect(b2b.hasPermission(userContext, 'users:create')).toBe(true);
      expect(b2b.hasPermission(userContext, 'users:delete')).toBe(true);
      expect(b2b.hasPermission(userContext, 'billing:read')).toBe(false);
    });

    it('should verify roles', () => {
      expect(b2b.hasRole(userContext, 'editor')).toBe(true);
      expect(b2b.hasRole(userContext, 'admin')).toBe(false);
    });
  });

  describe('getLoginUrl', () => {
    it('should generate correct Enterprise SSO URL with tenant and redirect_uri', () => {
      const loginUrl = b2b.getLoginUrl('ten_acme', 'https://app.acme.com/callback', {
        state: 'random_state_123',
      });

      const url = new URL(loginUrl);
      expect(url.origin).toBe('https://auth.acme.com');
      expect(url.pathname).toBe('/api/auth/sso/login');
      expect(url.searchParams.get('tenant_id')).toBe('ten_acme');
      expect(url.searchParams.get('redirect_uri')).toBe('https://app.acme.com/callback');
      expect(url.searchParams.get('state')).toBe('random_state_123');
    });
  });
});
