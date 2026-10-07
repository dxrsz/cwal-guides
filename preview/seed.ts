// A replay's extracted build -> a starting article. The extractor (the build
// classifier's, the same one cwal.gg runs) reports every building, unit and
// tracked upgrade a player started in the first 8 minutes, with the supply at
// the time. This turns one player's events into guide steps a writer can
// trim and annotate: each building (and overlord) is its own step, and runs
// of the same unit between two buildings collapse into one "N Marine" step.
import { TABLES, type Kind } from '../src/names';
import type { Article, RawStep } from './article';

export type TimelineEvent = {
	slug: string;
	category: 'building' | 'unit' | 'upgrade';
	seconds: number;
	constructed: boolean;
	supply: number | null;
};
export type TimelinePlayer = {
	player_id: number;
	name: string;
	race: string;
	events: TimelineEvent[];
};
export type Timeline = { map: string; frame_count: number; players: TimelinePlayer[] };

const slugOf = (name: string) =>
	name
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');

// The extractor's slugs are the snake_case table names, except upgrades,
// which it names by effect.
const UPGRADE_SLUGS: Record<string, string> = {
	zergling_speed: 'Metabolic Boost',
	zergling_attack: 'Adrenal Glands',
	hydralisk_speed: 'Muscular Augments',
	hydralisk_range: 'Grooved Spines',
	overlord_speed: 'Pneumatized Carapace',
	dragoon_range: 'Singularity Charge',
	zealot_speed: 'Leg Enhancements',
	vulture_speed: 'Ion Thrusters'
};
const NAMES = new Map<string, string>();
for (const kind of ['building', 'unit', 'upgrade', 'tech'] as Kind[])
	for (const name of TABLES[kind].values())
		if (!NAMES.has(slugOf(name))) NAMES.set(slugOf(name), name);
const nameOf = (e: TimelineEvent) => UPGRADE_SLUGS[e.slug] ?? NAMES.get(e.slug);

/** Supply cues read well early; past this, players think in clock time. */
const SUPPLY_UNTIL = 5 * 60;
/** Units that are really supply buildings: a step each, never grouped. */
const SOLO_UNITS = new Set(['overlord']);

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cue = (e: TimelineEvent) =>
	e.supply != null && e.seconds < SUPPLY_UNTIL ? `${e.supply} supply` : clock(e.seconds);

const RACE: Record<string, string> = { T: 'T', P: 'P', Z: 'Z' };

export function seedArticle(tl: Timeline, playerId: number): Article {
	const me = tl.players.find((p) => p.player_id === playerId)!;
	const others = tl.players.filter((p) => p.player_id !== playerId);
	const vs = others.length === 1 ? RACE[others[0].race] : undefined;

	type Group = { step: RawStep; name: string; count: number };
	const steps: RawStep[] = [];
	let open = new Map<string, Group>(); // unit runs since the last building

	for (const e of [...me.events].sort((a, b) => a.seconds - b.seconds)) {
		if (!e.constructed) continue; // the starting town hall
		const name = nameOf(e);
		if (!name) continue;
		if (e.category === 'unit' && !SOLO_UNITS.has(e.slug)) {
			const g = open.get(name);
			if (g) {
				g.count++;
				g.step.make = `${g.count} ${name}`;
				continue;
			}
			const step: RawStep = { at: cue(e), make: name };
			open.set(name, { step, name, count: 1 });
			steps.push(step);
			continue;
		}
		open = new Map();
		steps.push({ at: cue(e), make: name });
	}
	if (steps.length) steps[0] = { section: 'Opener', ...steps[0] };

	return {
		title: '',
		matchup: `${RACE[me.race] ?? 'T'}v${vs ?? 'T'}`,
		creator: me.name,
		objective: '',
		steps
	};
}
