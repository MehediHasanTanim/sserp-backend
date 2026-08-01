import { SslCommerzStubGateway } from '../../src/modules/hardening/providers/optional-integrations';

describe('Payment gateway stub (H-08)', () => {
  it('accepts webhook once per gateway txn id', async () => {
    const gw = new SslCommerzStubGateway();
    const body = { tran_id: 't1', amount: '100', signature: 'sig' };
    const first = await gw.verifyWebhook({ 'x-ssl-signature': 'sig' }, body);
    const second = await gw.verifyWebhook({ 'x-ssl-signature': 'sig' }, body);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it('rejects missing signature', async () => {
    const gw = new SslCommerzStubGateway();
    const res = await gw.verifyWebhook({}, { tran_id: 't2', amount: '10' });
    expect(res.ok).toBe(false);
  });
});
