<script lang="ts">
	import { tick, untrack } from 'svelte';
	import BuildStep from './BuildStep.svelte';
	import BuildCheatSheet from './BuildCheatSheet.svelte';
	import type { BuildOrder } from './types';

	// `backHref` is the "All builds" link; null hides it (the preview site has
	// no browse page to go back to).
	// `view` is bindable so a host (the preview site) can drive the toggle.
	let {
		build,
		backHref = '/builds',
		view = $bindable('guide')
	}: { build: BuildOrder; backHref?: string | null; view?: 'guide' | 'sheet' } = $props();

	// The route remounts this component via {#key} on every slug change, so `build`
	// never changes for a given instance. Snapshot the step list once for the
	// init-time sizing arrays below (untrack documents that the fixed capture is
	// intentional, not a missed reactive dependency).
	const steps = untrack(() => build.steps);

	// `view`: 'guide' is the in-depth build order; 'sheet' is the minified cheat sheet.

	type Link = { d: string; buildKey: string; cueKey: string };

	let board: HTMLDivElement | undefined = $state();
	const cardEls: (HTMLElement | undefined)[] = $state(steps.map(() => undefined));

	// Layout output, filled by measure(): a top offset + dot y for each step, the
	// board height, and the connector paths.
	let tops = $state<number[]>(steps.map(() => 0));
	let dotYs = $state<number[]>(steps.map(() => 12));
	let sectionTops = $state<{ title: string; top: number }[]>([]);
	let boardH = $state(0);
	let centerX = $state(0);
	let links = $state<Link[]>([]);
	let hover = $state<string | null>(null); // the step key under the cursor
	let narrow = $state(false);
	let measured = $state(false); // hide the board until the first pack, no flash

	const stepKey = (i: number) => build.steps[i].id ?? `s${i}`;
	const sideOf = (i: number): 'left' | 'right' => (build.steps[i].use ? 'right' : 'left');
	const dotClass = (i: number) => build.steps[i].trigger.kind;
	const indexOfKey = new Map(steps.map((s, i) => [stepKey(i), i]));

	// Coupled masonry. Each column (build / do-this) packs tightly on its own, but
	// a shared cursor keeps game order: the next beat — whichever side — sits just
	// below THIS beat's header, not below its note. A long note therefore bleeds
	// down past the opposite column (they never share a horizontal half) instead
	// of reserving that height on both sides. The result stays dense but ordered.
	const GAP = 16; // min gap between two cards in the same column
	const ORDER_GAP = 14; // how far the next beat drops below this beat's header
	const SECTION_GAP = 30; // space above a section divider (not the first)
	const SECTION_BAND = 44; // vertical room a divider reserves before its steps

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
		const nextTops = build.steps.map(() => 0);
		const nextDots = build.steps.map(() => 12);
		const nextSections: { title: string; top: number }[] = [];

		build.steps.forEach((_, i) => {
			const node = cardEls[i];
			const card = node?.querySelector('.card') as HTMLElement | null;
			if (!node || !card) return;

			// Section boundary: flush both columns to a common baseline, reserve a
			// band for the divider, and start the section clean below it. This also
			// stops a long note in one section from bleeding into the next.
			const secTitle = build.steps[i].section;
			if (secTitle) {
				const base = Math.max(colY.left, colY.right, cursor);
				const bandTop = i === 0 ? 0 : base + SECTION_GAP;
				nextSections.push({ title: secTitle, top: bandTop + SECTION_BAND / 2 });
				const after = bandTop + SECTION_BAND;
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
		boardH = Math.max(colY.left, colY.right) - GAP;

		// Connectors: each `@N%` cue points back up to the step that builds the
		// thing it waits on. Both dots sit on the centre spine; bow just into the
		// channel beside it so the line never crosses a card body.
		const out: Link[] = [];
		build.steps.forEach((s, i) => {
			if (s.trigger.kind !== 'percent' || !s.trigger.ref) return;
			const bi = indexOfKey.get(s.trigger.ref);
			if (bi === undefined) return;
			const by = nextDots[bi];
			const cy = nextDots[i];
			const bx = cx - 12;
			out.push({
				buildKey: s.trigger.ref,
				cueKey: stepKey(i),
				d: `M ${cx} ${cy} C ${bx} ${cy}, ${bx} ${by}, ${cx - 7} ${by}`
			});
		});
		links = out;
		measured = true;
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

	// Re-runs whenever the guide is (re)shown: switching to the cheat sheet and
	// back re-creates the board, so the layout must be re-measured each time.
	$effect(() => {
		if (view !== 'guide' || !board) return;
		measured = false;
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
		const imgs = Array.from(board.querySelectorAll('img'));
		imgs.forEach((im) => im.addEventListener('load', relayout));
		return () => {
			ro.disconnect();
			imgs.forEach((im) => im.removeEventListener('load', relayout));
		};
	});
</script>

<div class="page">
	{#if backHref}<a class="back" href={backHref}>&larr; All builds</a>{/if}

	<header class="head">
		<span class="matchup">{build.matchup}</span>
		<h1>{build.title}</h1>
		<p class="by">
			{#if build.creator}<span>by <b>{build.creator}</b></span>{/if}
			{#if build.submitter}<span class="submitter">submitted by {build.submitter}</span>{/if}
		</p>
	</header>

	<div class="viewtoggle" role="tablist" aria-label="View">
		<button
			role="tab"
			aria-selected={view === 'guide'}
			class:active={view === 'guide'}
			onclick={() => (view = 'guide')}>Guide</button
		>
		<button
			role="tab"
			aria-selected={view === 'sheet'}
			class:active={view === 'sheet'}
			onclick={() => (view = 'sheet')}>Cheat sheet</button
		>
	</div>

	{#if build.references?.length}
		<div class="refs">
			{#each build.references as ref (ref.url)}
				<a class="ref {ref.kind}" href={ref.url} target="_blank" rel="noopener noreferrer">
					<span class="ico">{ref.kind === 'youtube' ? '▶' : '↓'}</span>
					{ref.label ?? (ref.kind === 'youtube' ? 'Watch on YouTube' : 'Download replay')}
				</a>
			{/each}
		</div>
	{/if}

	{#if view === 'sheet'}
		<BuildCheatSheet {build} />
	{:else}
		<section class="objective">
			<h2>Objective</h2>
			<p>{build.objective}</p>
		</section>

		<div class="legend">
			<span class="lg supply">supply</span>
			<span class="lg time">time</span>
			<span class="lg percent">when built</span>
		</div>

		{#if !narrow}
			<div class="cols">
				<span class="cap left">Build</span>
				<span></span>
				<span class="cap right">Tasks</span>
			</div>
		{/if}

		<div
			class="board"
			class:narrow
			class:ready={measured}
			bind:this={board}
			style="height:{boardH}px"
		>
			<div class="spine" style="left:{centerX}px"></div>

			{#each sectionTops as sec (sec.title + sec.top)}
				<div class="section" class:narrow style="top:{sec.top}px">
					<span class="section-title" style="left:{centerX}px">{sec.title}</span>
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

			{#each build.steps as step, i (i)}
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
	{/if}
</div>

<style>
	.page {
		max-width: 940px;
		margin: 0 auto;
		padding: 28px 20px 80px;
	}
	.back {
		display: inline-block;
		margin-bottom: 14px;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-3);
		text-decoration: none;
	}
	.back:hover {
		color: var(--text);
	}
	.head {
		margin-bottom: 20px;
	}
	.matchup {
		display: inline-block;
		font-family: ui-monospace, monospace;
		font-weight: 700;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		padding: 2px 8px;
		border-radius: 999px;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.head h1 {
		margin: 8px 0 2px;
		font-size: 1.7rem;
		font-weight: 800;
		color: var(--text);
	}
	.by {
		margin: 6px 0 0;
		display: flex;
		gap: 12px;
		align-items: baseline;
		flex-wrap: wrap;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.by b {
		color: var(--text);
		font-weight: 600;
	}

	/* segmented Guide / Cheat-sheet switch */
	.viewtoggle {
		display: inline-flex;
		gap: 2px;
		margin: 0 0 20px;
		padding: 3px;
		border-radius: 999px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
	}
	.viewtoggle button {
		appearance: none;
		border: none;
		cursor: pointer;
		padding: 5px 14px;
		border-radius: 999px;
		background: transparent;
		color: var(--text-2);
		font-size: 0.82rem;
		font-weight: 600;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.viewtoggle button:hover {
		color: var(--text);
	}
	.viewtoggle button.active {
		background: var(--accent);
		color: #0b0d10;
	}
	.by .submitter {
		color: var(--text-3);
		font-size: 0.82rem;
	}

	.refs {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin: 0 0 24px;
	}
	.ref {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border-radius: var(--radius);
		font-size: 0.88rem;
		font-weight: 600;
		text-decoration: none;
		color: var(--text);
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.ref:hover {
		background: var(--bg-hover);
	}
	.ref .ico {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 5px;
		font-size: 0.66rem;
		color: #fff;
	}
	.ref.youtube .ico {
		background: #ff0033;
	}
	.ref.replay .ico {
		background: var(--link);
	}

	.objective {
		margin: 0 0 24px;
		padding: 14px 16px;
		border-radius: var(--radius);
		background: var(--bg-elev);
		border: 1px solid var(--border);
	}
	.objective h2 {
		margin: 0 0 6px;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-3);
	}
	.objective p {
		margin: 0;
		line-height: 1.55;
		color: var(--text-2);
	}

	.legend {
		display: flex;
		gap: 14px;
		margin: 0 0 18px 2px;
	}
	.lg {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.lg::before {
		content: '';
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.lg.supply::before {
		background: var(--link);
	}
	.lg.time::before {
		background: var(--accent);
	}
	.lg.percent::before {
		background: var(--green);
	}

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
</style>
