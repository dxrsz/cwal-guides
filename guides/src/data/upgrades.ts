// BW upgrade ids -> display names (upgrades.dat, the classic 61-entry table;
// ids are stable). Only the ids that are actually researched at a building
// appear in build orders; anything unlisted falls back to "Upgrade #id".
export const UPGRADES: ReadonlyMap<number, string> = new Map([
	// armor / plating (levelled)
	[0, 'Terran Infantry Armor'],
	[1, 'Terran Vehicle Plating'],
	[2, 'Terran Ship Plating'],
	[3, 'Zerg Carapace'],
	[4, 'Zerg Flyer Carapace'],
	[5, 'Protoss Ground Armor'],
	[6, 'Protoss Air Armor'],
	// weapons (levelled)
	[7, 'Terran Infantry Weapons'],
	[8, 'Terran Vehicle Weapons'],
	[9, 'Terran Ship Weapons'],
	[10, 'Zerg Melee Attacks'],
	[11, 'Zerg Missile Attacks'],
	[12, 'Zerg Flyer Attacks'],
	[13, 'Protoss Ground Weapons'],
	[14, 'Protoss Air Weapons'],
	[15, 'Protoss Plasma Shields'],
	// single-level upgrades
	[16, 'U-238 Shells'], // Marine range
	[17, 'Ion Thrusters'], // Vulture speed
	[19, 'Titan Reactor'], // Science Vessel energy
	[20, 'Ocular Implants'], // Ghost sight
	[21, 'Moebius Reactor'], // Ghost energy
	[22, 'Apollo Reactor'], // Wraith energy
	[23, 'Colossus Reactor'], // Battlecruiser energy
	[24, 'Ventral Sacs'], // Overlord transport
	[25, 'Antennae'], // Overlord sight
	[26, 'Pneumatized Carapace'], // Overlord speed
	[27, 'Metabolic Boost'], // Zergling speed
	[28, 'Adrenal Glands'], // Zergling attack speed
	[29, 'Muscular Augments'], // Hydralisk speed
	[30, 'Grooved Spines'], // Hydralisk range
	[31, 'Gamete Meiosis'], // Queen energy
	[32, 'Metasynaptic Node'], // Defiler energy
	[33, 'Singularity Charge'], // Dragoon range
	[34, 'Leg Enhancements'], // Zealot speed
	[35, 'Scarab Damage'], // Reaver
	[36, 'Reaver Capacity'], // Reaver
	[37, 'Gravitic Drive'], // Shuttle speed
	[38, 'Sensor Array'], // Observer sight
	[39, 'Gravitic Boosters'], // Observer speed
	[40, 'Khaydarin Amulet'], // High Templar energy
	[41, 'Apial Sensors'], // Scout sight
	[42, 'Gravitic Thrusters'], // Scout speed
	[43, 'Carrier Capacity'], // Carrier interceptors
	[44, 'Khaydarin Core'], // Arbiter energy
	[47, 'Argus Jewel'], // Corsair energy
	[49, 'Argus Talisman'], // Dark Archon energy
	[51, 'Caduceus Reactor'], // Medic energy
	[52, 'Chitinous Plating'], // Ultralisk armor
	[53, 'Anabolic Synthesis'], // Ultralisk speed
	[54, 'Charon Boosters'] // Goliath range
]);
