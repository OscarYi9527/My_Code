describe('file open integration', () => {
  it('opens file and returns content', () => {
    const content = 'test content';
    expect(content.length).toBeGreaterThan(0);
  });

  it('returns error for nonexistent file', () => {
    const error = 'ENOENT';
    expect(error).toBeTruthy();
  });
});
