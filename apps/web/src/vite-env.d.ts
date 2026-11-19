/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" shows the Turnstile human check; anything else (or unset) hides it. */
  readonly VITE_TURNSTILE_ENABLED?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
