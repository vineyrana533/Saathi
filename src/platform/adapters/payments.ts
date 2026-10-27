import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env';
import { hmacHex, safeEqualHex } from '../crypto';

/**
 * Payment gateway adapter (decisions.md V-01, V-02). The sandbox gateway behaves like a real
 * one from the platform's point of view: orders, then HMAC-signed webhooks that go through the
 * same verification and idempotent processing as live webhooks. No real money moves.
 * A Razorpay implementation is not written yet: it needs merchant approval and test keys.
 */
export interface GatewayOrder {
  orderId: string;
}

export const webhookEventSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['payment.captured', 'payment.failed']),
  data: z.object({
    orderId: z.string().min(1),
    paymentId: z.string().min(1),
    amountPaise: z.number().int().positive(),
  }),
  createdAt: z.string(),
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export interface PaymentGateway {
  readonly provider: 'sandbox';
  readonly mode: 'sandbox' | 'live';
  createOrder(input: { amountPaise: number; receipt: string }): Promise<GatewayOrder>;
  verifySignature(rawBody: string, signature: string | null): boolean;
}

export const sandboxGateway: PaymentGateway & {
  /** Simulates the customer paying on the hosted page; returns the signed webhook the gateway would send. */
  simulatePayment(input: { orderId: string; amountPaise: number; outcome: 'captured' | 'failed' }): {
    rawBody: string;
    signature: string;
  };
} = {
  provider: 'sandbox',
  mode: 'sandbox',
  async createOrder() {
    return { orderId: `order_sbx_${randomBytes(9).toString('hex')}` };
  },
  verifySignature(rawBody, signature) {
    if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
    return safeEqualHex(hmacHex(env().SANDBOX_WEBHOOK_SECRET, rawBody), signature);
  },
  simulatePayment({ orderId, amountPaise, outcome }) {
    const event: WebhookEvent = {
      id: `evt_sbx_${randomBytes(9).toString('hex')}`,
      type: outcome === 'captured' ? 'payment.captured' : 'payment.failed',
      data: { orderId, paymentId: `pay_sbx_${randomBytes(9).toString('hex')}`, amountPaise },
      createdAt: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(event);
    return { rawBody, signature: hmacHex(env().SANDBOX_WEBHOOK_SECRET, rawBody) };
  },
};

export function paymentGateway(): PaymentGateway {
  if (env().PAYMENTS_MODE === 'live') {
    throw new Error('Live payments are not available: gateway approval and adapter pending (decisions.md V-01)');
  }
  return sandboxGateway;
}

export function gatewayByProvider(provider: string): PaymentGateway | null {
  return provider === 'sandbox' ? sandboxGateway : null;
}
