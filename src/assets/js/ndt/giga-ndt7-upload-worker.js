// Runs ndt7-js's upload worker (copied next to this file from
// node_modules/@m-lab/ndt7 by angular.json), with one guard: see
// giga-ndt7-download-worker.js.
importScripts('ndt7-upload-worker.js');

const runUpload = self.onmessage;

self.onmessage = function (ev) {
  const url = ev && ev.data && ev.data['///ndt/v7/upload'];
  if (typeof url !== 'string' || !url) {
    postMessage({
      MsgType: 'error',
      Error: 'No test server: the server lookup found none',
    });
    return;
  }
  runUpload(ev);
};
