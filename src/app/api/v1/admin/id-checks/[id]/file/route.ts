import { api } from '@/platform/http';
import { readIdCheckFile } from '@/modules/identity/id-check';

/** Verifiers and admins only. Decrypted on the fly, never cached, every view audit logged. */
export const GET = api<{ id: string }>(async (_req, { ctx, params }) => {
  const file = await readIdCheckFile(ctx, params.id);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
