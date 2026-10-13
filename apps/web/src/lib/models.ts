import {
  Blueprint,
  type BlueprintFile,
  type ExploitModelFile,
  MLP,
  loadActor,
} from '@poker-rl/engine';

export interface Models {
  blueprint: Blueprint;
  exploit: ExploitModelFile;
  actor: MLP;
}

let promise: Promise<Models> | null = null;

async function fetchJSON<T>(url: string, onProgress?: (frac: number) => void): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total || !onProgress) return (await res.json()) as T;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

export function loadModels(onProgress?: (frac: number) => void): Promise<Models> {
  if (!promise) {
    promise = (async () => {
      const [bpFile, exploit] = await Promise.all([
        fetchJSON<BlueprintFile>('models/blueprint.json', onProgress),
        fetchJSON<ExploitModelFile>('models/exploit.json'),
      ]);
      return { blueprint: new Blueprint(bpFile), exploit, actor: loadActor(exploit) };
    })();
  }
  return promise;
}
