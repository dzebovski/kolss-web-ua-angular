/**
 * Production placeholders.
 * Prefer baking real values at build time:
 *   API_BASE_URL=https://your-do-app.ondigitalocean.app npm run prebuild
 * which rewrites this file via scripts/write-public-env.mjs.
 *
 * Env vars: API_BASE_URL, TURNSTILE_SITE_KEY, SITE_CODE,
 * PRIVACY_POLICY_VERSION, APP_ENV (also accepts NG_APP_* prefixes).
 */
export const environment = {
  API_BASE_URL: 'https://api.kolss.example',
  SITE_CODE: 'kolss-ua',
  PRIVACY_POLICY_VERSION: 'ua-v1',
  TURNSTILE_SITE_KEY: '',
  APP_ENV: 'production',
};
