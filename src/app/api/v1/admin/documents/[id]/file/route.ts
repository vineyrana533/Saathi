import { api } from '@/platform/http';
import { readDocumentFile } from '@/modules/workers/service';

/**
 * Verifiers and admins can open any document; a worker can open only their own (row-level security).
 * Decrypted on the fly, never cached, every view audit logged.
 */
export const GET = api<{ id: string }>(async (_req, { ctx, params }) => {
  const file = await readDocumentFile(ctx, params.id);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
