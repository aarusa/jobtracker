/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin in production (e.g. https://api.example.com). Empty in local Vite. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
