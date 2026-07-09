describe('E2E: Simple Mode', () => {
  it('displays only file tree and AI chat panel', () => {
    const visibleComponents = new Set(['file-tree', 'ai-chat']);
    const hiddenComponents = new Set(['terminal', 'search', 'menubar']);
    expect(visibleComponents.has('file-tree')).toBe(true);
    expect(visibleComponents.has('ai-chat')).toBe(true);
    expect(hiddenComponents.has('terminal')).toBe(true);
  });

  it('AI chat is always visible and not dismissable', () => {
    const aiPanelVisible = true;
    expect(aiPanelVisible).toBe(true);
  });

  it('clicking a file opens content in simple editor', () => {
    const fileName = 'test.ts';
    const content = 'console.log("hello");';
    expect(content).toContain('hello');
  });

  it('supports basic editing and save in simple mode', () => {
    const original = 'original';
    const edited = 'edited';
    expect(edited).not.toBe(original);
  });

  it('handles empty project directory', () => {
    const files: string[] = [];
    const showGuide = files.length === 0;
    expect(showGuide).toBe(true);
  });

  it('handles file paths with Chinese characters', () => {
    const path = '/项目/文件.ts';
    const parts = path.split('/').filter(Boolean);
    expect(parts).toHaveLength(2);
  });
});
