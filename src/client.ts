import { B2BModule } from './b2b/b2b.js';
import { M2MModule } from './m2m/m2m.js';
import { SerafortConfig } from './types.js';

/**
 * Unified Serafort SDK Client.
 * Provides Machine Identity (M2M) token caching and B2B User Identity / RBAC capabilities.
 */
export class SerafortClient {
  public readonly config: SerafortConfig;
  public readonly m2m: M2MModule;
  public readonly b2b: B2BModule;

  constructor(config: SerafortConfig) {
    this.config = {
      endpoint: config.endpoint || config.baseUrl || 'https://api.serafort.com',
      ...config,
    };

    this.m2m = new M2MModule(this.config);
    this.b2b = new B2BModule(this.config);
  }

  /**
   * Helper shortcut to retrieve an M2M access token.
   */
  public async getAccessToken(scopes?: string[]): Promise<string> {
    return this.m2m.getAccessToken(scopes);
  }

  /**
   * Helper shortcut to validate a JWT token and decode its UserContext.
   */
  public async validateToken(token: string) {
    return this.b2b.validateToken(token);
  }
}
