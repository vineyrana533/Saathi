import { handlePaymentWebhook } from '@/modules/payments/service';
import { errorResponse } from '@/platform/http';

/**
 * Gateway webhooks. Raw body is used for signature verification. Duplicates return 200 so the
 * gateway stops retrying; bad signatures return 401 and are not stored.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const raw = await req.text();
    const signature = req.headers.get('x-saathi-signature') ?? req.headers.get('x-razorpay-signature');
    const out = await handlePaymentWebhook(provider, raw, signature);
    if (out.status === 'rejected') return Response.json({ error: out.reason }, { status: out.reason === 'bad_signature' ? 401 : 400 });
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
