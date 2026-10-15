import type { Request } from 'express';
import type { AuthenticatedIdentity, IdentityVerifier } from './identity.js';

const DEVELOPMENT_TOKEN = /^dev-([A-Za-z0-9_-]{1,120})$/;

export class DevelopmentIdentityVerifier implements IdentityVerifier {
  constructor(private readonly environment: string | undefined) {}

  verify(request: Request): Promise<AuthenticatedIdentity | null> {
    if (this.environment !== 'development') return Promise.resolve(null);
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer (.+)$/i);
    const token = match?.[1]?.match(DEVELOPMENT_TOKEN);
    return Promise.resolve(token ? { userId: token[1] as string } : null);
  }
}
