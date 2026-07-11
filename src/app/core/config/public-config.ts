import { environment } from '../../../environments/environment';

type PublicKey =
  | 'API_BASE_URL'
  | 'SITE_CODE'
  | 'PRIVACY_POLICY_VERSION'
  | 'TURNSTILE_SITE_KEY'
  | 'APP_ENV';

/** Cloudflare Turnstile always-passes test sitekey (local only). */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

function readPublic(key: PublicKey, fallback: string): string {
  if (typeof globalThis !== 'undefined') {
    const runtime = (globalThis as { __KOLSS_PUBLIC__?: Record<string, string> }).__KOLSS_PUBLIC__;
    const injected = runtime?.[key];
    if (typeof injected === 'string' && injected.length > 0) {
      return injected;
    }
  }

  const fromEnv = environment[key];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv;
  }

  return fallback;
}

/** Absolute DigitalOcean API origin — never use window.location.origin in production. */
export const API_BASE_URL = readPublic('API_BASE_URL', 'http://localhost:8080').replace(/\/$/, '');
export const SITE_CODE = readPublic('SITE_CODE', 'kolss-ua');
export const PRIVACY_POLICY_VERSION = readPublic('PRIVACY_POLICY_VERSION', 'ua-v1');
export const TURNSTILE_SITE_KEY = readPublic('TURNSTILE_SITE_KEY', '');
export const APP_ENV = readPublic('APP_ENV', 'local');

/**
 * Effective Turnstile site key:
 * - configured key when set
 * - Cloudflare test key when APP_ENV=local and key empty
 * - empty otherwise (widget skipped; bot_token sent as '')
 */
export function resolveTurnstileSiteKey(): string {
  if (TURNSTILE_SITE_KEY) {
    return TURNSTILE_SITE_KEY;
  }
  if (APP_ENV === 'local') {
    return TURNSTILE_TEST_SITE_KEY;
  }
  return '';
}

export function isTurnstileEnabled(): boolean {
  return resolveTurnstileSiteKey().length > 0;
}
