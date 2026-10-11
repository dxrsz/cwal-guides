<script lang="ts">
	import { untrack } from 'svelte';
	import BuildBoard, { type BoardChoice } from './BuildBoard.svelte';
	import BuildCheatSheet from './BuildCheatSheet.svelte';
	import { choicesOn, defaultPath, pathIds, pick, stepsOn, type Path } from './path';
	import type { BuildOrder } from './types';

	// `backHref` is the "All builds" link; null hides it (the preview site has
	// no browse page to go back to).
	// `view` is bindable so a host (the preview site) can drive the toggle.
	// `syncUrl` keeps the picked path in the page url (`?path=…`), so a shared
	// link opens the same path; hosts with their own routing leave it off.
	let {
		build,
		backHref = '/builds',
		view = $bindable('guide'),
		syncUrl = false
	}: {
		build: BuildOrder;
		backHref?: string | null;
		view?: 'guide' | 'sheet';
		syncUrl?: boolean;
	} = $props();

	// The route remounts this component via {#key} on every slug change, so
	// `build` never changes for a given instance.
	const fromUrl = () =>
		syncUrl && typeof location !== 'undefined'
			? (new URLSearchParams(location.search).get('path') ?? '').split(',').filter(Boolean)
			: [];
	let path = $state<Path>(untrack(() => defaultPath(build, fromUrl())));
	const steps = $derived(stepsOn(build, path));
	const choices = $derived(choicesOn(build, path));
	const pathKey = $derived(JSON.stringify(path));
	const boardChoices = $derived<BoardChoice[]>(
		choices.map((c) => ({
			si: c.si,
			at: c.at,
			question: c.stage.choose,
			options: c.stage.options.map((o) => ({ id: o.id, label: o.label })),
			picked: c.picked,
			read: c.stage.options.find((o) => o.id === c.picked)?.read
		}))
	);
	// The cheat sheet has no tabs; its section titles say which option is shown.
	const sheetBuild = $derived<BuildOrder>({
		...build,
		steps: steps.map((s, i) => {
			const c = choices.find((x) => x.at === i);
			const label = c?.stage.options.find((o) => o.id === c.picked)?.label;
			return c && label ? { ...s, section: `${c.stage.title}: ${label}` } : s;
		})
	});

	// Switching an option re-lays the board; keep the clicked tabs where they
	// were on screen so the page doesn't jump.
	let anchor: { si: number; top: number } | null = null;
	const choose = (si: number, id: string, el?: HTMLElement) => {
		const box = el?.closest('.choice') as HTMLElement | null;
		anchor = box ? { si, top: box.getBoundingClientRect().top } : null;
		path = pick(build, path, si, id);
		if (syncUrl && typeof history !== 'undefined') {
			const u = new URL(location.href);
			u.searchParams.set('path', pathIds(path).join(','));
			history.replaceState(history.state, '', u);
		}
	};
	const restoreScroll = () => {
		if (!anchor || typeof document === 'undefined') return;
		const box = document.querySelector(`.choice[data-si="${anchor.si}"]`);
		if (box) window.scrollBy(0, box.getBoundingClientRect().top - anchor.top);
		anchor = null;
	};
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

	{#if choices.length}
		<div class="pathbar" aria-label="Your path">
			{#each choices as c (c.si)}
				<label>
					<span>{c.stage.title}</span>
					<select value={c.picked} onchange={(e) => choose(c.si, e.currentTarget.value)}>
						{#each c.stage.options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
					</select>
				</label>
			{/each}
		</div>
	{/if}

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
		<BuildCheatSheet build={sheetBuild} />
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

		{#key pathKey}
			<BuildBoard
				{steps}
				choices={boardChoices}
				onpick={(si, id, el) => choose(si, id, el)}
				onmeasured={restoreScroll}
			/>
		{/key}
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

	/* the picked path at a glance (and the cheat sheet's only way to switch) */
	.pathbar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin: 0 0 20px;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--bg-elev);
		border: 1px solid var(--border);
	}
	.pathbar label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
		color: var(--text-3);
	}
	.pathbar span {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.66rem;
	}
	.pathbar select {
		font: inherit;
		font-size: 0.84rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		padding: 3px 6px;
	}
</style>
