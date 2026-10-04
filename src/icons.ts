// Build-order icons: the pngs extracted from the game data, keyed by BW
// unit-type id. Same asset set cwal.gg's match build-order summary uses.
const iconMap = (glob: Record<string, string>): Record<string, string> =>
	Object.fromEntries(Object.entries(glob).map(([p, url]) => [p.match(/(\d+)\.png$/)![1], url]));

const BUILDINGS = iconMap(
	import.meta.glob('../assets/buildings/*.png', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>
);
const UNITS = iconMap(
	import.meta.glob('../assets/units/*.png', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>
);
const UPGRADES = iconMap(
	import.meta.glob('../assets/upgrades/*.png', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>
);
const TECHS = iconMap(
	import.meta.glob('../assets/techs/*.png', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>
);

/** Icon url for a produced thing, or undefined if we don't have that asset. */
export const iconFor = (kind: string, id: number): string | undefined => {
	const table =
		kind === 'unit' ? UNITS : kind === 'upgrade' ? UPGRADES : kind === 'tech' ? TECHS : BUILDINGS;
	return table[String(id)];
};
