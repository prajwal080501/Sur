import { DevelopmentIdentityVerifier } from './development-identity-verifier.js';
import type { IdentityVerifier } from './identity.js';
import { createJwtIdentityVerifier } from './jwt-identity-verifier.js';

export function createIdentityVerifier(environment: NodeJS.ProcessEnv): IdentityVerifier {
  const nodeEnvironment = environment.NODE_ENV;
  const mode =
    environment.SUR_AUTH_MODE ??
    (nodeEnvironment === 'development' || nodeEnvironment === 'test' ? 'development' : 'jwt');

  if (mode === 'development') {
    if (nodeEnvironment !== 'development' && nodeEnvironment !== 'test') {
      throw new Error('SUR_AUTH_MODE=development is only allowed outside production');
    }
    return new DevelopmentIdentityVerifier(nodeEnvironment);
  }
  if (mode === 'jwt') return createJwtIdentityVerifier(environment);
  throw new Error(`Unsupported SUR_AUTH_MODE: ${mode}`);
}
