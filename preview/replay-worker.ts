// Reads a dropped replay off the main thread: runs the engine fetched into
// public/engine/ (see scripts/fetch-engine.mjs) and posts back the extracted
// build timeline. The engine is loaded on the first replay, not on page load.
type EngineModule = {
	createEngine: (o: {
		simModule: WebAssembly.Module;
		identModule: WebAssembly.Module;
		pack: ArrayBuffer;
	}) => Promise<{
		simulate: (
			bytes: ArrayBuffer,
			o?: { onProgress?: (pct: number) => void }
		) => Promise<{ handle: number; timeline: unknown }>;
		free: (handle: number) => void;
	}>;
	gunzipMaybe: (buf: ArrayBuffer) => Promise<ArrayBuffer>;
};

let engine: ReturnType<EngineModule['createEngine']> | null = null;

const load = (base: string) =>
	(engine ??= (async () => {
		const at = (f: string) => new URL(f, base).href;
		const mod = (await import(/* @vite-ignore */ at('engine.js'))) as EngineModule;
		const get = async (f: string) => {
			const res = await fetch(at(f));
			if (!res.ok) throw new Error(`could not download ${f} (${res.status})`);
			return res;
		};
		const [pack, simModule, identModule] = await Promise.all([
			get('sim.pack.gz')
				.then((r) => r.arrayBuffer())
				.then(mod.gunzipMaybe),
			get('bwsim_wasm.wasm')
				.then((r) => r.arrayBuffer())
				.then((b) => WebAssembly.compile(b)),
			get('build_identifier.wasm')
				.then((r) => r.arrayBuffer())
				.then((b) => WebAssembly.compile(b))
		]);
		return mod.createEngine({ simModule, identModule, pack });
	})().catch((e) => {
		engine = null;
		throw e;
	}));

onmessage = async (e: MessageEvent<{ base: string; bytes: ArrayBuffer }>) => {
	try {
		postMessage({ type: 'stage', stage: 'loading' });
		const eng = await load(e.data.base);
		postMessage({ type: 'stage', stage: 'reading' });
		const { handle, timeline } = await eng.simulate(e.data.bytes, {
			onProgress: (pct) => postMessage({ type: 'progress', pct })
		});
		eng.free(handle);
		postMessage({ type: 'done', timeline });
	} catch (err) {
		postMessage({ type: 'error', message: (err as Error).message ?? String(err) });
	}
};
