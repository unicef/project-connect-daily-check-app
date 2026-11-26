// Runs ndt7-js's download worker (copied next to this file from
// node_modules/@m-lab/ndt7 by angular.json), with one guard.
//
// ndt7.test starts the download even when its server lookup found no server
// (M-Lab refused or answered something it could not read), and hands the
// worker no URL. The library's worker then throws "Failed to construct
// 'WebSocket': The URL 'undefined' is invalid", which is reported to Sentry,
// and the test only fails when ndt7 gives up on the leg 10 seconds later.
// Answering with ndt7's own error message ends the leg at once instead.
importScripts('ndt7-download-worker.js');

const runDownload = self.onmessage;

self.onmessage = function (ev) {
  const url = ev && ev.data && ev.data['///ndt/v7/download'];
  if (typeof url !== 'string' || !url) {
    postMessage({
      MsgType: 'error',
      Error: 'No test server: the server lookup found none',
    });
    return;
  }
  runDownload(ev);
};
