import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface RawBodyRequest extends Request {
  readonly rawBody?: Buffer;
}

export const WORKER_CALLBACK_SECRET = Symbol('WORKER_CALLBACK_SECRET');

export function workerCallbackSecret(environment: NodeJS.ProcessEnv): string {
  const configured = environment.WORKER_CALLBACK_SECRET;
  const secret =
    configured ??
    (environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test'
      ? 'development-worker-callback-secret'
      : undefined);
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('WORKER_CALLBACK_SECRET must contain at least 32 bytes');
  }
  return secret;
}

@Injectable()
export class WorkerCallbackGuard implements CanActivate {
  constructor(@Inject(WORKER_CALLBACK_SECRET) private readonly secret: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const timestampHeader = request.header('x-sur-timestamp');
    const signatureHeader = request.header('x-sur-signature');
    const timestamp = Number(timestampHeader);
    if (
      !request.rawBody ||
      !timestampHeader ||
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 ||
      !signatureHeader?.startsWith('sha256=')
    ) {
      throw this.unauthorized();
    }

    const suppliedHex = signatureHeader.slice('sha256='.length);
    if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) throw this.unauthorized();
    const expected = createHmac('sha256', this.secret)
      .update(`${timestampHeader}.`)
      .update(request.rawBody)
      .digest();
    const supplied = Buffer.from(suppliedHex, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw this.unauthorized();
    }
    return true;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      error: {
        code: 'INVALID_WORKER_SIGNATURE',
        message: 'A valid worker signature is required',
        details: {},
      },
    });
  }
}
