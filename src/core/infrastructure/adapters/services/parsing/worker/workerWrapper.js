// worker/workerWrapper.js (ESM)
import { workerData } from 'worker_threads';
import { pathToFileURL } from 'node:url';

const fullpath = workerData.fullpath;

const moduleImported = await import(pathToFileURL(fullpath).href);
const handler = moduleImported.default ?? moduleImported;

export default handler;
