import type { Request } from 'express';

export interface AuthenticatedIdentity {
  readonly userId: string;
}

export interface IdentityVerifier {
  verify(request: Request): Promise<AuthenticatedIdentity | null>;
}

export interface AuthenticatedRequest extends Request {
  identity: AuthenticatedIdentity;
}

export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');
