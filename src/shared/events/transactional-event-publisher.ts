import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TransactionalEventPublisher {
  private buffer: Array<{ event: string; payload: unknown }> = [];

  constructor(private readonly emitter: EventEmitter2) {}

  enqueue(event: string, payload: unknown) {
    this.buffer.push({ event, payload });
  }

  async flush() {
    const items = [...this.buffer];
    this.buffer = [];
    for (const item of items) {
      await this.emitter.emitAsync(item.event, item.payload);
    }
  }

  clear() {
    this.buffer = [];
  }
}
