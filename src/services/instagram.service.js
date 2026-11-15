import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const client = axios.create({ baseURL: `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`, timeout: 10000 });
function safeGraphError(error) {
  const graph = error.response?.data?.error;
  const details = { status: error.response?.status, code: graph?.code, subcode: graph?.error_subcode, type: graph?.type, message: graph?.message ?? error.message };
  logger.error(details, 'Instagram Graph API request failed');
  const wrapped = new Error(graph?.message ?? 'Instagram Graph API request failed');
  wrapped.status = error.response?.status ?? 502;
  wrapped.code = graph?.code;
  wrapped.subcode = graph?.error_subcode;
  throw wrapped;
}

export async function sendTextMessage(recipientId, text) {
  if (!env.META_ACCESS_TOKEN) throw new Error('META_ACCESS_TOKEN is not configured');
  try {
    const { data } = await client.post(`/${env.META_PAGE_ID}/messages`, { recipient: { id: String(recipientId) }, message: { text } }, { headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` } });
    return data;
  } catch (error) { return safeGraphError(error); }
}
export async function replyToIncomingMessage(message, text) {
  if (!message?.senderId) throw new TypeError('Incoming message senderId is required');
  return sendTextMessage(message.senderId, text);
}
export async function sendReelUrl(recipientId, reelUrl) {
  return sendTextMessage(recipientId, `Here is the Reel: ${reelUrl}`);
}
