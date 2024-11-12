import { isDevMode } from '@angular/core';
import { environment as env } from './_environment.prod';

const token = env.token;
export const environment = {
  production: env.mode,
  mode: env.mode,
  // restAPI: 'https://uni-connect-services.azurewebsites.net/api/v1/',
  restAPI: env.mode === 'dev' ? env.restAPIDev : env.restAPI,
  token: env.mode === 'dev' ? env.tokenDev : token,
  app_version: '1.0.10',
  appName: 'Project Connect',
  appNameSuffix: 'Daily Check',
  showAboutMenu: true,
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
  ],
};
