# @serafort/core — Serafort JavaScript / TypeScript Isomorphic SDK

Isomorphic TypeScript core SDK for the Serafort identity and multi-tenant authentication platform. Works seamlessly in Node.js, browsers, Cloudflare Workers, Vercel Edge, Deno, and Bun with **zero external runtime dependencies**.

## Features

- **Machine Identity (M2M)**: Client Credentials Grant (`/oauth/token`) with thread-safe / Promise-safe in-memory caching, proactive 5-minute pre-expiration token refresh, and exponential backoff retry policies.
- **B2B User Identity & RBAC**: Fast, zero-network-hop local JWT verification using cached JWKS with Web Crypto API (`crypto.subtle`). Decodes user context (`userId`, `tenantId`, `roles`, `permissions`) and provides wildcard RBAC guards (`hasPermission('org:*')`).
- **Enterprise SSO**: Discovery and redirect URL generators for SAML 2.0 and OIDC tenants.
- **Dual Module Exports**: Native ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`) with complete TypeScript declarations.

## Installation

```bash
npm install @serafort/core
# or
pnpm add @serafort/core
```

## Quickstart

### 1. Machine-to-Machine (M2M) Authentication

```typescript
import { SerafortClient } from '@serafort/core';

const client = new SerafortClient({
  endpoint: 'https://auth.acme.com',
  clientId: process.env.SERAFORT_CLIENT_ID,
  clientSecret: process.env.SERAFORT_CLIENT_SECRET,
});

// Retrieves access token from cache, or fetches automatically if nearing expiration
const accessToken = await client.getAccessToken(['read:users', 'write:users']);

// Use in outgoing API requests
const res = await fetch('https://api.acme.com/v1/data', {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

### 2. Local JWT Validation & RBAC (Zero Network Hops)

```typescript
import { SerafortClient } from '@serafort/core';

const client = new SerafortClient({
  endpoint: 'https://auth.acme.com',
});

// Validates token signature against cached JWKS and returns UserContext
const userContext = await client.validateToken(bearerToken);

console.log(userContext.userId);    // "usr_123"
console.log(userContext.tenantId);  // "ten_enterprise"

// Check granular permissions (supports wildcards like "org:*")
if (client.b2b.hasPermission(userContext, 'org:write')) {
  // Allow action
}
```

### 3. Enterprise SSO Login URL

```typescript
const loginUrl = client.b2b.getLoginUrl('ten_enterprise', 'https://app.acme.com/auth/callback', {
  state: 'secure_csrf_state',
});
```

## License

MIT
