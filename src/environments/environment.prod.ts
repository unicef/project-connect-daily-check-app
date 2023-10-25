const env = require('./_environment.prod');
const token = env.environment.token;
export const environment = {
  production: true,
  restAPI: 'https://uni-connect-services.azurewebsites.net/api/v1/',
  //restAPI: 'http://localhost:3000/api/v1/',
  token,
  app_version: '1.0.6',
};
