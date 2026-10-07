// Fetches the replay engine the builder's "start from a replay" uses into
// preview/public/engine/: bwsim (the simulation cwal.gg's replay viewer runs)
// and the build extractor, as published by the build classifier's sandbox
// (dxrsz/cwal-build-classifier). Served next to the page, so it's same-origin
// and pinned to what was live at deploy time.
//
// Runs before `npm run dev` and `npm run build`. Files already present are
// kept; FORCE=1 refetches. CLASSIFIER_BASE fetches from elsewhere.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.CLASSIFIER_BASE ?? 'https://dxrsz.github.io/cwal-build-classifier/';
const out = new URL('../preview/public/engine/', import.meta.url);
const FILES = ['engine.js', 'build_identifier.wasm', 'engine/bwsim_wasm.wasm', 'engine/sim.pack.gz'];

mkdirSync(out, { recursive: true });
for (const f of FILES) {
	const dest = new URL(f.split('/').pop(), out);
	if (existsSync(dest) && !process.env.FORCE) continue;
	console.log(`fetching ${BASE}${f}…`);
	const res = await fetch(BASE + f);
	if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
	writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}
