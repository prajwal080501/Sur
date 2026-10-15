import type { Request } from 'express';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createIdentityVerifier } from './create-identity-verifier.js';
import { DevelopmentIdentityVerifier } from './development-identity-verifier.js';
import { JwtIdentityVerifier } from './jwt-identity-verifier.js';

const issuer = 'https://identity.example.com';
const audience = 'sur-api';
let privateKey: CryptoKey;
let verifier: JwtIdentityVerifier;

function requestWithAuthorization(authorization?: string): Request {
  return {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as Request;
}

async function token(
  options: {
    subject?: string;
    tokenIssuer?: string;
    tokenAudience?: string;
    expiration?: string;
  } = {},
): Promise<string> {
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setAudience(options.tokenAudience ?? audience)
    .setIssuedAt();
  if (options.subject !== undefined) jwt = jwt.setSubject(options.subject);
  if (options.expiration !== undefined) jwt = jwt.setExpirationTime(options.expiration);
  return jwt.sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  const key = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key', use: 'sig' }],
  }) as JWTVerifyGetKey;
  verifier = new JwtIdentityVerifier(key, {
    issuer,
    audience,
    algorithms: ['RS256'],
    clockToleranceSeconds: 0,
  });
});

describe('JwtIdentityVerifier', () => {
  it('accepts a correctly signed token with the required claims', async () => {
    const jwt = await token({ subject: 'user_123', expiration: '5m' });
    await expect(verifier.verify(requestWithAuthorization(`Bearer ${jwt}`))).resolves.toEqual({
      userId: 'user_123',
    });
  });

  it.each([
    ['missing authorization', undefined],
    ['wrong scheme', 'Basic abc'],
    ['multiple token values', 'Bearer abc def'],
    ['malformed token', 'Bearer not-a-jwt'],
  ])('rejects %s', async (_case, authorization) => {
    await expect(verifier.verify(requestWithAuthorization(authorization))).resolves.toBeNull();
  });

  it('rejects missing, expired, issuer, audience, and unsafe subject claims', async () => {
    const candidates = await Promise.all([
      token({ expiration: '5m' }),
      token({ subject: 'user_123', expiration: '0s' }),
      token({ subject: 'user_123', expiration: '5m', tokenIssuer: 'https://attacker.example' }),
      token({ subject: 'user_123', expiration: '5m', tokenAudience: 'another-api' }),
      token({ subject: ' user_123 ', expiration: '5m' }),
    ]);

    for (const candidate of candidates) {
      await expect(
        verifier.verify(requestWithAuthorization(`Bearer ${candidate}`)),
      ).resolves.toBeNull();
    }
  });
});

describe('createIdentityVerifier', () => {
  it('uses development tokens only in development', () => {
    expect(
      createIdentityVerifier({ NODE_ENV: 'development', SUR_AUTH_MODE: 'development' }),
    ).toBeInstanceOf(DevelopmentIdentityVerifier);
    expect(() =>
      createIdentityVerifier({ NODE_ENV: 'production', SUR_AUTH_MODE: 'development' }),
    ).toThrow(/only allowed outside production/);
  });

  it('fails fast when JWT settings are missing or unsafe', () => {
    expect(() => createIdentityVerifier({ NODE_ENV: 'production' })).toThrow(/AUTH_JWKS_URL/);
    expect(() =>
      createIdentityVerifier({
        NODE_ENV: 'production',
        AUTH_JWKS_URL: 'http://identity.example.com/.well-known/jwks.json',
        AUTH_JWT_ISSUER: issuer,
        AUTH_JWT_AUDIENCE: audience,
      }),
    ).toThrow(/HTTPS URL/);
    expect(() =>
      createIdentityVerifier({
        NODE_ENV: 'production',
        AUTH_JWKS_URL: 'https://identity.example.com/.well-known/jwks.json',
        AUTH_JWT_ISSUER: issuer,
        AUTH_JWT_AUDIENCE: audience,
        AUTH_JWT_ALGORITHMS: 'HS256',
      }),
    ).toThrow(/asymmetric algorithms/);
  });

  it('creates a production verifier from complete settings without fetching keys eagerly', () => {
    expect(
      createIdentityVerifier({
        NODE_ENV: 'production',
        AUTH_JWKS_URL: 'https://identity.example.com/.well-known/jwks.json',
        AUTH_JWT_ISSUER: issuer,
        AUTH_JWT_AUDIENCE: `${audience},sur-admin`,
        AUTH_JWT_ALGORITHMS: 'RS256,ES256',
      }),
    ).toBeInstanceOf(JwtIdentityVerifier);
  });
});
