// A path through a guide with choices: which option the reader picked at each
// choice stage. Options that share an id across stages are one choice, so a
// pick carries forward (and back) through every stage that offers it.
import type { BuildOrder, ChoiceStage, Step } from './types';

/** The picked option id per stage index (shared stages have none). */
export type Path = Record<number, string>;

const isChoice = (s: unknown): s is ChoiceStage => !!s && typeof s === 'object' && 'options' in s;

/** The default path: the first option of each choice, unless an earlier pick
 *  with the same id is on offer. `want` (e.g. from a url) wins where it fits. */
export const defaultPath = (build: BuildOrder, want: string[] = []): Path => {
	const path: Path = {};
	const picked: string[] = [];
	build.stages?.forEach((st, si) => {
		if (!isChoice(st)) return;
		const ids = st.options.map((o) => o.id);
		const id = want.find((w) => ids.includes(w)) ?? picked.find((p) => ids.includes(p)) ?? ids[0];
		path[si] = id;
		picked.push(id);
	});
	return path;
};

/** Pick `id` at stage `si`, and wherever else that id is offered. */
export const pick = (build: BuildOrder, path: Path, si: number, id: string): Path => {
	const next = { ...path, [si]: id };
	build.stages?.forEach((st, sj) => {
		if (sj !== si && isChoice(st) && st.options.some((o) => o.id === id)) next[sj] = id;
	});
	return next;
};

/** The steps along a path, in order. A guide without stages has one path. */
export const stepsOn = (build: BuildOrder, path: Path): Step[] =>
	build.stages
		? build.stages.flatMap((st, si) =>
				isChoice(st) ? (st.options.find((o) => o.id === path[si]) ?? st.options[0]).steps : st.steps
			)
		: build.steps;

/** The ids picked along a path, for a shareable url (`?path=pool-first,muta`). */
export const pathIds = (path: Path): string[] => [...new Set(Object.values(path))];

/** For each choice stage on the path: which stage, the question, the options,
 *  and the step it heads (its index along the path). */
export const choicesOn = (build: BuildOrder, path: Path) => {
	const out: { si: number; at: number; stage: ChoiceStage; picked: string }[] = [];
	let at = 0;
	build.stages?.forEach((st, si) => {
		if (isChoice(st)) {
			const picked = path[si] ?? st.options[0].id;
			out.push({ si, at, stage: st, picked });
			at += (st.options.find((o) => o.id === picked) ?? st.options[0]).steps.length;
		} else at += st.steps.length;
	});
	return out;
};

const slug = (t: string) =>
	t
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/** A readable anchor for each step on a path, for links to a step:
 *  `<stage>.<option>.<n>` in a choice, `<stage>.<n>` in a shared stage, and
 *  just `<n>` in a guide without stages (n counts from 1 within its list). */
export const anchorsOn = (build: BuildOrder, path: Path): string[] =>
	build.stages
		? build.stages.flatMap((st, si) => {
				const t = slug(st.title) || `stage-${si + 1}`;
				if (!isChoice(st)) return st.steps.map((_, k) => `${t}.${k + 1}`);
				const o = st.options.find((x) => x.id === path[si]) ?? st.options[0];
				return o.steps.map((_, k) => `${t}.${o.id}.${k + 1}`);
			})
		: build.steps.map((_, k) => String(k + 1));

/** The page url's `#a=1&b=2` as a map (empty outside a browser). */
export const readHash = (): Record<string, string> => {
	if (typeof location === 'undefined') return {};
	const out: Record<string, string> = {};
	for (const [k, v] of new URLSearchParams(location.hash.slice(1))) out[k] = v;
	return out;
};

/** Set (or with null, remove) `#` params without navigating or scrolling.
 *  Commas and dots stay readable rather than percent-encoded. */
export const writeHash = (set: Record<string, string | null | undefined>) => {
	if (typeof history === 'undefined') return;
	const h = { ...readHash() };
	for (const [k, v] of Object.entries(set)) {
		if (v) h[k] = v;
		else delete h[k];
	}
	const enc = (s: string) => encodeURIComponent(s).replace(/%2C/gi, ',');
	const str = Object.entries(h)
		.map(([k, v]) => `${enc(k)}=${enc(v)}`)
		.join('&');
	const u = new URL(location.href);
	u.hash = str;
	history.replaceState(history.state, '', u.href.endsWith('#') ? u.href.slice(0, -1) : u.href);
};
