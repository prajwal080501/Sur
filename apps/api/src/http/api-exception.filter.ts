import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JobError, type JobErrorCode } from '@sur/job-domain';
import { ShareError, type ShareErrorCode } from '@sur/share-domain';
import type { Response } from 'express';

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: unknown;
  };
}

const shareErrorStatus: Record<ShareErrorCode, number> = {
  TAKE_NOT_FOUND: HttpStatus.NOT_FOUND,
  TAKE_NOT_CLOUD_READY: HttpStatus.CONFLICT,
  STEMS_NOT_SHAREABLE: HttpStatus.FORBIDDEN,
  INVALID_EXPIRY: HttpStatus.UNPROCESSABLE_ENTITY,
  SHARE_NOT_FOUND: HttpStatus.NOT_FOUND,
  SHARE_GONE: HttpStatus.GONE,
  SHARE_SLUG_EXHAUSTED: HttpStatus.INTERNAL_SERVER_ERROR,
};

const jobErrorStatus: Record<JobErrorCode, number> = {
  TAKE_NOT_FOUND: HttpStatus.NOT_FOUND,
  TAKE_NOT_CLOUD_READY: HttpStatus.CONFLICT,
  STEMS_NOT_SHAREABLE: HttpStatus.FORBIDDEN,
  JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_JOB_TRANSITION: HttpStatus.CONFLICT,
};

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ShareError) {
      response.status(shareErrorStatus[exception.code]).json({
        error: { code: exception.code, message: exception.message, details: {} },
      });
      return;
    }
    if (exception instanceof JobError) {
      response.status(jobErrorStatus[exception.code]).json({
        error: { code: exception.code, message: exception.message, details: {} },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(
        isErrorEnvelope(body)
          ? body
          : {
              error: {
                code: `HTTP_${status}`,
                message: exception.message,
                details: {},
              },
            },
      );
      return;
    }
    this.logger.error(
      'Unhandled request error',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: {},
      },
    });
  }
}
