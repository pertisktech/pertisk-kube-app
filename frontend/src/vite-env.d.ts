/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare global {
  interface Window {
    __PERTISK_CONFIG__?: {
      backendUrl?: string;
      topRightTitle?: string;
    };
  }
}

export {};
