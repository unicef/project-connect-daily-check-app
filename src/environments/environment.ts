import { environment as env } from './_environment.prod';

const environmentConfig = {
  prod: {
    restApi: env.restAPI,
    token: env.token,
    matomoSiteId: (env as any).matomoSiteIdProd,
    posthogKey: (env as any).posthogKeyProd,
  },
  dev: {
    restApi: env.restAPIDev,
    token: env.tokenDev,
    matomoSiteId: (env as any).matomoSiteIdDev,
    posthogKey: (env as any).posthogKeyDev,
  },
  stg: {
    restApi: env.restAPIStg,
    token: env.tokenStg,
    matomoSiteId: (env as any).matomoSiteIdStg,
    posthogKey: (env as any).posthogKeyStg,
  },
};
export const environment = {
  isElectron: window && window.process && window.process.type,
  production: env.mode === 'prod' ? true : false,
  mode: env.mode,
  // restAPI: 'https://uni-connect-services.azurewebsites.net/api/v1/',
  restAPI: environmentConfig[env.mode].restApi,
  token: environmentConfig[env.mode].token,
  matomo: {
    trackerUrl: (env as any).matomoTrackerUrl as string,
    siteId: environmentConfig[env.mode].matomoSiteId as string,
  },
  posthog: {
    // PostHog project API key (the equivalent of Sentry's DSN). Without a key
    // the service does not start: an unconfigured build simply sends nothing.
    apiKey: environmentConfig[env.mode].posthogKey as string,
    // EU region by default: school data must not leave for the US without an
    // explicit decision.
    host: ((env as any).posthogHost as string) || 'https://eu.i.posthog.com',
    // Session replay records the user's screen. It stays off unless explicitly
    // enabled: its scope is still being defined, and in schools it is a privacy
    // decision.
    enableSessionRecording:
      (env as any).posthogEnableSessionRecording === true,
  },
  app_version: '2.0.4',
  appName: 'Giga Meter',
  appNameSuffix: '',
  showAboutMenu: true,
  ipInfoToken: env.ipInfoToken,
  languages: [
    {
      name: 'En',
      label: 'English',
      code: 'en',
    },
    {
      name: 'Es',
      label: 'Español',
      code: 'es',
    },
    {
      name: 'Pt',
      label: 'Português',
      code: 'pt',
    },
    {
      name: 'Ru',
      label: 'Russian',
      code: 'ru',
    },
    {
      name: 'Fr',
      label: 'French',
      code: 'fr',
    },
    {
      name: 'Mn',
      label: 'Монгол',
      code: 'mn',
    },
    {
      name: 'Uz',
      label: "O'zbekcha",
      code: 'uz',
    },
  ],
};
