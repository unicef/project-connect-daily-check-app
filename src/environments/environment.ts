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
    // Project API key de PostHog (lo que en Sentry sería el DSN). Sin clave, el
    // servicio no arranca: un build sin configurar simplemente no manda nada.
    apiKey: environmentConfig[env.mode].posthogKey as string,
    // Región EU por defecto: los datos de escuelas no deben salir a US salvo
    // decisión explícita.
    host: ((env as any).posthogHost as string) || 'https://eu.i.posthog.com',
    // Session replay graba la pantalla del usuario. Queda apagado salvo que se
    // active explícitamente: el alcance lo está definiendo el research de
    // Shilpa (ítem 2 del plan 0004) y en escuelas es decisión de privacidad.
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
