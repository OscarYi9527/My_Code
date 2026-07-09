const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;

export function startUpdateCheck(onUpdateAvailable: (version: string, notes: string, url: string) => void): () => void {
  let lastVersion: string | null = null;

  const check = async (): Promise<void> => {
    try {
      const res = await fetch('http://localhost:3001/api/update/check');
      if (!res.ok) return;
      const data = await res.json();
      if (data.version && data.version !== lastVersion) {
        lastVersion = data.version;
        onUpdateAvailable(data.version, data.releaseNotes || '', data.downloadUrl || '');
      }
    } catch {
      // Retry next interval
    }
  };

  check();
  const timer = setInterval(check, UPDATE_CHECK_INTERVAL);
  return () => clearInterval(timer);
}
