// The visual editor's model is the article itself, in its YAML shape
// (`at: 11 supply`, `make: 8 Marine`), so the editor and the YAML tab are two
// views of one document. This file reads that shape into form-friendly pieces
// and writes it back out as tidy YAML.
import { Document, Scalar, isScalar, parse, visit } from 'yaml';
import { TABLES, lookup, type Kind } from '../src/names';

export type Item = string | { [k: string]: unknown; label?: string; count?: number };
export type RawStep = {
	// visual-editor working state (see hydrate); not part of the article
	_at?: Cue;
	_or?: Cue | null;
	_items?: ItemRow[];
	_open?: boolean;
	id?: string;
	section?: string;
	at?: string | number;
	or?: string | number;
	make?: Item | Item[];
	use?: boolean;
	instruction?: string;
	description?: string;
	notes?: string;
	before?: string;
};
export type Article = {
	title?: string;
	matchup?: string;
	creator?: string;
	submitter?: string;
	tagline?: string;
	objective?: string;
	references?: { youtube?: string; replay?: string; label?: string }[];
	steps?: RawStep[];
};

/** YAML text -> article, or null if the text isn't a YAML mapping. */
export const readArticle = (text: string): Article | null => {
	try {
		const v = parse(text);
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as Article) : null;
	} catch {
		return null;
	}
};

const FIELD_ORDER = [
	'title',
	'matchup',
	'creator',
	'submitter',
	'tagline',
	'objective',
	'references',
	'steps'
];
const STEP_ORDER = [
	'id',
	'section',
	'at',
	'or',
	'make',
	'use',
	'instruction',
	'description',
	'notes',
	'before'
];
const LONG = ['objective', 'notes', 'description', 'tagline'];

const clean = (o: Record<string, unknown>, order: string[]) => {
	const out: Record<string, unknown> = {};
	// `_`-prefixed keys are the visual editor's working state, never written.
	const extra = Object.keys(o).filter((k) => !order.includes(k) && !k.startsWith('_'));
	for (const k of [...order, ...extra]) {
		const v = o[k];
		if (v === undefined || v === null || v === '' || v === false) continue;
		if (Array.isArray(v) && v.length === 0) continue;
		out[k] = typeof v === 'string' ? v.trim() : v;
	}
	return out;
};

/** Article -> YAML in the same style as the published articles. */
export const writeArticle = (a: Article): string => {
	const obj = clean(
		{
			...a,
			references: a.references?.map((r) => clean(r, ['youtube', 'replay', 'label'])),
			steps: a.steps?.map((s) => {
				if (!s || typeof s !== 'object') return s;
				const make = Array.isArray(s.make) && s.make.length === 1 ? s.make[0] : s.make;
				return clean({ ...s, make }, STEP_ORDER);
			})
		},
		FIELD_ORDER
	);
	const doc = new Document(obj);
	visit(doc, {
		Pair(_, pair) {
			const key = isScalar(pair.key) ? String(pair.key.value) : '';
			const val = pair.value;
			if (isScalar(val) && typeof val.value === 'string' && LONG.includes(key)) {
				if (val.value.length > 80 || val.value.includes('\n')) val.type = Scalar.BLOCK_FOLDED;
			}
		}
	});
	return doc
		.toString({ lineWidth: 96, minContentWidth: 40, indent: 2, indentSeq: true })
		.replace(/\n {2}- (section|at|id):/g, '\n\n  - $1:')
		.replace(/steps:\n\n/, 'steps:\n');
};

// ---- cues ------------------------------------------------------------------

export type Cue =
	| { type: 'supply'; supply: string }
	| { type: 'time'; time: string }
	| { type: 'built'; name: string; percent: string; ref: string }
	| { type: 'next' }
	| { type: 'other'; raw: string };

export const readCue = (v: unknown): Cue => {
	if (v == null || v === '') return { type: 'supply', supply: '' };
	if (typeof v === 'number') return { type: 'supply', supply: String(v) };
	if (typeof v !== 'string') return { type: 'other', raw: '' };
	const s = v.trim();
	let m: RegExpMatchArray | null;
	if ((m = s.match(/^(\d+)(?:\s*supply)?$/i))) return { type: 'supply', supply: m[1] };
	if (/^\d+:[0-5]\d$/.test(s)) return { type: 'time', time: s };
	if (/^(next|then|after)$/i.test(s)) return { type: 'next' };
	if ((m = s.match(/^(.+?)\s+(?:(\d{1,3})\s*%|(done|finished|finishes))(?:\s+@([\w-]+))?$/i)))
		return { type: 'built', name: m[1].trim(), percent: m[2] ?? '100', ref: m[4] ?? '' };
	return { type: 'other', raw: s };
};

export const writeCue = (c: Cue): string | undefined => {
	switch (c.type) {
		case 'supply':
			return c.supply ? `${c.supply} supply` : undefined;
		case 'time':
			return c.time || undefined;
		case 'next':
			return 'next';
		case 'built':
			return c.name ? `${c.name} ${c.percent || 100}%${c.ref ? ` @${c.ref}` : ''}` : undefined;
		case 'other':
			return c.raw || undefined;
	}
};

// ---- produced items --------------------------------------------------------

export type ItemRow = { name: string; count: string; label: string };
const KINDS: Kind[] = ['building', 'unit', 'upgrade', 'tech'];

export const readItems = (make: RawStep['make']): ItemRow[] => {
	// Half-typed YAML can hold anything here (`make:` with no value is null).
	const list = make == null ? [] : Array.isArray(make) ? make : [make];
	return list.map((it) => {
		if (it == null || typeof it === 'number')
			return { name: it == null ? '' : String(it), count: '', label: '' };
		if (typeof it !== 'object' && typeof it !== 'string') return { name: '', count: '', label: '' };
		if (typeof it === 'string') {
			const m = it.trim().match(/^(?:(\d+)\s*[x×]?\s+)?(.+?)(?:\s+[x×](\d+))?$/i);
			return { name: m?.[2] ?? it, count: m?.[1] ?? m?.[3] ?? '', label: '' };
		}
		const kind = KINDS.find((k) => k in it);
		const name = String((kind ? it[kind] : it.name) ?? '');
		return {
			name,
			count: it.count ? String(it.count) : '',
			label: typeof it.label === 'string' ? it.label : ''
		};
	});
};

export const writeItems = (rows: ItemRow[]): Item[] =>
	rows
		.filter((r) => r.name.trim())
		.map((r) => {
			const name = r.name.trim();
			const count = r.count ? +r.count : undefined;
			if (!r.label.trim()) return count !== undefined ? `${count} ${name}` : name;
			const kind = lookup(name)?.kind ?? 'building';
			const o: Item = { [kind]: name, label: r.label.trim() };
			if (count !== undefined) o.count = count;
			return o;
		});

// ---- name lists for the pickers, own race first ----------------------------

const RACE_BUILDINGS: Record<string, [number, number]> = {
	T: [106, 129],
	Z: [130, 153],
	P: [154, 175]
};
const RACE_UNITS: Record<string, number[]> = {
	T: [0, 1, 2, 3, 5, 7, 8, 9, 11, 12, 32, 34, 58],
	Z: [37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 50, 62, 103],
	P: [60, 61, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 83, 84]
};
const RACE_WORD: Record<string, string> = { T: 'Terran', Z: 'Zerg', P: 'Protoss' };
const RACE_UPGRADES: Record<string, number[]> = {
	T: [16, 17, 19, 20, 21, 22, 23, 51, 54],
	Z: [24, 25, 26, 27, 28, 29, 30, 31, 32, 52, 53],
	P: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 47, 49]
};
const RACE_TECHS: Record<string, number[]> = {
	T: [0, 1, 2, 3, 5, 7, 8, 9, 10, 24, 30],
	Z: [11, 13, 15, 16, 17, 32],
	P: [19, 20, 21, 22, 25, 27, 31]
};

/** Every name a step can make, for one race (all races if unknown). */
export const namesFor = (race: string | undefined): string[] => {
	const r = race && RACE_WORD[race] ? race : undefined;
	const pick = (kind: Kind, keep: (id: number, name: string) => boolean) =>
		[...TABLES[kind]].filter(([id, n]) => keep(id, n)).map(([, n]) => n);
	if (!r) return [...new Set(KINDS.flatMap((k) => [...TABLES[k].values()]))];
	const [lo, hi] = RACE_BUILDINGS[r];
	return [
		...new Set([
			...pick('building', (id) => id >= lo && id <= hi),
			...pick('unit', (id) => RACE_UNITS[r].includes(id)),
			...pick('upgrade', (id, n) => n.startsWith(RACE_WORD[r]) || RACE_UPGRADES[r].includes(id)),
			...pick('tech', (id) => RACE_TECHS[r].includes(id))
		])
	];
};

/** Give each step the editor's working state (its cue and items as form
 *  fields), read from the article's own text. */
export const hydrate = (a: Article): Article => {
	if (!Array.isArray(a.steps)) return a;
	for (const s of a.steps) {
		if (!s || typeof s !== 'object') continue;
		s._at = readCue(s.at);
		s._or = s.or == null ? null : readCue(s.or);
		s._items = readItems(s.make);
		// an empty row to type into, rather than just an "Add" button
		if (s._items.length === 0) s._items.push({ name: '', count: '', label: '' });
	}
	return a;
};

/** Write a step's working state back into its article fields. */
export const syncStep = (s: RawStep) => {
	if (s._at) s.at = writeCue(s._at);
	s.or = s._or ? writeCue(s._or) : undefined;
	if (s._items) {
		const items = writeItems(s._items);
		s.make = items.length === 0 ? undefined : items.length === 1 ? items[0] : items;
	}
};

export const newStep = (): RawStep => ({
	_at: { type: 'supply', supply: '' },
	_or: null,
	_items: [{ name: '', count: '', label: '' }]
});
