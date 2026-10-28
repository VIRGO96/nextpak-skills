/// <reference types="vite/client" />

// Type every VITE_ variable. No imports in this file, or the augmentation stops working.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
