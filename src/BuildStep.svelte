<script lang="ts">
	import { fmtClock } from './format';
	import { iconFor } from './icons';
	import type { Source, Step, Trigger } from './types';

	// `side` places the card relative to the central spine: builds sit on the
	// left, "do this" (use) steps on the right. The layout mirrors so that each
	// card's cue badge always hugs the rail and the content reads outward.
	let { step, side }: { step: Step; side: 'left' | 'right' } = $props();

	// notes are collapsed by default; expanding grows the card, which the page's
	// ResizeObserver picks up to re-pack the columns.
	let showNotes = $state(false);
	let showSources = $state(false);

	// The second cue reads "or 4:50", "or 39 supply", or "or Engineering Bay 100%".
	const altOf = (t: Trigger) =>
		t.kind === 'time'
			? fmtClock(t.seconds)
			: t.kind === 'supply'
				? `${t.supply} supply`
				: t.kind === 'percent'
					? `${t.of} ${t.percent}%`
					: '';
	// "69 replays: started 5:52 (most 5:43–6:00), ~46 supply, ~34 workers"
	const replaysLine = (s: Extract<Source, { kind: 'replays' }>) => {
		const bits = [];
		if (s.at != null)
			bits.push(
				`started ${fmtClock(s.at)}` +
					(s.range ? ` (most ${fmtClock(s.range[0])}–${fmtClock(s.range[1])})` : '')
			);
		if (s.supply != null) bits.push(`~${s.supply} supply`);
		if (s.workers != null) bits.push(`~${s.workers} workers`);
		return bits.join(', ');
	};
	const built = (): string =>
		(step.produce ?? [])
			.map((p) => (p.count && p.count > 1 ? `${p.count}× ${p.name}` : p.name))
			.join('  +  ');
</script>

<!-- cue-{kind} colours the card; a `use` step is muted so, even on its own side,
     it reads as an action rather than a construction beat. `side` mirrors it. -->
<div class="step cue-{step.trigger.kind} {side}" class:use={step.use}>
	<div class="cue">
		{#if step.trigger.kind === 'supply'}
			<span class="val">{step.trigger.supply}</span>
			<span class="lbl">supply</span>
		{:else if step.trigger.kind === 'time'}
			<span class="val">{fmtClock(step.trigger.seconds)}</span>
			<span class="lbl">time</span>
		{:else if step.trigger.kind === 'percent'}
			{@const t = step.trigger}
			{#if t.ofId != null}
				{@const src = iconFor(t.ofKind ?? 'building', t.ofId)}
				{#if src}<img class="cue-icon" {src} alt="" />{/if}
			{/if}
			<span class="val">@{t.percent}%</span>
			<span class="lbl">{t.of}</span>
		{:else}
			<span class="val">↳</span>
			<span class="lbl">then</span>
		{/if}
		{#if step.altTrigger}
			<span class="alt">or {altOf(step.altTrigger)}</span>
		{/if}
	</div>

	<div class="body">
		{#if step.before}<p class="note before">{step.before}</p>{/if}

		<div class="action">
			{#if step.produce?.length}
				<div class="icons">
					{#each step.produce as p (p.kind + '-' + p.id + '-' + p.name)}
						{@const src = iconFor(p.kind, p.id)}
						<span class="chip" title={p.name}>
							{#if src}<img {src} alt={p.name} />{:else}<span class="ph">{p.name[0]}</span>{/if}
							{#if p.count && p.count > 1}<span class="count">×{p.count}</span>{/if}
						</span>
					{/each}
				</div>
			{/if}
			<div class="labels">
				{#if step.use}
					{#if step.instruction}<span class="primary">{step.instruction}</span>{/if}
					{#if step.produce?.length}<span class="sub">with {built()}</span>{/if}
				{:else}
					{#if step.produce?.length}<span class="primary">{built()}</span>{/if}
					{#if step.instruction}<span class="sub">{step.instruction}</span>{/if}
				{/if}
			</div>
		</div>

		{#if step.description}<p class="note attached">{step.description}</p>{/if}
		{#if step.notes || step.sources?.length}
			<div class="toggles">
				{#if step.notes}
					<button
						class="notes-toggle"
						aria-expanded={showNotes}
						onclick={() => (showNotes = !showNotes)}
					>
						<span class="caret">{showNotes ? '▾' : '▸'}</span>
						{showNotes ? 'hide notes' : 'notes'}
					</button>
				{/if}
				{#if step.sources?.length}
					<button
						class="notes-toggle"
						aria-expanded={showSources}
						onclick={() => (showSources = !showSources)}
					>
						<span class="caret">{showSources ? '▾' : '▸'}</span>
						{showSources ? 'hide sources' : `sources · ${step.sources.length}`}
					</button>
				{/if}
			</div>
			{#if showNotes && step.notes}<p class="note detail">{step.notes}</p>{/if}
			{#if showSources && step.sources}
				<ul class="note detail sources">
					{#each step.sources as s, i (i)}
						<li>
							{#if s.kind === 'replays'}
								<span class="src-kind">replays</span>
								<span
									><b>{s.players}</b>
									{s.players === 1 ? 'player' : 'players'}{#if replaysLine(s)}: {replaysLine(
											s
										)}{/if}{#if s.note}. {s.note}{/if}</span
								>
							{:else}
								<span class="src-kind">{s.kind === 'youtube' ? 'video' : 'replay'}</span>
								<a href={s.url} target="_blank" rel="noopener noreferrer"
									>{s.label ??
										(s.kind === 'youtube'
											? 'YouTube'
											: 'Watch the replay')}{#if s.seconds != null && !(s.label ?? '').includes(fmtClock(s.seconds))}{' '}@
										{fmtClock(s.seconds)}{/if}</a
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>

<style>
	.step {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		/* the cue colour, per trigger type */
		--cue: var(--tracked);
	}
	.cue-supply {
		--cue: var(--link);
	}
	.cue-time {
		--cue: var(--accent);
	}
	.cue-percent {
		--cue: var(--green);
	}
	/* a "use" step is a muted action, not a coloured build beat */
	.step.use {
		--cue: var(--text-3);
	}

	/* LEFT (build) side is mirrored: the cue hugs the rail on the right and the
	   content flows leftward, right-aligned. RIGHT (use) side reads normally. */
	.step.left {
		flex-direction: row-reverse;
		text-align: right;
	}

	/* the trigger badge */
	.cue {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		padding: 6px 10px;
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--cue) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--cue) 35%, transparent);
	}
	.step.left .cue {
		align-items: flex-end;
	}
	.step.use .cue {
		padding: 4px 8px;
		background: transparent;
		border-color: var(--border);
	}
	.cue .val {
		font-family: ui-monospace, monospace;
		font-weight: 700;
		font-size: 1.05rem;
		line-height: 1.1;
		color: var(--cue);
	}
	.step.use .cue .val {
		font-size: 0.9rem;
		color: var(--text-2);
	}
	.cue .lbl {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-3);
	}
	.cue-icon {
		width: 20px;
		height: 20px;
		image-rendering: pixelated;
		margin-bottom: 2px;
	}
	.alt {
		margin-top: 3px;
		font-size: 0.7rem;
		color: var(--text-2);
		font-family: ui-monospace, monospace;
	}

	.body {
		padding-top: 2px;
		min-width: 0;
	}
	.action {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	/* mirror the icons/labels order so icons stay nearest the cue on both sides */
	.step.left .action {
		flex-direction: row-reverse;
	}
	.icons {
		display: flex;
		gap: 6px;
	}
	.chip {
		position: relative;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 6px;
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
	}
	.chip img {
		width: 32px;
		height: 32px;
		image-rendering: pixelated;
	}
	.chip .ph {
		font-weight: 700;
		color: var(--text-2);
	}
	.chip .count {
		position: absolute;
		right: -5px;
		bottom: -5px;
		font-size: 0.62rem;
		font-weight: 700;
		font-family: ui-monospace, monospace;
		padding: 0 4px;
		border-radius: 6px;
		background: var(--cue);
		color: #0b0d10;
	}
	/* muted chips for a "use" step */
	.step.use .chip {
		width: 30px;
		height: 30px;
		border-style: dashed;
		background: transparent;
		opacity: 0.75;
	}
	.step.use .chip img {
		width: 22px;
		height: 22px;
		filter: saturate(0.5);
	}
	.step.use .chip .count {
		background: var(--text-3);
		color: var(--bg);
	}

	.labels {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
	}
	.step.left .labels {
		align-items: flex-end;
	}
	.primary {
		font-size: 1.02rem;
		font-weight: 600;
		color: var(--text);
	}
	.sub {
		font-size: 0.88rem;
		font-weight: 500;
		color: var(--text-2);
	}
	.step.use .primary {
		font-size: 0.92rem;
		font-weight: 500;
		color: var(--text-2);
	}
	.step.use .sub {
		font-size: 0.82rem;
		color: var(--text-3);
	}

	.note {
		margin: 6px 0 0;
		font-size: 0.86rem;
		line-height: 1.45;
		color: var(--text-2);
	}
	.note.attached {
		padding-left: 10px;
		border-left: 2px solid var(--cue);
	}
	.step.left .note.attached {
		padding-left: 0;
		padding-right: 10px;
		border-left: none;
		border-right: 2px solid var(--cue);
	}
	.note.before {
		margin-bottom: 4px;
		font-style: italic;
	}
	.step.use .note {
		font-size: 0.82rem;
		color: var(--text-3);
	}

	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.step.left .toggles {
		justify-content: flex-end;
	}
	.sources {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sources li {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.step.left .sources li {
		flex-direction: row-reverse;
	}
	.src-kind {
		flex: none;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.sources a {
		color: var(--link);
		text-decoration: none;
	}
	.sources a:hover {
		text-decoration: underline;
	}

	/* collapsible "why/timing" detail, hidden by default */
	.notes-toggle {
		margin-top: 5px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px 2px 6px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--bg-elev);
		color: var(--text-3);
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s,
			background 0.15s;
	}
	.notes-toggle:hover {
		color: var(--text);
		border-color: var(--cue);
		background: var(--bg-hover);
	}
	.notes-toggle[aria-expanded='true'] {
		color: var(--cue);
		border-color: color-mix(in srgb, var(--cue) 45%, transparent);
	}
	.notes-toggle .caret {
		font-size: 0.6rem;
		line-height: 1;
	}
	.note.detail {
		margin-top: 5px;
		padding-left: 10px;
		border-left: 2px dashed color-mix(in srgb, var(--cue) 55%, transparent);
		color: var(--text-2);
	}
	.step.left .note.detail {
		padding-left: 0;
		padding-right: 10px;
		border-left: none;
		border-right: 2px dashed color-mix(in srgb, var(--cue) 55%, transparent);
	}
</style>
