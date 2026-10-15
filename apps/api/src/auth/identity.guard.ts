import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IDENTITY_VERIFIER, type AuthenticatedRequest, type IdentityVerifier } from './identity.js';

@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(@Inject(IDENTITY_VERIFIER) private readonly verifier: IdentityVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const identity = await this.verifier.verify(request);
    if (!identity) {
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHORIZED',
          message: 'A valid bearer token is required',
          details: {},
        },
      });
    }
    (request as AuthenticatedRequest).identity = identity;
    return true;
  }
}
