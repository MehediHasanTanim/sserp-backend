import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: Request & { requestId?: string },
    res: Response,
    next: NextFunction,
  ) {
    const incoming = req.header('x-request-id');
    const requestId = incoming && incoming.trim() ? incoming.trim() : uuidv4();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
