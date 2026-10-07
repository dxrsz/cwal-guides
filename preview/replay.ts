// Main-thread side of "start from a replay": hands the file to the worker
// and resolves with the extracted timeline.
import type { Timeline } from './seed';

let worker: Worker | null = null;

export type ReplayProgress = { stage: 'loading' | 'reading'; pct?: number };

export const readReplay = (
	file: File,
	onProgress: (p: ReplayProgress) => void
): Promise<Timeline> =>
	new Promise(async (resolve, reject) => {
		worker ??= new Worker(new URL('./replay-worker.ts', import.meta.url), { type: 'module' });
		const bytes = await file.arrayBuffer();
		let stage: ReplayProgress['stage'] = 'loading';
		worker.onmessage = (e) => {
			const m = e.data;
			if (m.type === 'stage') onProgress({ stage: (stage = m.stage) });
			else if (m.type === 'progress') onProgress({ stage, pct: m.pct });
			else if (m.type === 'done') resolve(m.timeline as Timeline);
			else if (m.type === 'error') reject(new Error(m.message));
		};
		// public/ files sit at the page's base; the worker can't see it itself.
		worker.postMessage({ base: new URL('engine/', document.baseURI).href, bytes }, [bytes]);
	});
