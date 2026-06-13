/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_GA_ID?: string;
  readonly PUBLIC_ENABLE_ANALYTICS?: string;
  readonly PUBLIC_ENABLE_ERROR_TRACKING?: string;
  readonly PUBLIC_TTS_VOICE?: string;
  readonly PUBLIC_TTS_SPEED?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}