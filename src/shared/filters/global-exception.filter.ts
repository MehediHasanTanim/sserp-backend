import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException, ErrorCode } from '../errors/domain-exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof DomainException) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        if (Array.isArray(obj.message)) {
          message = 'Validation failed';
          details = { errors: obj.message };
          code = ErrorCode.VALIDATION_ERROR;
        }
      }
      if (status === 401) code = ErrorCode.UNAUTHENTICATED;
      if (status === 403) code = ErrorCode.FORBIDDEN;
      if (status === 404) code = ErrorCode.NOT_FOUND;
      if (status === 429) code = ErrorCode.RATE_LIMITED;
    } else {
      this.logger.error(exception);
    }

    response.status(status).json({
      success: false,
      error: { code, message, details },
      meta: { requestId, timestamp: new Date().toISOString() },
    });
  }
}
