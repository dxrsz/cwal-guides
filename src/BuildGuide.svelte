<script lang="ts">
	import { untrack } from 'svelte';
	import BuildBoard, { type BoardChoice } from './BuildBoard.svelte';
	import BuildCheatSheet from './BuildCheatSheet.svelte';
	import {
		anchorsOn,
		choicesOn,
		defaultPath,
		pathIds,
		pick,
		readHash,
		stepsOn,
		writeHash,
		type Path
	} from './path';
	import type { BuildOrder } from './types';

	// `backHref` is the "All builds" link; null hides it (the preview site has
	// no browse page to go back to).
	// `view` is bindable so a host (the preview site) can drive the toggle.
	// `syncUrl` keeps the picked path and the selected step in the url's `#`
	// (`#path=vs-9pool,vs-spire&step=mid-game.vs-spire.3`), so a link opens the
	// same path, scrolled to and highlighting that step. Other `#` params (the
	// builder's `guide=`) are left alone.
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
	const fromUrl = untrack(() => (syncUrl ? readHash() : {}));
	let path = $state<Path>(
		untrack(() => defaultPath(build, (fromUrl.path ?? '').split(',').filter(Boolean)))
	);
	const steps = $derived(stepsOn(build, path));
	const anchors = $derived(anchorsOn(build, path));
	const choices = $derived(choicesOn(build, path));
	const pathKey = $derived(JSON.stringify(path));
	// The step a link points at (or the last one clicked): highlighted, and on
	// first load scrolled to.
	let target = $state<string | null>(fromUrl.step ?? null);
	let jumpTo: string | null = fromUrl.step ?? null;
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

	const sync = () => {
		if (!syncUrl) return;
		writeHash({
			path: build.stages ? pathIds(path).join(',') : null,
			step: target && anchors.includes(target) ? target : null
		});
	};

	// The nearest scrolling box: the window on a page, the preview panel in
	// the builder.
	const scroller = (el: Element): Element => {
		for (let p = el.parentElement; p; p = p.parentElement) {
			const o = getComputedStyle(p).overflowY;
			if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
		}
		return document.scrollingElement ?? document.documentElement;
	};

	// Switching an option re-lays the board. Its old height is held while the
	// new path is measured (so the page can't collapse and jump to the top),
	// then whatever was clicked is put back where it was on screen.
	let held = $state(0);
	let wrap: HTMLDivElement | undefined = $state();
	let anchor: { sel: string; top: number; at: number } | null = null;
	const choose = (si: number, id: string, el?: HTMLElement) => {
		const box = (el?.closest('.choice, .pathbar') as HTMLElement | null) ?? null;
		const sel = box?.classList.contains('choice') ? `.choice[data-si="${si}"]` : '.pathbar';
		anchor = box ? { sel, top: box.getBoundingClientRect().top, at: Date.now() } : null;
		held = wrap?.offsetHeight ?? 0;
		path = pick(build, path, si, id);
		sync();
	};
	const pickStep = (a: string) => {
		target = a;
		sync();
	};
	// A linked step is scrolled to on the first layout and kept in view
	// through the re-layouts right after it (icons and fonts loading grow the
	// cards), until the reader scrolls themselves.
	const loadedAt = Date.now();
	const measured = (first: boolean) => {
		held = 0;
		if (typeof document === 'undefined') return;
		// The clicked tabs stay pinned through the re-layouts that follow a
		// switch (the new path's icons loading), for about a second.
		if (anchor && Date.now() - anchor.at < 1200) {
			const box = document.querySelector(anchor.sel);
			if (box) scroller(box).scrollTop += box.getBoundingClientRect().top - anchor.top;
		} else anchor = null;
		if (!first && !(jumpTo && Date.now() - loadedAt < 2000)) return;
		if (jumpTo) {
			const el = document.querySelector(`[data-anchor="${CSS.escape(jumpTo)}"]`);
			if (!el) return void (jumpTo = null);
			el.scrollIntoView({ block: 'center' });
			if (first) {
				const box = scroller(el);
				const stop = () => (jumpTo = null);
				(box === document.scrollingElement ? window : box).addEventListener('wheel', stop, {
					once: true
				});
				(box === document.scrollingElement ? window : box).addEventListener('touchmove', stop, {
					once: true
				});
			}
		}
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
					<select
						value={c.picked}
						onchange={(e) => choose(c.si, e.currentTarget.value, e.currentTarget)}
					>
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

		<div class="boardwrap" bind:this={wrap} style="min-height:{held ? `${held}px` : 'auto'}">
			{#key pathKey}
				<BuildBoard
					{steps}
					{anchors}
					{target}
					choices={boardChoices}
					onpick={(si, id, el) => choose(si, id, el)}
					onstep={pickStep}
					onmeasured={measured}
				/>
			{/key}
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
