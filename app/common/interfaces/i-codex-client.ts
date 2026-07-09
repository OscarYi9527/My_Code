import { ChatSendRequest, ChatSendResponse, ChatChunk } from '../types/chat.types';

export interface ICodexClient {
  sendMessage(request: ChatSendRequest): Promise<ChatSendResponse>;
  streamChunks(
    request: ChatSendRequest,
    onChunk: (chunk: ChatChunk) => void,
  ): Promise<void>;
}
