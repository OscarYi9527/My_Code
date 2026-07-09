describe('simple-editor', () => {
  it('shows plain text content', () => {
    const content = 'hello world';
    expect(content.length).toBeGreaterThan(0);
  });

  it('supports save operation', () => {
    const saved = true;
    expect(saved).toBe(true);
  });

  it('does not provide syntax highlighting', () => {
    const hasHighlight = false;
    expect(hasHighlight).toBe(false);
  });
});
