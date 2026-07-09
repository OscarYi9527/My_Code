const PROXY_URL = 'http://localhost:3000';
const CODEX_PROXY_PATH = process.env.CODEX_PROXY_PATH || '.codex/proxy';

export interface CodexMessage {
  message: string;
  conversationId?: string;
  contextFiles?: string[];
}

export interface CodexChunk {
  chunk: string;
  done: boolean;
}

export async function sendToCodex(
  request: CodexMessage,
  onChunk: (chunk: CodexChunk) => void,
): Promise<string> {
  void CODEX_PROXY_PATH;

  try {
    const res = await fetch(`${PROXY_URL}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-codex',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: request.message },
        ],
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Codex proxy returned ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let conversationId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter((l) => l.startsWith('data: '));
      for (const line of lines) {
        try {
          const json = JSON.parse(line.slice(6));
          if (json.type === 'content_block_delta') {
            onChunk({ chunk: json.delta?.text || '', done: false });
          }
          if (json.conversation_id) {
            conversationId = json.conversation_id;
          }
        } catch {
          // Skip parse errors for non-JSON SSE lines
        }
      }
    }
    onChunk({ chunk: '', done: true });
    return conversationId;
  } catch (e) {
    throw new Error(`Codex connection failed: ${(e as Error).message}`);
  }
}
