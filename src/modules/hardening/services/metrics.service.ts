import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration: Histogram<string>;
  readonly businessCounter: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration by route and status',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.businessCounter = new Counter({
      name: 'sserp_business_events_total',
      help: 'Business event counters',
      labelNames: ['event'],
      registers: [this.registry],
    });
  }

  async metricsText() {
    return this.registry.metrics();
  }
}
