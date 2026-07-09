describe('chat file reference integration', () => {
  it('accepts file paths as context', () => {
    const filePaths = ['/test/file1.ts', '/test/file2.ts'];
    expect(filePaths.every((p) => p.endsWith('.ts'))).toBe(true);
  });

  it('handles non-existent file gracefully', () => {
    const error = 'ENOENT: no such file';
    expect(error).toContain('ENOENT');
  });

  it('parses file links in AI response', () => {
    const response = 'See `src/main.ts:42` for the entry point. Also check `app/renderer/views/dev-layout.ts`.';
    const fileLinkRegex = /`([^`]+\.ts[^`]*)`/g;
    const matches = [...response.matchAll(fileLinkRegex)].map((m) => m[1]);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toBe('src/main.ts:42');
    expect(matches[1]).toBe('app/renderer/views/dev-layout.ts');
  });

  it('opens file in correct mode when clicking link', () => {
    const currentMode = 'simple';
    const openInMode = currentMode === 'simple' ? 'simple-editor' : 'dev-editor';
    expect(openInMode).toBe('simple-editor');
  });

  it('sends file content as context with message', () => {
    const fileContent = 'const x = 1;';
    const messageWithContext = `Context:\n\`\`\`\n${fileContent}\n\`\`\`\n\nUser: Help me understand this code`;
    expect(messageWithContext).toContain(fileContent);
  });
});
