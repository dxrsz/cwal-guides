<script lang="ts">
	import { tick, untrack } from 'svelte';
	import BuildStep from './BuildStep.svelte';
	import type { Step } from './types';

	// One path through a guide, laid out on the spine. BuildGuide remounts this
	// (via {#key}) whenever the path changes, so `steps` is fixed per instance.
	// `choices` are the choice stages on this path: `at` is the index of the
	// step each one heads; the board draws its question and option tabs under
	// that stage's divider.
	export type BoardChoice = {
		si: number;
		at: number;
		question: string;
		options: { id: string; label: string }[];
		picked: string;
		read?: string;
	};
	let {
		steps: stepsIn,
		choices: choicesIn = [],
		onpick,
		onmeasured
	}: {
		steps: Step[];
		choices?: BoardChoice[];
		onpick?: (si: number, id: string, el: HTMLElement) => void;
		onmeasured?: () => void;
	} = $props();

	// Fixed for this instance (see above): snapshot once.
	const steps = untrack(() => stepsIn);
	const choices = untrack(() => choicesIn);

	type Link = { d: string; buildKey: string; cueKey: string };

	let board: HTMLDivElement | undefined = $state();
	const cardEls: (HTMLElement | undefined)[] = $state(steps.map(() => undefined));
	const choiceEls: (HTMLElement | undefined)[] = $state(choices.map(() => undefined));

	let tops = $state<number[]>(steps.map(() => 0));
	let dotYs = $state<number[]>(steps.map(() => 12));
	let sectionTops = $state<{ title: string; top: number }[]>([]);
	let choiceTops = $state<number[]>(choices.map(() => 0));
	let boardH = $state(0);
	let centerX = $state(0);
	let links = $state<Link[]>([]);
	let hover = $state<string | null>(null); // the step key under the cursor
	let narrow = $state(false);
	let measured = $state(false); // hide the board until the first pack, no flash

	// Steps nothing points at have no id; key them by position on this path,
	// in a namespace the parser's own ids (`s<n>`, by position in the whole
	// guide) can't collide with.
	const stepKey = (i: number) => steps[i].id ?? `#${i}`;
	const sideOf = (i: number): 'left' | 'right' => (steps[i].use ? 'right' : 'left');
	const dotClass = (i: number) => steps[i].trigger.kind;
	const indexOfKey = new Map(steps.map((s, i) => [stepKey(i), i]));
	const choiceAt = new Map(choices.map((c, k) => [c.at, k]));

	// Coupled masonry. Each column (build / do-this) packs tightly on its own, but
	// a shared cursor keeps game order: the next beat — whichever side — sits just
	// below THIS beat's header, not below its note. A long note therefore bleeds
	// down past the opposite column (they never share a horizontal half) instead
	// of reserving that height on both sides. The result stays dense but ordered.
	const GAP = 16; // min gap between two cards in the same column
	const ORDER_GAP = 14; // how far the next beat drops below this beat's header
	const SECTION_GAP = 30; // space above a section divider (not the first)
	const SECTION_BAND = 44; // vertical room a divider reserves before its steps
	const CHOICE_GAP = 14; // space under a choice's tabs before its first step

	const measure = async () => {
		const el = board;
		if (!el) return;
		await tick();
		const bw = el.clientWidth;
		narrow = bw < 720;
		const cx = narrow ? 6 : bw / 2;
		centerX = cx;

		const colY = { left: 0, right: 0 };
		let cursor = 0;
		const nextTops = steps.map(() => 0);
		const nextDots = steps.map(() => 12);
		const nextSections: { title: string; top: number }[] = [];
		const nextChoices = choices.map(() => 0);

		steps.forEach((_, i) => {
			const node = cardEls[i];
			const card = node?.querySelector('.card') as HTMLElement | null;
			if (!node || !card) return;

			// Section boundary: flush both columns to a common baseline, reserve a
			// band for the divider, and start the section clean below it. This also
			// stops a long note in one section from bleeding into the next. A
			// choice stage's band also holds its question and tabs.
			const secTitle = steps[i].section;
			if (secTitle) {
				const base = Math.max(colY.left, colY.right, cursor);
				const bandTop = i === 0 ? 0 : base + SECTION_GAP;
				nextSections.push({ title: secTitle, top: bandTop + SECTION_BAND / 2 });
				let after = bandTop + SECTION_BAND;
				const k = choiceAt.get(i);
				if (k !== undefined) {
					nextChoices[k] = after;
					after += (choiceEls[k]?.offsetHeight ?? 0) + CHOICE_GAP;
				}
				colY.left = after;
				colY.right = after;
				cursor = after;
			}

			const side = narrow ? 'left' : sideOf(i);
			// Measure the card, not the node: the card is absolutely positioned, so
			// the node itself has no height. header = card top down to the bottom of
			// the action row (the ordered beat); full = whole card including any note
			// hanging below it.
			const cardTop = card.getBoundingClientRect().top;
			const action = card.querySelector('.action') as HTMLElement | null;
			const cue = card.querySelector('.cue') as HTMLElement | null;
			const fullH = card.offsetHeight;
			const headerH = action ? action.getBoundingClientRect().bottom - cardTop : fullH;
			const cueMid = cue ? cue.getBoundingClientRect().top - cardTop + cue.offsetHeight / 2 : 12;

			const top = narrow ? cursor : Math.max(colY[side], cursor);
			nextTops[i] = top;
			nextDots[i] = top + cueMid;
			colY[side] = top + fullH + GAP;
			cursor = top + (narrow ? fullH : headerH) + (narrow ? GAP : ORDER_GAP);
		});

		tops = nextTops;
		dotYs = nextDots;
		sectionTops = nextSections;
		choiceTops = nextChoices;
		boardH = Math.max(colY.left, colY.right) - GAP;

		// Connectors: each `@N%` cue points back up to the step that builds the
		// thing it waits on — on this path, so after a choice it may be any of the
		// options' builders (`alts`). Both dots sit on the centre spine; bow just
		// into the channel beside it so the line never crosses a card body.
		const out: Link[] = [];
		steps.forEach((s, i) => {
			if (s.trigger.kind !== 'percent') return;
			const ref = [s.trigger.ref, ...(s.trigger.alts ?? [])].find(
				(r) => r !== undefined && indexOfKey.has(r)
			);
			if (ref === undefined) return;
			const bi = indexOfKey.get(ref)!;
			if (bi >= i) return;
			const by = nextDots[bi];
			const cy = nextDots[i];
			const bx = cx - 12;
			out.push({
				buildKey: ref,
				cueKey: stepKey(i),
				d: `M ${cx} ${cy} C ${bx} ${cy}, ${bx} ${by}, ${cx - 7} ${by}`
			});
		});
		links = out;
		const first = !measured;
		measured = true;
		if (first) onmeasured?.();
	};

	const activeKeys = $derived.by(() => {
		const s = new Set<string>();
		if (hover) {
			for (const l of links) {
				if (l.buildKey === hover || l.cueKey === hover) {
					s.add(l.buildKey);
					s.add(l.cueKey);
				}
			}
		}
		return s;
	});
	const linkActive = (l: Link) => hover !== null && (l.buildKey === hover || l.cueKey === hover);

	$effect(() => {
		if (!board) return;
		measure();
		const relayout = () => measure();
		const ro = new ResizeObserver(relayout);
		ro.observe(board);
		// content reflow (font load, wrapping) changes card heights → re-pack.
		// Observe the .card (the node is a zero-height positioning anchor).
		cardEls.forEach((c) => {
			const card = c?.querySelector('.card');
			if (card) ro.observe(card);
		});
		choiceEls.forEach((c) => c && ro.observe(c));
		const imgs = Array.from(board.querySelectorAll('img'));
		imgs.forEach((im) => im.addEventListener('load', relayout));
		return () => {
			ro.disconnect();
			imgs.forEach((im) => im.removeEventListener('load', relayout));
		};
	});
</script>

{#if !narrow}
	<div class="cols">
		<span class="cap left">Build</span>
		<span></span>
		<span class="cap right">Tasks</span>
	</div>
{/if}

<div class="board" class:narrow class:ready={measured} bind:this={board} style="height:{boardH}px">
	<div class="spine" style="left:{centerX}px"></div>

	{#each sectionTops as sec (sec.title + sec.top)}
		<div class="section" class:narrow style="top:{sec.top}px">
			<span class="section-title" style="left:{centerX}px">{sec.title}</span>
		</div>
	{/each}

	{#each choices as c, k (c.si)}
		<div
			class="choice"
			class:narrow
			data-si={c.si}
			style="top:{choiceTops[k]}px; --cx:{centerX}px"
			bind:this={choiceEls[k]}
		>
			<span class="q">{c.question}</span>
			<div class="opts" role="tablist" aria-label={c.question}>
				{#each c.options as o (o.id)}
					<button
						role="tab"
						aria-selected={o.id === c.picked}
						class:active={o.id === c.picked}
						onclick={(e) => o.id !== c.picked && onpick?.(c.si, o.id, e.currentTarget)}
						>{o.label}</button
					>
				{/each}
			</div>
			{#if c.read}<span class="read">{c.read}</span>{/if}
		</div>
	{/each}

	<svg class="links" aria-hidden="true">
		<defs>
			<marker id="arw" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
				<path d="M0,0 L6,3 L0,6 Z" fill="var(--green)" />
			</marker>
		</defs>
		{#each links as l (l.buildKey + l.cueKey)}
			<path
				d={l.d}
				class:active={linkActive(l)}
				class:dim={hover !== null && !linkActive(l)}
				fill="none"
				stroke="var(--green)"
				stroke-width="2"
				marker-end="url(#arw)"
			/>
		{/each}
	</svg>

	{#each steps as step, i (i)}
		<div
			class="node {sideOf(i)}"
			class:active={activeKeys.has(stepKey(i))}
			data-step-id={stepKey(i)}
			style="top:{tops[i]}px"
			bind:this={cardEls[i]}
			onmouseenter={() => (hover = stepKey(i))}
			onmouseleave={() => (hover = null)}
			role="listitem"
		>
			<span
				class="dot {dotClass(i)}"
				class:hollow={step.use}
				style="left:{centerX}px; top:{dotYs[i] - tops[i]}px"
			></span>
			<div class="card">
				<BuildStep {step} side={narrow ? 'right' : sideOf(i)} />
			</div>
		</div>
	{/each}
</div>

<style>
	.cols {
		display: grid;
		grid-template-columns: 1fr 44px 1fr;
		align-items: center;
		margin-bottom: 8px;
	}
	.cap {
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-3);
	}
	.cap.left {
		text-align: right;
		padding-right: 4px;
	}
	.cap.right {
		text-align: left;
		padding-left: 4px;
	}
	/* the coupled-masonry board: cards are absolutely positioned from measured
	   heights, so a note on one side never reserves height on the other. */
	.board {
		position: relative;
		opacity: 0;
	}
	.board.ready {
		opacity: 1;
		transition: opacity 0.12s;
	}
	.spine {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		transform: translateX(-1px);
		background: var(--border);
	}
	/* a section divider: a full-width rule with a centred title pill on the spine.
	   above the connector layer (z-index 2) so a cross-section connector passes
	   behind the divider and its opaque title pill, not over the text. */
	.section {
		position: absolute;
		left: 0;
		right: 0;
		height: 0;
		border-top: 1px solid var(--border-strong);
		z-index: 3;
	}
	.section-title {
		position: absolute;
		top: 0;
		transform: translate(-50%, -50%);
		padding: 3px 14px;
		border-radius: 999px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		color: var(--text-2);
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		white-space: nowrap;
	}
	.section.narrow .section-title {
		transform: translate(0, -50%);
		left: 22px !important;
	}

	.links {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		z-index: 2;
	}
	.links path {
		opacity: 0.5;
		transition:
			opacity 0.15s,
			stroke-width 0.15s;
	}
	.links path.active {
		opacity: 1;
		stroke-width: 3;
	}
	.links path.dim {
		opacity: 0.12;
	}

	.node {
		position: absolute;
		left: 0;
		right: 0;
	}
	.card {
		position: absolute;
		width: min(400px, calc(50% - 34px));
	}
	.node.left .card {
		right: calc(50% + 14px);
	}
	.node.right .card {
		left: calc(50% + 14px);
	}
	.card :global(.step) {
		padding: 6px;
		border-radius: var(--radius);
		transition:
			background 0.15s,
			box-shadow 0.15s;
	}

	.dot {
		position: absolute;
		z-index: 3;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--tracked);
		box-shadow: 0 0 0 3px var(--bg);
		transform: translateX(-50%);
	}
	.dot.supply {
		background: var(--link);
	}
	.dot.time {
		background: var(--accent);
	}
	.dot.percent {
		background: var(--green);
	}
	.dot.hollow {
		width: 8px;
		height: 8px;
		background: var(--bg);
		border: 2px solid var(--text-3);
	}

	.node.active .card :global(.step) {
		background: color-mix(in srgb, var(--green) 9%, transparent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--green) 45%, transparent);
	}
	.node.active .dot {
		box-shadow:
			0 0 0 3px var(--bg),
			0 0 8px 1px var(--green);
	}

	/* Narrow: one left-railed column. measure() stacks everything on the left and
	   forces cards left-aligned; here we just re-place the card box and un-mirror
	   the build cards' internal alignment. */
	.board.narrow .card {
		width: calc(100% - 24px);
		left: 24px;
		right: auto;
	}
	.board.narrow .card :global(.step.left) {
		flex-direction: row;
		text-align: left;
	}
	.board.narrow .card :global(.step.left .cue),
	.board.narrow .card :global(.step.left .labels) {
		align-items: flex-start;
	}
	.board.narrow .card :global(.step.left .action) {
		flex-direction: row;
	}
	.board.narrow .card :global(.step.left .note.attached) {
		padding-left: 10px;
		padding-right: 0;
		border-left: 2px solid var(--cue);
		border-right: none;
	}

	/* a choice: the question, option tabs and the picked option's "how you
	   know" line, centred on the spine under its stage divider. */
	.choice {
		position: absolute;
		left: var(--cx);
		transform: translateX(-50%);
		z-index: 4;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		max-width: min(640px, 100%);
		text-align: center;
	}
	.choice.narrow {
		left: 22px;
		right: 0;
		transform: none;
		align-items: flex-start;
		text-align: left;
	}
	.choice .q {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.choice .opts {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 3px;
		border-radius: 12px;
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
	}
	.choice .opts button {
		appearance: none;
		border: none;
		cursor: pointer;
		padding: 5px 12px;
		border-radius: 9px;
		background: transparent;
		color: var(--text-2);
		font-size: 0.82rem;
		font-weight: 600;
	}
	.choice .opts button:hover {
		color: var(--text);
		background: var(--bg-hover);
	}
	.choice .opts button.active {
		background: var(--accent);
		color: #0b0d10;
	}
	.choice .read {
		font-size: 0.8rem;
		font-style: italic;
		color: var(--text-3);
	}
</style>
