const isTauriRuntime = (): boolean => {
  return typeof window !== 'undefined' && typeof (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';
};

export const openExternalUrl = async (url: string): Promise<void> => {
  if (!url) return;

  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_url', { url });
      return;
    } catch {
      // Fall through to browser strategies.
    }
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) return;

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    window.location.assign(url);
  }
};
