// BW tech ids -> display names (techdata.dat, the classic 44-entry table; ids
// are stable). Only researched techs (those with a research time at a building)
// appear in build orders — innate abilities (Scanner Sweep, Dark Swarm, Parasite,
// Archon Warp, Feedback, …) are never researched, so they're intentionally
// omitted; anything unlisted falls back to "Tech #id".
export const TECHS: ReadonlyMap<number, string> = new Map([
	[0, 'Stim Packs'],
	[1, 'Lockdown'],
	[2, 'EMP Shockwave'],
	[3, 'Spider Mines'],
	[5, 'Tank Siege Mode'],
	[7, 'Irradiate'],
	[8, 'Yamato Gun'],
	[9, 'Cloaking Field'], // Wraith
	[10, 'Personnel Cloaking'], // Ghost
	[11, 'Burrowing'],
	[13, 'Spawn Broodlings'],
	[15, 'Plague'],
	[16, 'Consume'],
	[17, 'Ensnare'],
	[19, 'Psionic Storm'],
	[20, 'Hallucination'],
	[21, 'Recall'],
	[22, 'Stasis Field'],
	[24, 'Restoration'],
	[25, 'Disruption Web'],
	[27, 'Mind Control'],
	[30, 'Optical Flare'],
	[31, 'Maelstrom'],
	[32, 'Lurker Aspect']
]);
