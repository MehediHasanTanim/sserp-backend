import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((data) => {
        if (res.statusCode === 204) return data;
        if (data && typeof data === 'object' && 'success' in (data as object)) {
          return data;
        }
        return {
          success: true,
          data,
          meta: {
            requestId: req.requestId,
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}
