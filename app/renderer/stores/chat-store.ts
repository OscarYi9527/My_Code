export interface ChatState {
  conversations: Map<string, { id: string; title: string; messages: { role: 'user' | 'assistant'; content: string; timestamp: string }[]; createdAt: string }>;
  activeConversationId: string | null;
  isStreaming: boolean;
}

export function initChatStore(): ChatState {
  return { conversations: new Map(), activeConversationId: null, isStreaming: false };
}

export function addMessage(state: ChatState, conversationId: string, role: 'user' | 'assistant', content: string): ChatState {
  const convs = new Map(state.conversations);
  const conv = convs.get(conversationId);
  if (conv) {
    conv.messages.push({ role, content, timestamp: new Date().toISOString() });
    convs.set(conversationId, conv);
  }
  return { ...state, conversations: convs };
}

export function createConversation(state: ChatState, id: string, title: string): ChatState {
  const convs = new Map(state.conversations);
  convs.set(id, { id, title, messages: [], createdAt: new Date().toISOString() });
  return { ...state, conversations: convs, activeConversationId: id };
}

export function setStreaming(state: ChatState, isStreaming: boolean): ChatState {
  return { ...state, isStreaming };
}
