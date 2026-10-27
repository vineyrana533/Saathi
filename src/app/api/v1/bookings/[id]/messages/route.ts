import { api, jsonBody } from '@/platform/http';
import { chatInput, listChatMessages, sendChatMessage } from '@/modules/chat/service';

export const GET = api<{ id: string }>(async (_req, { ctx, params }) => ({ messages: await listChatMessages(ctx, params.id) }));

export const POST = api<{ id: string }>(async (req, { ctx, params }) => {
  const input = chatInput.parse(await jsonBody(req));
  return sendChatMessage(ctx, params.id, input);
});
