// Bootstraps a TypeScript module inside a worker thread via tsx.
import { workerData } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';

await tsImport(workerData.__entry, import.meta.url);
