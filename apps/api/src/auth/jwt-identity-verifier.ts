import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWSAlgorithm, type JWTVerifyGetKey } from 'jose';
import type { AuthenticatedIdentity, IdentityVerifier } from './identity.js';

export interface JwtIdentityVerifierOptions {
  readonly issuer: string;
  readonly audience: string | readonly string[];
  readonly algorithms: readonly JWSAlgorithm[];
  readonly clockToleranceSeconds?: number;
}

function bearerToken(request: Request): string | null {
  const authorization = request.header('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

function isSafeSubject(subject: unknown): subject is string {
  return (
    typeof subject === 'string' &&
    subject.length > 0 &&
    subject.length <= 255 &&
    subject.trim() === subject &&
    !/\s/u.test(subject)
  );
}

export class JwtIdentityVerifier implements IdentityVerifier {
  constructor(
    private readonly key: JWTVerifyGetKey,
    private readonly options: JwtIdentityVerifierOptions,
  ) {}

  async verify(request: Request): Promise<AuthenticatedIdentity | null> {
    const token = bearerToken(request);
    if (!token) return null;
    const audience =
      typeof this.options.audience === 'string'
        ? this.options.audience
        : [...this.options.audience];

    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.options.issuer,
        audience,
        algorithms: [...this.options.algorithms],
        clockTolerance: this.options.clockToleranceSeconds ?? 5,
        requiredClaims: ['sub', 'exp'],
      });
      return isSafeSubject(payload.sub) ? { userId: payload.sub } : null;
    } catch {
      return null;
    }
  }
}

const ASYMMETRIC_ALGORITHMS = new Set<JWSAlgorithm>([
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
  'Ed25519',
]);

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when SUR_AUTH_MODE=jwt`);
  return value;
}

function parseAlgorithms(value: string | undefined): JWSAlgorithm[] {
  const algorithms = (value ?? 'RS256')
    .split(',')
    .map((algorithm) => algorithm.trim())
    .filter(Boolean);
  if (
    algorithms.length === 0 ||
    algorithms.some((algorithm) => !ASYMMETRIC_ALGORITHMS.has(algorithm))
  ) {
    throw new Error('AUTH_JWT_ALGORITHMS must contain only supported asymmetric algorithms');
  }
  return algorithms;
}

function parseAudience(value: string): string | string[] {
  const audience = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (audience.length === 0) throw new Error('AUTH_JWT_AUDIENCE must not be empty');
  return audience.length === 1 ? (audience[0] as string) : audience;
}

export function createJwtIdentityVerifier(environment: NodeJS.ProcessEnv): JwtIdentityVerifier {
  const jwksUrl = new URL(required(environment, 'AUTH_JWKS_URL'));
  if (jwksUrl.protocol !== 'https:' || jwksUrl.username || jwksUrl.password) {
    throw new Error('AUTH_JWKS_URL must be an HTTPS URL without embedded credentials');
  }

  const key = createRemoteJWKSet(jwksUrl, {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
  return new JwtIdentityVerifier(key, {
    issuer: required(environment, 'AUTH_JWT_ISSUER'),
    audience: parseAudience(required(environment, 'AUTH_JWT_AUDIENCE')),
    algorithms: parseAlgorithms(environment.AUTH_JWT_ALGORITHMS),
  });
}
