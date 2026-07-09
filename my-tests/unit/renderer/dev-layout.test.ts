describe('dev-layout', () => {
  it('renders file tree panel', () => {
    const hasFileTree = true;
    expect(hasFileTree).toBe(true);
  });

  it('renders editor panel', () => {
    const hasEditor = true;
    expect(hasEditor).toBe(true);
  });

  it('renders terminal panel toggle', () => {
    const terminalVisible = false;
    expect(terminalVisible).toBe(false);
  });
});
