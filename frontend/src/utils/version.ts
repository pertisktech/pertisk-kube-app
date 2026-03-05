// Get version from environment variable set at build time
// In Docker builds, this is set via VITE_APP_VERSION env var
// In local development, defaults to package.json version
export const getAppVersion = (): string => {
  try {
    // Vite environment variables are available via import.meta.env
    let version = import.meta.env.VITE_APP_VERSION as string | undefined;
    if (version && version.trim()) {
      // Remove leading 'v' if present to avoid double 'v' in display
      version = version.trim().replace(/^v+/, '');
      // Ensure we have a non-empty version string
      if (version.length > 0) {
        return version;
      }
    }
    // Fallback to default version
    return '0.1.0';
  } catch {
    return '0.1.0';
  }
};

export const APP_VERSION = getAppVersion();
