// Name -> id lookup over the BW data tables, so an article can say
// "Engineering Bay" instead of 122. Matching ignores case, spacing and
// punctuation, and a few common shorthands are accepted as aliases.
import { BUILDINGS } from './data/buildings';
import { UNITS } from './data/units';
import { UPGRADES } from './data/upgrades';
import { TECHS } from './data/techs';
import type { Produce } from './types';

export type Kind = Produce['kind'];

export const TABLES: Record<Kind, ReadonlyMap<number, string>> = {
	building: BUILDINGS,
	unit: UNITS,
	upgrade: UPGRADES,
	tech: TECHS
};

/** Lookup order when an article doesn't say which kind a name is. */
const ORDER: Kind[] = ['building', 'unit', 'upgrade', 'tech'];

/** Shorthands players actually write, mapped to the table name. */
const ALIASES: Record<string, [Kind, string]> = {
	ebay: ['building', 'Engineering Bay'],
	'e-bay': ['building', 'Engineering Bay'],
	cc: ['building', 'Command Center'],
	depot: ['building', 'Supply Depot'],
	rax: ['building', 'Barracks'],
	comsat: ['building', 'ComSat Station'],
	turret: ['building', 'Missile Turret'],
	gas: ['building', 'Refinery'],
	'machine shop': ['building', 'Machine Shop'],
	gate: ['building', 'Gateway'],
	core: ['building', 'Cybernetics Core'],
	'cyber core': ['building', 'Cybernetics Core'],
	cannon: ['building', 'Photon Cannon'],
	robo: ['building', 'Robotics Facility'],
	citadel: ['building', 'Citadel of Adun'],
	hatch: ['building', 'Hatchery'],
	pool: ['building', 'Spawning Pool'],
	'hydra den': ['building', 'Hydralisk Den'],
	evo: ['building', 'Evolution Chamber'],
	sunken: ['building', 'Sunken Colony'],
	spore: ['building', 'Spore Colony'],
	vessel: ['unit', 'Science Vessel'],
	tank: ['unit', 'Siege Tank'],
	ling: ['unit', 'Zergling'],
	hydra: ['unit', 'Hydralisk'],
	muta: ['unit', 'Mutalisk'],
	ultra: ['unit', 'Ultralisk'],
	goon: ['unit', 'Dragoon'],
	dt: ['unit', 'Dark Templar'],
	ht: ['unit', 'High Templar'],
	obs: ['unit', 'Observer'],
	stim: ['tech', 'Stim Packs'],
	'stim pack': ['tech', 'Stim Packs'],
	'siege mode': ['tech', 'Tank Siege Mode'],
	mines: ['tech', 'Spider Mines'],
	storm: ['tech', 'Psionic Storm'],
	range: ['upgrade', 'U-238 Shells'],
	'marine range': ['upgrade', 'U-238 Shells'],
	'vulture speed': ['upgrade', 'Ion Thrusters'],
	'ling speed': ['upgrade', 'Metabolic Boost'],
	'goon range': ['upgrade', 'Singularity Charge'],
	'dragoon range': ['upgrade', 'Singularity Charge'],
	'zealot speed': ['upgrade', 'Leg Enhancements']
};

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9+]+/g, ' ')
		.trim();

type Hit = { kind: Kind; id: number; name: string };

const INDEX = new Map<string, Hit[]>();
for (const kind of ORDER) {
	for (const [id, name] of TABLES[kind]) {
		const key = norm(name);
		const hits = INDEX.get(key) ?? [];
		// Photon Cannon is listed twice (161/162); keep the first.
		if (!hits.some((h) => h.kind === kind)) hits.push({ kind, id, name });
		INDEX.set(key, hits);
	}
}

/** Resolve a name (optionally pinned to a kind) to its table entry. */
export const lookup = (name: string, kind?: Kind): Hit | undefined => {
	const key = norm(name);
	const alias = ALIASES[key] ?? ALIASES[name.toLowerCase().trim()];
	const hits = [...(INDEX.get(key) ?? [])];
	if (alias) {
		const [ak, an] = alias;
		const id = [...TABLES[ak]].find(([, n]) => n === an)![0];
		hits.push({ kind: ak, id, name: an });
	}
	return kind ? hits.find((h) => h.kind === kind) : hits[0];
};

/** Up to three known names that look like `name`, for "did you mean". */
export const suggest = (name: string): string[] => {
	const key = norm(name);
	const words = key.split(' ').filter((w) => w.length > 2);
	const all = [...INDEX.values()].flat().map((h) => h.name);
	const scored = all
		.map((n) => {
			const nk = norm(n);
			let score = 0;
			if (nk.startsWith(key) || key.startsWith(nk)) score += 3;
			for (const w of words) if (nk.includes(w)) score += 2;
			// typos: "Refinary", "Barraks"
			const d = lev(nk, key);
			if (d <= Math.max(1, Math.floor(nk.length / 4))) score += 4 - d;
			return { n, score };
		})
		.filter((s) => s.score >= 2)
		.sort((a, b) => b.score - a.score);
	return [...new Set(scored.map((s) => s.n))].slice(0, 3);
};

/** Edit distance, for typo suggestions. */
export const lev = (a: string, b: string): number => {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++)
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		prev = cur;
	}
	return prev[b.length];
};
