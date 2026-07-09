export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatChunk {
  conversationId: string;
  chunk: string;
  done: boolean;
}

export interface FileReference {
  filePath: string;
  fileName: string;
  language: string;
}

export interface ChatSendRequest {
  message: string;
  conversationId?: string;
  contextFiles?: string[];
}

export interface ChatSendResponse {
  conversationId: string;
}
