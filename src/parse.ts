// Article YAML -> BuildOrder. Articles are written for people, not for the
// renderer: things are named ("Engineering Bay", "8 Marine"), cues are short
// strings ("11 supply", "3:15", "Academy 100%"), and a step that waits on a
// building finds the step that built it on its own. This module turns that
// into the exact BuildOrder the guide components render, and reports any
// mistake with the line it is on so the preview can point at it.
import { LineCounter, parseDocument, isMap, type Node } from 'yaml';
import { lev, lookup, suggest, type Kind } from './names';
import type { BuildOrder, Produce, Reference, Source, Step, Trigger } from './types';

export type Issue = { message: string; line?: number; path: (string | number)[] };
export type ParseResult = { build?: BuildOrder; errors: Issue[] };

const TOP_KEYS = [
	'title',
	'matchup',
	'creator',
	'submitter',
	'tagline',
	'objective',
	'references',
	'steps'
];
const STEP_KEYS = [
	'id',
	'section',
	'at',
	'or',
	'make',
	'use',
	'instruction',
	'description',
	'notes',
	'before',
	'sources'
];
const KINDS: Kind[] = ['building', 'unit', 'upgrade', 'tech'];

/** A cue before refs are resolved: percent cues still carry the raw name. */
type RawTrigger =
	| Exclude<Trigger, { kind: 'percent' }>
	| { kind: 'percent'; percent: number; name: string; at?: string };

export function parseArticle(text: string): ParseResult {
	const lc = new LineCounter();
	const doc = parseDocument(text, { lineCounter: lc, prettyErrors: false });
	const errors: Issue[] = [];
	const lineOf = (path: (string | number)[]): number | undefined => {
		const node = (path.length ? doc.getIn(path, true) : doc.contents) as Node | undefined;
		const off = node && 'range' in node && node.range ? node.range[0] : undefined;
		return off === undefined ? undefined : lc.linePos(off).line;
	};
	const err = (path: (string | number)[], message: string) =>
		errors.push({ message, path, line: lineOf(path) });

	for (const e of doc.errors) {
		errors.push({ message: e.message.split('\n')[0], path: [], line: e.linePos?.[0].line });
	}
	if (errors.length) return { errors };

	const root = doc.toJS() as Record<string, unknown> | null;
	if (!root || typeof root !== 'object' || Array.isArray(root)) {
		err([], 'An article is a set of `key: value` fields (title, matchup, objective, steps…).');
		return { errors };
	}
	// Map keys that weren't scalars (rare) make toJS lossy; reject them early.
	if (!isMap(doc.contents)) {
		err([], 'The top level of an article must be `key: value` fields.');
		return { errors };
	}

	for (const k of Object.keys(root)) {
		if (!TOP_KEYS.includes(k)) err([k], `Unknown field \`${k}\`.${hint(k, TOP_KEYS)}`);
	}

	const str = (path: (string | number)[], v: unknown, required = false): string | undefined => {
		if (v === undefined || v === null) {
			if (required) err(path.slice(0, -1), `Missing \`${path[path.length - 1]}\`.`);
			return undefined;
		}
		if (typeof v === 'number') return String(v);
		if (typeof v !== 'string') {
			err(path, `\`${path[path.length - 1]}\` should be text.`);
			return undefined;
		}
		const t = v.trim();
		if (!t && required) err(path, `\`${path[path.length - 1]}\` is empty.`);
		return t || undefined;
	};

	const title = str(['title'], root.title, true);
	const matchup = str(['matchup'], root.matchup, true);
	if (matchup && !/^[TPZR]v[TPZRX]$/.test(matchup)) {
		err(['matchup'], 'Matchup should look like `TvZ`, `PvT`, `ZvZ`… (race v race).');
	}
	const objective = str(['objective'], root.objective, true);

	// ---- references --------------------------------------------------------
	const references: Reference[] = [];
	if (root.references !== undefined) {
		if (!Array.isArray(root.references)) {
			err(['references'], '`references` is a list (each line starting with `- `).');
		} else {
			root.references.forEach((r, i) => {
				const p = ['references', i];
				if (!r || typeof r !== 'object')
					return err(p, 'Each reference is `- youtube: <url>` or `- replay: <url>`.');
				const o = r as Record<string, unknown>;
				const kind = 'youtube' in o ? 'youtube' : 'replay' in o ? 'replay' : undefined;
				if (!kind) return err(p, 'Each reference is `- youtube: <url>` or `- replay: <url>`.');
				for (const k of Object.keys(o)) {
					if (k !== kind && k !== 'label') err([...p, k], `Unknown reference field \`${k}\`.`);
				}
				const url = str([...p, kind], o[kind], true);
				if (url && !/^https?:\/\//.test(url))
					err([...p, kind], 'The link should start with https://');
				const label = str([...p, 'label'], o.label);
				if (url) references.push(label ? { kind, url, label } : { kind, url });
			});
		}
	}

	// ---- steps -------------------------------------------------------------
	const stepsIn = root.steps;
	if (!Array.isArray(stepsIn) || stepsIn.length === 0) {
		err(
			stepsIn === undefined ? [] : ['steps'],
			'An article needs a `steps:` list with at least one step.'
		);
		return { errors };
	}

	const steps: Step[] = [];
	const raws: { at?: RawTrigger; or?: RawTrigger }[] = [];
	const ids = new Set<string>();

	stepsIn.forEach((s, i) => {
		const p = ['steps', i];
		if (!s || typeof s !== 'object' || Array.isArray(s)) {
			err(p, 'Each step is a set of fields starting with `- at: …`.');
			steps.push({ trigger: { kind: 'immediate' } });
			raws.push({});
			return;
		}
		const o = s as Record<string, unknown>;
		for (const k of Object.keys(o)) {
			if (!STEP_KEYS.includes(k))
				err([...p, k], `Unknown step field \`${k}\`.${hint(k, STEP_KEYS)}`);
		}
		const step: Step = { trigger: { kind: 'immediate' } };
		const id = str([...p, 'id'], o.id);
		if (id) {
			if (!/^[a-z0-9-_]+$/i.test(id))
				err([...p, 'id'], 'An `id` is a short word: letters, digits, `-`.');
			if (ids.has(id)) err([...p, 'id'], `Another step already has id \`${id}\`.`);
			ids.add(id);
			step.id = id;
		}
		const section = str([...p, 'section'], o.section);
		if (section) step.section = section;

		const raw: { at?: RawTrigger; or?: RawTrigger } = {};
		if (o.at === undefined)
			err(p, 'Each step needs an `at:` cue (`11 supply`, `3:15`, `Academy 100%`, or `next`).');
		else raw.at = trigger([...p, 'at'], o.at, err);
		if (o.or !== undefined) {
			raw.or = trigger([...p, 'or'], o.or, err);
			if (raw.or?.kind === 'immediate')
				err([...p, 'or'], '`or: next` has no meaning; give a supply, time or `X 100%`.');
		}
		raws.push(raw);

		if (o.make !== undefined) {
			const list = Array.isArray(o.make) ? o.make : [o.make];
			const produce = list
				.map((m, j) => item(Array.isArray(o.make) ? [...p, 'make', j] : [...p, 'make'], m, err))
				.filter((x): x is Produce => !!x);
			if (produce.length) step.produce = produce;
		}
		if (o.use !== undefined) {
			if (typeof o.use !== 'boolean') err([...p, 'use'], '`use` is `true` or `false`.');
			else if (o.use) step.use = true;
		}
		for (const k of ['instruction', 'description', 'notes', 'before'] as const) {
			const v = str([...p, k], o[k]);
			if (v) step[k] = v;
		}
		if (o.sources !== undefined) {
			const list = sources([...p, 'sources'], o.sources, err);
			if (list.length) step.sources = list;
		}
		if (step.use && !step.instruction) {
			err(p, 'A `use: true` step needs an `instruction` saying what to do (e.g. "Move out").');
		}
		if (o.make === undefined && !step.instruction) {
			err(p, 'A step needs `make:` (what is built) or an `instruction`.');
		}
		steps.push(step);
	});

	// ---- resolve cues ------------------------------------------------------
	// A percent cue points back at the most recent earlier step that *builds*
	// the thing it waits on (or the step named with `@id`), so the guide can
	// draw the connector. `use` steps don't build, so they are skipped.
	const keyOf = (i: number) => steps[i].id ?? `s${i}`;
	const resolve = (
		i: number,
		field: 'at' | 'or',
		t: RawTrigger | undefined
	): Trigger | undefined => {
		if (!t) return undefined;
		if (t.kind !== 'percent') return t;
		const p = ['steps', i, field];
		const hit = lookup(t.name);
		let target = -1;
		if (t.at) {
			target = steps.findIndex((s) => s.id === t.at);
			if (target < 0) err(p, `No step has \`id: ${t.at}\`.`);
			else if (target >= i) err(p, `\`@${t.at}\` must point at an earlier step.`);
		} else if (hit) {
			for (let j = i - 1; j >= 0; j--) {
				if (steps[j].use) continue;
				if (steps[j].produce?.some((pr) => pr.kind === hit.kind && pr.id === hit.id)) {
					target = j;
					break;
				}
			}
		}
		if (!hit && target < 0) {
			err(p, `Don't know "${t.name}".${didYouMean(t.name)}`);
			return { kind: 'percent', percent: t.percent, of: t.name };
		}
		const prod =
			target >= 0 && target < i
				? steps[target].produce?.find((pr) => !hit || (pr.kind === hit.kind && pr.id === hit.id))
				: undefined;
		const kind = prod?.kind ?? hit!.kind;
		const out: Trigger = {
			kind: 'percent',
			percent: t.percent,
			of: prod?.name ?? hit!.name,
			ofId: prod?.id ?? hit!.id
		};
		if (kind !== 'building') out.ofKind = kind;
		if (target >= 0 && target < i) {
			if (!steps[target].id) steps[target].id = keyOf(target);
			out.ref = steps[target].id;
		}
		return out;
	};
	steps.forEach((s, i) => {
		const at = resolve(i, 'at', raws[i].at);
		if (at) s.trigger = at;
		const or = resolve(i, 'or', raws[i].or);
		if (or) s.altTrigger = or;
	});

	errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
	if (errors.length || !title || !matchup || !objective) return { errors };

	// Field order mirrors the hand-written builds so a parsed article compares
	// equal to (and serializes like) one.
	const build: BuildOrder = { title, matchup } as BuildOrder;
	const creator = str(['creator'], root.creator);
	const submitter = str(['submitter'], root.submitter);
	const tagline = str(['tagline'], root.tagline);
	if (creator) build.creator = creator;
	if (submitter) build.submitter = submitter;
	if (tagline) build.tagline = tagline;
	build.objective = objective;
	if (references.length) build.references = references;
	build.steps = steps;
	return { build, errors };
}

type Err = (path: (string | number)[], message: string) => void;

/** `11`, `11 supply`, `3:15`, `next`, `Academy 100%`, `Academy done`, `Barracks 100% @rax1`. */
function trigger(path: (string | number)[], v: unknown, err: Err): RawTrigger | undefined {
	if (typeof v === 'number') {
		if (!Number.isInteger(v) || v < 0) return void err(path, 'Supply is a whole number.');
		return { kind: 'supply', supply: v };
	}
	if (typeof v !== 'string') return void err(path, 'A cue is text like `11 supply` or `3:15`.');
	const s = v.trim();
	let m: RegExpMatchArray | null;
	if ((m = s.match(/^(\d+)(?:\s*supply)?$/i))) return { kind: 'supply', supply: +m[1] };
	if ((m = s.match(/^(\d+):([0-5]\d)$/))) return { kind: 'time', seconds: +m[1] * 60 + +m[2] };
	if (/^(next|then|after)$/i.test(s)) return { kind: 'immediate' };
	if ((m = s.match(/^(.+?)\s+(?:(\d{1,3})\s*%|(done|finished|finishes))(?:\s+@([\w-]+))?$/i))) {
		const percent = m[2] !== undefined ? +m[2] : 100;
		if (percent < 1 || percent > 100) return void err(path, 'A percentage is between 1% and 100%.');
		return { kind: 'percent', percent, name: m[1].trim(), at: m[4] };
	}
	err(
		path,
		`Can't read the cue "${s}". Use \`11 supply\`, \`3:15\`, \`Academy 100%\` (when the Academy finishes), or \`next\`.`
	);
}

/** `Barracks`, `8 Marine`, `2x Medic`, or `{ tech: Stim Packs, label: Stim Pack, count: 1 }`. */
function item(path: (string | number)[], v: unknown, err: Err): Produce | undefined {
	let name: string | undefined;
	let kind: Kind | undefined;
	let count: number | undefined;
	let label: string | undefined;
	if (typeof v === 'string') {
		const m = v.trim().match(/^(?:(\d+)\s*[x×]?\s+)?(.+?)(?:\s+[x×](\d+))?$/i);
		if (!m) return void err(path, 'Write what is made, like `Barracks` or `8 Marine`.');
		count = m[1] ? +m[1] : m[3] ? +m[3] : undefined;
		name = m[2];
	} else if (v && typeof v === 'object' && !Array.isArray(v)) {
		const o = v as Record<string, unknown>;
		const kk = KINDS.filter((k) => k in o);
		if (kk.length > 1) return void err(path, 'Give only one of building / unit / upgrade / tech.');
		for (const k of Object.keys(o)) {
			if (![...KINDS, 'name', 'count', 'label'].includes(k))
				err([...path, k], `Unknown field \`${k}\`.`);
		}
		kind = kk[0];
		const n = kind ? o[kind] : o.name;
		if (typeof n !== 'string') return void err(path, 'Say what is made, e.g. `unit: Marine`.');
		name = n.trim();
		if (o.count !== undefined) {
			if (typeof o.count !== 'number' || !Number.isInteger(o.count) || o.count < 1) {
				err([...path, 'count'], '`count` is a whole number.');
			} else count = o.count;
		}
		if (o.label !== undefined) {
			if (typeof o.label !== 'string') err([...path, 'label'], '`label` is text.');
			else label = o.label.trim();
		}
	} else {
		return void err(path, 'Write what is made, like `Barracks` or `8 Marine`.');
	}
	const hit = lookup(name, kind);
	if (!hit)
		return void err(path, `Don't know ${kind ? `the ${kind} ` : ''}"${name}".${didYouMean(name)}`);
	const out: Produce = { kind: hit.kind, id: hit.id, name: label || hit.name };
	if (count !== undefined) out.count = count;
	return out;
}

const clockOf = (v: unknown): number | undefined => {
	const m = typeof v === 'string' ? v.trim().match(/^(\d+):([0-5]\d)$/) : null;
	return m ? +m[1] * 60 + +m[2] : undefined;
};

/** `?t=398`, `?t=6m38s` or `&t=398s` on a YouTube link -> seconds. */
const youtubeSeconds = (url: string): number | undefined => {
	const m = url.match(/[?&#]t=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?(?:&|$)/);
	if (!m || !(m[1] || m[2] || m[3])) return undefined;
	return (+(m[1] ?? 0) * 60 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
};

/**
 * A step's `sources:` list. Each entry is one of
 *   - replays: { players: 69, at: 5:52, range: 5:43-6:00, supply: 46, workers: 34, note: … }
 *   - youtube: https://youtu.be/…?t=398   (label: optional)
 *   - replay: https://cwal.gg/viewer?match=…   (label: optional)
 */
function sources(path: (string | number)[], v: unknown, err: Err): Source[] {
	if (!Array.isArray(v)) {
		err(path, '`sources` is a list (each line starting with `- `).');
		return [];
	}
	const out: Source[] = [];
	v.forEach((e, i) => {
		const p = [...path, i];
		if (!e || typeof e !== 'object' || Array.isArray(e))
			return err(p, 'Each source is `- replays: {…}`, `- youtube: <url>` or `- replay: <url>`.');
		const o = e as Record<string, unknown>;
		if ('replays' in o) {
			for (const k of Object.keys(o))
				if (k !== 'replays') err([...p, k], `Unknown source field \`${k}\`.`);
			const r = o.replays as Record<string, unknown>;
			if (!r || typeof r !== 'object' || Array.isArray(r))
				return err(
					[...p, 'replays'],
					'`replays` is a set of fields: `players`, `at`, `range`, `supply`, `workers`, `note`.'
				);
			const known = ['players', 'at', 'range', 'supply', 'workers', 'note'];
			for (const k of Object.keys(r))
				if (!known.includes(k))
					err([...p, 'replays', k], `Unknown field \`${k}\`.${hint(k, known)}`);
			const whole = (k: string) => {
				const x = r[k];
				if (x === undefined) return undefined;
				if (typeof x !== 'number' || !Number.isInteger(x) || x < 0)
					return void err([...p, 'replays', k], `\`${k}\` is a whole number.`);
				return x;
			};
			const players = whole('players');
			if (players === undefined)
				return err([...p, 'replays'], 'Say how many players: `players: 69`.');
			const src: Source = { kind: 'replays', players };
			if (r.at !== undefined) {
				const at = clockOf(r.at);
				if (at === undefined) err([...p, 'replays', 'at'], '`at` is a game time like `5:52`.');
				else src.at = at;
			}
			if (r.range !== undefined) {
				const m = typeof r.range === 'string' ? r.range.split(/\s*[-–]\s*/) : [];
				const [a, b] = m.map(clockOf);
				if (m.length !== 2 || a === undefined || b === undefined || a > b)
					err([...p, 'replays', 'range'], '`range` is two game times, like `5:43-6:00`.');
				else src.range = [a, b];
			}
			const supply = whole('supply');
			const workers = whole('workers');
			if (supply !== undefined) src.supply = supply;
			if (workers !== undefined) src.workers = workers;
			if (r.note !== undefined) {
				if (typeof r.note !== 'string') err([...p, 'replays', 'note'], '`note` is text.');
				else if (r.note.trim()) src.note = r.note.trim();
			}
			return void out.push(src);
		}
		const kind = 'youtube' in o ? 'youtube' : 'replay' in o ? 'replay' : undefined;
		if (!kind)
			return err(p, 'Each source is `- replays: {…}`, `- youtube: <url>` or `- replay: <url>`.');
		for (const k of Object.keys(o))
			if (k !== kind && k !== 'label') err([...p, k], `Unknown source field \`${k}\`.`);
		const url = typeof o[kind] === 'string' ? (o[kind] as string).trim() : '';
		if (!/^https?:\/\//.test(url)) return err([...p, kind], 'The link should start with https://');
		const src: Source = { kind, url };
		if (o.label !== undefined) {
			if (typeof o.label !== 'string') err([...p, 'label'], '`label` is text.');
			else if (o.label.trim()) src.label = o.label.trim();
		}
		const t = kind === 'youtube' ? youtubeSeconds(url) : undefined;
		if (t !== undefined) src.seconds = t;
		out.push(src);
	});
	return out;
}

const didYouMean = (name: string) => {
	const s = suggest(name);
	return s.length ? ` Did you mean ${s.map((x) => `"${x}"`).join(' or ')}?` : '';
};

const hint = (k: string, known: string[]) => {
	const close = [...known].sort((a, b) => lev(a, k) - lev(b, k)).find((x) => lev(x, k) <= 2);
	return close ? ` Did you mean \`${close}\`?` : '';
};
