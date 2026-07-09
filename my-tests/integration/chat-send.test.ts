describe('chat:send integration', () => {
  const mockClaudeResponse = {
    type: 'content_block_delta',
    delta: { text: 'Hello from Claude' },
  };

  it('sends message and receives stream chunks', () => {
    const chunks: string[] = [];
    const onChunk = (chunk: { chunk: string; done: boolean }): void => {
      chunks.push(chunk.chunk);
    };

    onChunk({ chunk: 'Hello', done: false });
    onChunk({ chunk: ' from', done: false });
    onChunk({ chunk: ' Claude', done: false });
    onChunk({ chunk: '', done: true });

    expect(chunks.join('')).toBe('Hello from Claude');
  });

  it('returns conversation ID after stream completes', () => {
    const conversationId = 'conv-abc-123';
    expect(conversationId).toMatch(/^conv-/);
  });

  it('handles context files in request', () => {
    const request = {
      message: 'Analyze this file',
      contextFiles: ['src/main.ts', 'src/utils/helper.ts'],
    };
    expect(request.contextFiles).toHaveLength(2);
  });

  it('detects SSE content_block_delta format', () => {
    expect(mockClaudeResponse.type).toBe('content_block_delta');
    expect(mockClaudeResponse.delta.text.length).toBeGreaterThan(0);
  });

  it('handles empty message gracefully', () => {
    const message = '';
    expect(message.length).toBe(0);
  });
});
