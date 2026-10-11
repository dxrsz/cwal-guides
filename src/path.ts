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
