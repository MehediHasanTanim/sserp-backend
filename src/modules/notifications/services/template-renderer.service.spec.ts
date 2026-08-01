import { TemplateRendererService } from './template-renderer.service';
import { ErrorCode } from '../../../shared/errors/domain-exception';

describe('TemplateRendererService', () => {
  const renderer = new TemplateRendererService();

  it('renders when all variables present', () => {
    const result = renderer.render({
      template: 'Hello {{name}}',
      variables: { name: 'Ada', title: 't', body: 'b' },
      declaredVariables: ['name', 'title', 'body'],
      channel: 'email',
    });
    expect(result.body).toContain('Ada');
  });

  it('throws on missing variable', () => {
    try {
      renderer.render({
        template: 'Hello {{name}}',
        variables: { title: 't', body: 'b' },
        declaredVariables: ['name', 'title', 'body'],
        channel: 'email',
      });
      fail('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: ErrorCode.TEMPLATE_VARIABLE_MISSING });
    }
  });

  it('rejects undeclared variable at validate time', () => {
    try {
      renderer.validateTemplate('Hi {{extra}}', ['title']);
      fail('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: ErrorCode.TEMPLATE_VARIABLE_MISSING });
    }
  });

  it('strips HTML for SMS', () => {
    const result = renderer.render({
      template: '<b>Hi</b> {{title}}',
      variables: { title: 'there', body: 'b' },
      declaredVariables: ['title', 'body'],
      channel: 'sms',
    });
    expect(result.body).not.toContain('<b>');
  });

  it('truncates long SMS at word boundary', () => {
    const long = 'word '.repeat(100);
    const result = renderer.render({
      template: long + '{{title}}',
      variables: { title: '', body: 'b' },
      declaredVariables: ['title', 'body'],
      channel: 'sms',
    });
    expect(result.body.length).toBeLessThanOrEqual(320);
    expect(result.truncated).toBe(true);
  });
});
