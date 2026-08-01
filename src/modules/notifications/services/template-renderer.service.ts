import { Injectable, Logger } from '@nestjs/common';
import Handlebars from 'handlebars';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { NotificationChannel } from '../constants';

const SMS_MAX_LENGTH = 320;

Handlebars.registerHelper('formatDate', (value: unknown, _fmt: string) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toISOString().slice(0, 10);
});

Handlebars.registerHelper(
  'formatCurrency',
  (value: unknown, currency = 'BDT') => {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  },
);

export interface RenderInput {
  template: string;
  subject?: string | null;
  variables: Record<string, unknown>;
  declaredVariables: string[];
  channel: NotificationChannel;
}

export interface RenderResult {
  subject?: string;
  body: string;
  truncated?: boolean;
}

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);

  validateTemplate(body: string, declaredVariables: string[]): void {
    const refs = this.extractVariableRefs(body);
    const undeclared = refs.filter((r) => !declaredVariables.includes(r));
    if (undeclared.length) {
      throw DomainException.withCode(
        ErrorCode.TEMPLATE_VARIABLE_MISSING,
        422,
        `Template references undeclared variables: ${undeclared.join(', ')}`,
        { undeclared },
      );
    }
  }

  render(input: RenderInput): RenderResult {
    this.assertVariablesPresent(input.variables, input.declaredVariables);

    const compileOpts = { strict: true, noEscape: input.channel !== 'email' };
    const bodyTpl = Handlebars.compile(input.template, compileOpts);
    let body = bodyTpl(input.variables);

    if (input.channel === 'email') {
      body = this.sanitizeEmailHtml(body);
    } else if (input.channel === 'sms') {
      body = body.replace(/<[^>]+>/g, '').trim();
    }

    let truncated = false;
    if (input.channel === 'sms' && body.length > SMS_MAX_LENGTH) {
      body = this.truncateSms(body);
      truncated = true;
      this.logger.warn(`SMS body truncated to ${SMS_MAX_LENGTH} chars`);
    }

    let subject: string | undefined;
    if (input.subject) {
      const subjectTpl = Handlebars.compile(input.subject, compileOpts);
      subject = subjectTpl(input.variables);
    }

    return { subject, body, truncated };
  }

  private assertVariablesPresent(
    variables: Record<string, unknown>,
    declared: string[],
  ): void {
    const missing = declared.filter(
      (key) => variables[key] === undefined || variables[key] === null,
    );
    if (missing.length) {
      throw DomainException.withCode(
        ErrorCode.TEMPLATE_VARIABLE_MISSING,
        422,
        `Missing template variables: ${missing.join(', ')}`,
        { missing },
      );
    }
  }

  private extractVariableRefs(template: string): string[] {
    const refs = new Set<string>();
    const re = /\{\{([#/^>!&]?)([^}\s/]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(template))) {
      const name = m[2];
      if (!['this', 'else', 'each', 'if', 'unless', 'with'].includes(name)) {
        refs.add(name.split('.')[0]);
      }
    }
    return [...refs];
  }

  private sanitizeEmailHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }

  private truncateSms(text: string): string {
    const limit = SMS_MAX_LENGTH - 1;
    if (text.length <= limit) return text;
    const slice = text.slice(0, limit);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice;
    return `${cut}…`;
  }
}
