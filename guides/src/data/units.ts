// Producible mobile units for the units-produced counter, id -> display
// name (mirrors bwdata units.dat). Siege Mode (30) canonicalizes to Tank
// Mode (5) so mode toggles don't recount; eggs/cocoons/larvae, interceptors,
// scarabs, spider mines, and broodlings are intentionally absent.
export const UNITS: ReadonlyMap<number, string> = new Map([
	// Terran
	[0, 'Marine'],
	[1, 'Ghost'],
	[2, 'Vulture'],
	[3, 'Goliath'],
	[5, 'Siege Tank'],
	[7, 'SCV'],
	[8, 'Wraith'],
	[9, 'Science Vessel'],
	[11, 'Dropship'],
	[12, 'Battlecruiser'],
	[32, 'Firebat'],
	[34, 'Medic'],
	[58, 'Valkyrie'],
	// Zerg
	[37, 'Zergling'],
	[38, 'Hydralisk'],
	[39, 'Ultralisk'],
	[41, 'Drone'],
	[42, 'Overlord'],
	[43, 'Mutalisk'],
	[44, 'Guardian'],
	[45, 'Queen'],
	[46, 'Defiler'],
	[47, 'Scourge'],
	[50, 'Infested Terran'],
	[62, 'Devourer'],
	[103, 'Lurker'],
	// Protoss
	[60, 'Corsair'],
	[61, 'Dark Templar'],
	[63, 'Dark Archon'],
	[64, 'Probe'],
	[65, 'Zealot'],
	[66, 'Dragoon'],
	[67, 'High Templar'],
	[68, 'Archon'],
	[69, 'Shuttle'],
	[70, 'Scout'],
	[71, 'Arbiter'],
	[72, 'Carrier'],
	[83, 'Reaver'],
	[84, 'Observer']
]);

/** Mode changes that must not recount (Siege Mode <-> Tank Mode). */
export const canonUnit = (t: number) => (t === 30 ? 5 : t);
