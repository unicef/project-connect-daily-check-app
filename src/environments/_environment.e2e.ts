// E2E environment — replaces the gitignored `_environment.prod.ts` when the app
// is served with `ng serve --configuration e2e` (see angular.json fileReplacements).
// Points every mode at the local docker backend started by
// `e2e/docker-compose.e2e.yml`, which validates tokens against a local mock
// that accepts anything — so the token values are placeholders.
export const environment = {
  production: false,
  mode: 'dev',

  restAPI: 'http://localhost:3000/api/v1/',
  token: 'e2e-local-token',

  restAPIDev: 'http://localhost:3000/api/v1/',
  tokenDev: 'e2e-local-token',

  restAPIStg: 'http://localhost:3000/api/v1/',
  tokenStg: 'e2e-local-token',

  // The Playwright suite intercepts api.ipinfo.io, so this token is never used.
  ipInfoToken: 'e2e-local-token',

  // PostHog stays off in e2e: an empty key makes the service no-op, so the
  // suite never sends analytics to a real project.
  posthogHost: '',
  posthogKeyDev: '',
  posthogKeyStg: '',
  posthogKeyProd: '',
  posthogEnableSessionRecording: false,
};
