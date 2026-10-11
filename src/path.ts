// A path through a guide with choices: which option the reader picked at each
// choice stage. Options that share an id across stages are one choice, so a
// pick carries forward (and back) through every stage that offers it. Stages
// and options with `when` only apply on paths that picked one of those ids
// earlier, so a path can stay split where the guide says it differs.
import type { BuildOrder, ChoiceStage, Stage, StageOption, Step } from './types';

/** The picked option id per stage index (shared stages have none). */
export type Path = Record<number, string>;

const isChoice = (s: unknown): s is ChoiceStage => !!s && typeof s === 'object' && 'options' in s;
const applies = (when: string[] | undefined, picked: Set<string>) =>
	!when || when.some((w) => picked.has(w));

type Walked = { si: number; stage: Stage; option?: StageOption };

/** The stages a path walks through, in order, with the option shown at each
 *  choice: the one picked if it applies, else an earlier pick it offers, else
 *  its first applicable option. Stages whose `when` misses are skipped. */
const walk = (build: BuildOrder, path: Path, want: string[] = []): Walked[] => {
	const out: Walked[] = [];
	const picked = new Set<string>();
	build.stages?.forEach((st, si) => {
		if (!applies(st.when, picked)) return;
		if (!isChoice(st)) return void out.push({ si, stage: st });
		const offered = st.options.filter((o) => applies(o.when, picked));
		const list = offered.length ? offered : st.options;
		const option =
			list.find((o) => o.id === path[si]) ??
			list.find((o) => want.includes(o.id)) ??
			list.find((o) => picked.has(o.id)) ??
			list[0];
		picked.add(option.id);
		out.push({ si, stage: st, option });
	});
	return out;
};

/** The default path: the first option of each choice, unless an earlier pick
 *  with the same id is on offer. `want` (e.g. from a url) wins where it fits. */
export const defaultPath = (build: BuildOrder, want: string[] = []): Path => {
	const path: Path = {};
	for (const w of walk(build, {}, want)) if (w.option) path[w.si] = w.option.id;
	return path;
};

/** Pick `id` at stage `si`, and wherever else that id is offered. */
export const pick = (build: BuildOrder, path: Path, si: number, id: string): Path => {
	const next = { ...path, [si]: id };
	build.stages?.forEach((st, sj) => {
		if (sj !== si && isChoice(st) && st.options.some((o) => o.id === id)) next[sj] = id;
	});
	// settle the stages a different pick brings in or out
	for (const w of walk(build, next)) if (w.option) next[w.si] = w.option.id;
	return next;
};

/** The steps along a path, in order. A guide without stages has one path. */
export const stepsOn = (build: BuildOrder, path: Path): Step[] =>
	build.stages
		? walk(build, path).flatMap((w) => (w.option ?? (w.stage as { steps: Step[] })).steps)
		: build.steps;

/** The ids picked along a path, for a shareable url (`#path=pool-first,muta`). */
export const pathIds = (path: Path): string[] => [...new Set(Object.values(path))];

/** For each choice stage on the path: which stage, the question, the options
 *  on offer there, and the step it heads (its index along the path). */
export const choicesOn = (build: BuildOrder, path: Path) => {
	const out: { si: number; at: number; stage: ChoiceStage; picked: string }[] = [];
	const picked = new Set<string>();
	let at = 0;
	for (const w of walk(build, path)) {
		if (w.option && isChoice(w.stage)) {
			const offered = w.stage.options.filter((o) => applies(o.when, picked));
			// one option left on this path: nothing to choose, it reads as a stage
			if (offered.length > 1)
				out.push({ si: w.si, at, stage: { ...w.stage, options: offered }, picked: w.option.id });
			picked.add(w.option.id);
			at += w.option.steps.length;
		} else at += (w.stage as { steps: Step[] }).steps.length;
	}
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
		? walk(build, path).flatMap(({ si, stage, option }) => {
				const t = slug(stage.title) || `stage-${si + 1}`;
				if (!option) return (stage as { steps: Step[] }).steps.map((_, k) => `${t}.${k + 1}`);
				return option.steps.map((_, k) => `${t}.${option.id}.${k + 1}`);
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
