/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
