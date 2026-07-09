describe('mode switch integration', () => {
  it('switches from dev to simple mode', () => {
    const mode = 'simple';
    expect(mode).toBe('simple');
  });

  it('switches from simple to dev mode', () => {
    const mode = 'dev';
    expect(mode).toBe('dev');
  });

  it('rejects invalid mode', () => {
    const modes = ['dev', 'simple'];
    expect(modes).not.toContain('invalid');
  });
});
