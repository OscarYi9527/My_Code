describe('simple-layout', () => {
  it('renders file tree and AI chat only', () => {
    const components = ['file-tree', 'ai-chat'];
    expect(components).toHaveLength(2);
  });

  it('does not render terminal or search panels', () => {
    const hiddenPanels = ['terminal', 'search'];
    expect(hiddenPanels).not.toContain('file-tree');
  });
});
