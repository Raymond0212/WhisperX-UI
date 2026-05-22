const { contextBridge } = require('electron');

const prefix = '--whisperx-api-base-url=';
const apiArg = process.argv.find((arg) => arg.startsWith(prefix));
const apiBaseUrl = apiArg ? apiArg.slice(prefix.length) : null;

contextBridge.exposeInMainWorld('whisperxDesktop', {
  apiBaseUrl
});
