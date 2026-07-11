/**
 * Local / development defaults.
 * Production builds replace this file via angular.json fileReplacements,
 * or overwrite values with `npm run prebuild` (scripts/write-public-env.mjs).
 */
export const environment = {
  API_BASE_URL: 'http://localhost:8080',
  SITE_CODE: 'kolss-ua',
  PRIVACY_POLICY_VERSION: 'ua-v1',
  TURNSTILE_SITE_KEY: '',
  APP_ENV: 'local',
};
