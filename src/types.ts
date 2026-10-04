// A stylized, top-to-bottom build-order guide. Steps are always in game order,
// but each step's *cue* is expressed the way a player actually thinks about it:
// by supply, by a wall-clock time, by another thing finishing, or simply "right
// after the last step". Prototype: builds are hand-authored for now; the
// dynamic builder comes later.

/** When a step happens. The whole point is to let a step say "when the Academy
 *  finishes" instead of forcing everything onto a clock. */
export type Trigger =
	| { kind: 'supply'; supply: number } // at N supply
	| { kind: 'time'; seconds: number } // at mm:ss on the clock
	// when X is N% built. `ref` is the `id` of the step that builds X, so the
	// guide can draw a connector back to it; `of`/`ofId`/`ofKind` are its label +
	// icon (ofKind defaults to 'building'). This is the preferred cue: prefer
	// tying a step to something finishing over the bare 'immediate' below.
	| {
			kind: 'percent';
			percent: number;
			of: string;
			ofId?: number;
			ofKind?: Produce['kind'];
			ref?: string;
	  }
	| { kind: 'immediate' }; // follows the previous step; use sparingly

/** One thing produced in a step, for its icon + label. `id` is the BW unit-type
 *  id the extracted icon assets are keyed by. */
export type Produce = {
	kind: 'building' | 'unit' | 'upgrade' | 'tech';
	id: number;
	name: string;
	count?: number;
};

/** One row of the guide. */
export type Step = {
	/** Stable slug so a later step's `@100%` cue can reference (and connect to)
	 *  this one. Only needed on steps something else points at. */
	id?: string;
	/** When set, this step begins a new titled section of the timeline (e.g.
	 *  "Opener", "Follow-up"). Sections can be named anything and there can be any
	 *  number of them; each runs until the next step that starts one. */
	section?: string;
	trigger: Trigger;
	/** A second cue shown alongside the first ("39 supply, or 4:50"). */
	altTrigger?: Trigger;
	/** Zero or more things built/produced here ("Gas & Academy" is two). */
	produce?: Produce[];
	/** This step *uses* the pictured thing (scout with an SCV, move out with the
	 *  army) rather than building it — rendered muted so it doesn't read as a
	 *  build step. Default false = a build. */
	use?: boolean;
	/** The action, when it isn't a plain build ("cut SCVs", "move out"). */
	instruction?: string;
	/** A short line under the action, always shown: the quick what/where. */
	description?: string;
	/** The deeper why — timings, rationale, the reasons a step exists. Hidden
	 *  behind a toggle by default so the dense layout stays readable; expanding
	 *  it re-packs the columns. */
	notes?: string;
	/** A note shown before the action line. */
	before?: string;
};

/** A link out to source material for a build. */
export type Reference = {
	kind: 'youtube' | 'replay';
	url: string;
	label?: string;
};

export type BuildOrder = {
	title: string;
	matchup: string;
	/** Who devised the build. */
	creator?: string;
	/** Who added it to the site (may differ from the creator). */
	submitter?: string;
	/** A one-line hook shown on the browse card (shorter than the objective). */
	tagline?: string;
	/** The overview / objective shown up top. */
	objective: string;
	/** Links to the replays / videos the build comes from. */
	references?: Reference[];
	steps: Step[];
};
