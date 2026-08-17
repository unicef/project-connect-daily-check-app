import { environment as env } from './_environment.prod';

const environmentConfig = {
  prod: {
    restApi: env.restAPI,
    token: env.token,
    matomoSiteId: (env as any).matomoSiteIdProd,
  },
  dev: {
    restApi: env.restAPIDev,
    token: env.tokenDev,
    matomoSiteId: (env as any).matomoSiteIdDev,
  },
  stg: {
    restApi: env.restAPIStg,
    token: env.tokenStg,
    matomoSiteId: (env as any).matomoSiteIdStg,
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
    apiKey: (env as any).posthogApiKey as string,
    host: ((env as any).posthogHost as string) || 'https://eu.i.posthog.com',
  },
  app_version: '2.0.3',
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
      name: 'Uz',
      label: "O'zbekcha",
      code: 'uz',
    },
  ],
};
