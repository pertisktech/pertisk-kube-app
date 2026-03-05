// Get version from environment variable set at build time
// In Docker builds, this is set via VITE_APP_VERSION env var
// In local development, defaults to package.json version
export const getAppVersion = (): string => {
  try {
    // Vite environment variables are available via import.meta.env
    let version = import.meta.env.VITE_APP_VERSION;
    if (version) {
      // Remove leading 'v' if present to avoid double 'v' in display
      return version.replace(/^v+/, '');
    }
    // Fallback to default version
    return '0.1.0';
  } catch {
    return '0.1.0';
  }
};

export const APP_VERSION = getAppVersion();
