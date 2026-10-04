<script lang="ts">
	// The minified "cheat sheet" render of a build: same BuildOrder JSON, stripped
	// to the executable skeleton. Build steps flow left-to-right as compact chips,
	// wrapping to fill the width; a task breaks to its own full-width row so it
	// reads as a delimiter between clusters of builds. Every produced thing gets
	// its own boxed icon (pictures, not names). A `@100%` step shows the thing it
	// waits on as a boxed "100%" icon with an arrow to what it builds, so the
	// dependency never blurs into the product.
	import { fmtClock } from './format';
	import { iconFor } from './icons';
	import type { BuildOrder, Step } from './types';

	let { build }: { build: BuildOrder } = $props();

	// Group steps under their section headers, mirroring the guide view.
	type Group = { title?: string; steps: Step[] };
	const groups = $derived.by(() => {
		const out: Group[] = [];
		for (const step of build.steps) {
			if (step.section || out.length === 0) out.push({ title: step.section, steps: [] });
			out[out.length - 1].steps.push(step);
		}
		return out;
	});
</script>

{#snippet box(kind: string, id: number, name: string, count?: number, dep = false)}
	{@const src = iconFor(kind, id)}
	<span class="box" class:dep title={name}>
		{#if src}<img class="pic" {src} alt={name} />{:else}<span class="ph">{name[0]}</span>{/if}
		{#if dep}<span class="pct">100%</span>{/if}
		{#if count && count > 1}<span class="count">×{count}</span>{/if}
	</span>
{/snippet}

{#snippet cueProd(step: Step)}
	{@const t = step.trigger}
	{#if t.kind === 'percent'}
		{#if t.ofId != null}
			{@render box(t.ofKind ?? 'building', t.ofId, t.of, undefined, true)}
		{:else}
			<span class="cue"><span class="at">@</span>{t.of}</span>
		{/if}
		<span class="arrow">&rarr;</span>
	{:else if t.kind === 'supply'}
		<span class="cue">{t.supply}</span>
	{:else if t.kind === 'time'}
		<span class="cue">{fmtClock(t.seconds)}</span>
	{:else}
		<span class="cue">&darr;</span>
	{/if}

	<span class="prod">
		{#each step.produce ?? [] as p (p.kind + p.id + p.name)}
			{@render box(p.kind, p.id, p.name, p.count)}
		{/each}
	</span>
	{#if step.use && step.instruction}<span class="verb">{step.instruction}</span>{/if}
{/snippet}

<div class="sheet">
	<div class="head">
		<span class="matchup">{build.matchup}</span>
		<span class="title">{build.title}</span>
		{#if build.creator}<span class="by">by {build.creator}</span>{/if}
	</div>

	{#each groups as g (g.title ?? 's')}
		{#if g.title}<div class="section">{g.title}</div>{/if}
		<div class="grid">
			{#each g.steps as step (step)}
				<div class="cell cue-{step.trigger.kind}" class:task={step.use}>
					{@render cueProd(step)}
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.sheet {
		padding: 16px 18px 20px;
		border-radius: var(--radius);
		background: var(--bg-elev);
		border: 1px solid var(--border);
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
		padding-bottom: 10px;
		margin-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}
	.matchup {
		font-family: ui-monospace, monospace;
		font-weight: 700;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		padding: 1px 6px;
		border-radius: 999px;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.title {
		font-size: 1.15rem;
		font-weight: 800;
		color: var(--text);
	}
	.by {
		font-size: 0.85rem;
		color: var(--text-3);
	}

	.section {
		margin: 18px 0 8px;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-3);
	}

	/* build steps flow and wrap; a task's full-width basis pushes it to its own
	   line, delimiting the builds before and after it. */
	.grid {
		display: flex;
		flex-wrap: wrap;
		gap: 11px;
		align-items: stretch;
	}

	.cell {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 7px 12px 7px 10px;
		border-radius: 11px;
		background: var(--bg);
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

	.cue {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		font-family: ui-monospace, monospace;
		font-weight: 700;
		font-size: 1.2rem;
		line-height: 1;
		color: var(--cue);
		white-space: nowrap;
	}
	.cue .at {
		opacity: 0.65;
	}
	.arrow {
		color: var(--text-3);
		font-size: 1.4rem;
		line-height: 1;
	}

	.prod {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}

	/* one boxed icon: a produced thing, or (dep) the thing a @100% step waits on */
	.box {
		position: relative;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 8px;
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
	}
	.box .pic {
		width: 38px;
		height: 38px;
		image-rendering: pixelated;
	}
	.box .ph {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text-2);
	}
	.box.dep {
		border-color: color-mix(in srgb, var(--green) 55%, transparent);
	}
	.box .pct {
		position: absolute;
		bottom: -9px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.68rem;
		font-weight: 700;
		font-family: ui-monospace, monospace;
		letter-spacing: 0.02em;
		padding: 0 4px;
		border-radius: 5px;
		background: var(--green);
		color: #0b0d10;
	}
	.box .count {
		position: absolute;
		right: -8px;
		bottom: -8px;
		font-size: 0.72rem;
		font-weight: 700;
		font-family: ui-monospace, monospace;
		padding: 0 4px;
		border-radius: 6px;
		background: var(--cue);
		color: #0b0d10;
	}

	/* a task takes the full width and reads as a muted delimiter between clusters */
	.cell.task {
		flex-basis: 100%;
		background: color-mix(in srgb, var(--text-3) 7%, transparent);
		--cue: var(--text-3);
	}
	.cell.task .cue {
		font-size: 1.05rem;
		color: var(--text-2);
	}
	.cell.task .box {
		width: 38px;
		height: 38px;
	}
	.cell.task .box .pic {
		width: 30px;
		height: 30px;
		filter: saturate(0.5);
	}
	.cell.task .box .count {
		background: var(--text-3);
		color: var(--bg);
	}
	.verb {
		margin-left: 4px;
		font-size: 1.02rem;
		color: var(--text-2);
	}
</style>
