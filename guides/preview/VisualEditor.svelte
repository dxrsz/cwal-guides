<script lang="ts">
	// The form editor. It edits the article in place (the same object the YAML
	// tab shows) and calls `onchange` after every edit so the page can rewrite
	// the YAML and re-render the preview.
	import type { Issue } from '../src';
	import { iconFor } from '../src/icons';
	import { lookup } from '../src/names';
	import { namesFor, newStep, syncStep, type Article, type Cue, type RawStep } from './article';

	let { article, errors, onchange }: { article: Article; errors: Issue[]; onchange: () => void } =
		$props();

	const RACES = [
		['T', 'Terran'],
		['P', 'Protoss'],
		['Z', 'Zerg']
	];
	const myRace = $derived(article.matchup?.[0]);
	const vsRace = $derived(article.matchup?.[2]);
	const setMatchup = (me: string | undefined, vs: string | undefined) => {
		article.matchup = `${me ?? 'T'}v${vs ?? 'Z'}`;
		onchange();
	};

	const names = $derived(namesFor(myRace));
	const steps = $derived(article.steps ?? []);

	// Things built by earlier (non-use) steps: what a "when built" cue can wait on.
	const builtBefore = (i: number): string[] => {
		const seen: string[] = [];
		for (const s of steps.slice(0, i)) {
			if (s.use) continue;
			for (const it of s._items ?? []) {
				const n = lookup(it.name)?.name;
				if (n && !seen.includes(n)) seen.push(n);
			}
		}
		return seen.reverse();
	};

	const stepErrors = (i: number) => errors.filter((e) => e.path[0] === 'steps' && e.path[1] === i);

	const edit = (s: RawStep) => {
		syncStep(s);
		onchange();
	};
	const setCueType = (s: RawStep, which: '_at' | '_or', type: string, i: number) => {
		const c: Cue =
			type === 'supply'
				? { type, supply: '' }
				: type === 'time'
					? { type, time: '' }
					: type === 'built'
						? { type, name: builtBefore(i)[0] ?? '', percent: '100', ref: '' }
						: { type: 'next' };
		s[which] = c;
		edit(s);
	};

	// time cue edited as minutes + seconds so it is always a valid m:ss
	const timeParts = (c: Cue) => {
		const m = c.type === 'time' ? c.time.match(/^(\d+):(\d\d)$/) : null;
		return m ? [m[1], m[2]] : ['', ''];
	};
	const setTime = (s: RawStep, which: '_at' | '_or', min: string, sec: string) => {
		const mm = Math.max(0, Math.floor(+min || 0));
		const ss = Math.min(59, Math.max(0, Math.floor(+sec || 0)));
		s[which] = {
			type: 'time',
			time: min === '' && sec === '' ? '' : `${mm}:${String(ss).padStart(2, '0')}`
		};
		edit(s);
	};

	const ensure = () => (article.steps ??= []);
	const insert = (at: number) => {
		const list = ensure();
		const s = newStep();
		list.splice(at, 0, s);
		openIdx = at;
		onchange();
	};
	const remove = (i: number) => {
		ensure().splice(i, 1);
		onchange();
	};
	const move = (i: number, d: number) => {
		const list = ensure();
		const j = i + d;
		if (j < 0 || j >= list.length) return;
		[list[i], list[j]] = [list[j], list[i]];
		openIdx = j;
		onchange();
	};
	const duplicate = (i: number) => {
		const list = ensure();
		const copy = JSON.parse(JSON.stringify($state.snapshot(list[i]))) as RawStep;
		delete copy.id;
		delete copy.section;
		list.splice(i + 1, 0, copy);
		openIdx = i + 1;
		onchange();
	};

	let openIdx = $state<number | null>(null);
	let showNotes = $state<Record<number, boolean>>({});

	const cueSummary = (c: Cue | null | undefined) => {
		if (!c) return '';
		switch (c.type) {
			case 'supply':
				return c.supply ? `${c.supply} supply` : 'set a cue';
			case 'time':
				return c.time || 'set a time';
			case 'built':
				return c.name ? `${c.name} @${c.percent || 100}%` : 'pick what finishes';
			case 'next':
				return 'right after';
			case 'other':
				return c.raw;
		}
	};
	const itemSummary = (s: RawStep) =>
		(s._items ?? [])
			.filter((r) => r.name)
			.map((r) =>
				r.count && +r.count > 1 ? `${r.count}× ${r.label || r.name}` : r.label || r.name
			)
			.join(' + ');

	const refs = $derived(article.references ?? []);
	const addRef = () => {
		(article.references ??= []).push({ youtube: '' });
		onchange();
	};
	const refKind = (r: { youtube?: string; replay?: string }) =>
		'replay' in r ? 'replay' : 'youtube';
	const setRefKind = (i: number, kind: string) => {
		const r = article.references![i];
		const url = r.youtube ?? r.replay ?? '';
		article.references![i] =
			kind === 'replay' ? { replay: url, label: r.label } : { youtube: url, label: r.label };
		onchange();
	};
</script>

{#snippet cueInput(s: RawStep, which: '_at' | '_or', i: number)}
	{@const c = s[which]!}
	<div class="cue">
		<select
			value={c.type === 'other' ? 'other' : c.type}
			onchange={(e) => setCueType(s, which, e.currentTarget.value, i)}
			aria-label="Cue type"
		>
			<option value="supply">at supply</option>
			<option value="time">at time</option>
			<option
				value="built"
				disabled={which === '_at' && builtBefore(i).length === 0 && c.type !== 'built'}
				>when built</option
			>
			{#if which === '_at'}<option value="next">right after</option>{/if}
			{#if c.type === 'other'}<option value="other">custom</option>{/if}
		</select>
		{#if c.type === 'supply'}
			<input
				class="num"
				type="number"
				min="0"
				max="400"
				placeholder="11"
				bind:value={c.supply}
				oninput={() => edit(s)}
				aria-label="Supply"
			/>
			<span class="unit">supply</span>
		{:else if c.type === 'time'}
			{@const [mm, ss] = timeParts(c)}
			<input
				class="num"
				type="number"
				min="0"
				placeholder="3"
				value={mm}
				oninput={(e) => setTime(s, which, e.currentTarget.value, ss)}
				aria-label="Minutes"
			/>
			<span class="unit">:</span>
			<input
				class="num"
				type="number"
				min="0"
				max="59"
				placeholder="15"
				value={ss}
				oninput={(e) => setTime(s, which, mm, e.currentTarget.value)}
				aria-label="Seconds"
			/>
		{:else if c.type === 'built'}
			<select bind:value={c.name} onchange={() => edit(s)} aria-label="Waits on">
				{#if c.name && !builtBefore(i).includes(c.name)}<option value={c.name}>{c.name}</option
					>{/if}
				{#each builtBefore(i) as n (n)}<option value={n}>{n}</option>{/each}
			</select>
			<span class="unit">at</span>
			<input
				class="num"
				type="number"
				min="1"
				max="100"
				bind:value={c.percent}
				oninput={() => edit(s)}
				aria-label="Percent built"
			/>
			<span class="unit">%</span>
		{:else if c.type === 'other'}
			<input bind:value={c.raw} oninput={() => edit(s)} aria-label="Cue" />
		{/if}
	</div>
{/snippet}

<datalist id="things">
	{#each names as n (n)}<option value={n}></option>{/each}
</datalist>

<div class="visual">
	<section class="meta">
		<label class="wide">
			<span>Title</span>
			<input bind:value={article.title} oninput={onchange} placeholder="e.g. Nyoken's 2-Rax Academy" />
		</label>
		<div class="row">
			<label>
				<span>You play</span>
				<select value={myRace} onchange={(e) => setMatchup(e.currentTarget.value, vsRace)}>
					{#each RACES as [k, n] (k)}<option value={k}>{n}</option>{/each}
				</select>
			</label>
			<label>
				<span>versus</span>
				<select value={vsRace} onchange={(e) => setMatchup(myRace, e.currentTarget.value)}>
					{#each RACES as [k, n] (k)}<option value={k}>{n}</option>{/each}
				</select>
			</label>
			<label>
				<span>Build by</span>
				<input bind:value={article.creator} oninput={onchange} placeholder="the player" />
			</label>
			<label>
				<span>Written up by</span>
				<input bind:value={article.submitter} oninput={onchange} placeholder="you" />
			</label>
		</div>
		<label class="wide">
			<span>One-line summary <em>shown on the browse card</em></span>
			<input bind:value={article.tagline} oninput={onchange} />
		</label>
		<label class="wide">
			<span>Objective <em>the overview at the top of the guide</em></span>
			<textarea rows="4" bind:value={article.objective} oninput={onchange}></textarea>
		</label>
		<div class="wide">
			<span class="lbl">Links</span>
			{#each refs as r, i (i)}
				<div class="refrow">
					<select value={refKind(r)} onchange={(e) => setRefKind(i, e.currentTarget.value)}>
						<option value="youtube">YouTube</option>
						<option value="replay">Replay</option>
					</select>
					{#if refKind(r) === 'replay'}
						<input bind:value={r.replay} oninput={onchange} placeholder="https://…" />
					{:else}
						<input
							bind:value={r.youtube}
							oninput={onchange}
							placeholder="https://www.youtube.com/watch?v=…"
						/>
					{/if}
					<button
						class="icon"
						title="Remove link"
						onclick={() => {
							article.references!.splice(i, 1);
							onchange();
						}}>✕</button
					>
				</div>
			{/each}
			<button class="add small" onclick={addRef}>+ Add a link</button>
		</div>
	</section>

	<h3>Steps</h3>
	<ol class="steps">
		{#each steps as s, i (s)}
			{@const errs = stepErrors(i)}
			{@const open = openIdx === i}
			{#if s.section}
				<li class="section-row">
					<input
						class="section"
						bind:value={s.section}
						oninput={onchange}
						aria-label="Section title"
					/>
					<button
						class="icon"
						title="Remove section"
						onclick={() => {
							s.section = undefined;
							onchange();
						}}>✕</button
					>
				</li>
			{/if}
			<li class="step" class:open class:bad={errs.length > 0} class:use={s.use}>
				<button class="head" onclick={() => (openIdx = open ? null : i)} aria-expanded={open}>
					<span class="n">{i + 1}</span>
					<span class="when">{cueSummary(s._at)}</span>
					<span class="icons">
						{#each s._items ?? [] as r, j (j)}
							{@const hit = lookup(r.name)}
							{#if hit}
								{@const src = iconFor(hit.kind, hit.id)}
								{#if src}<img {src} alt="" />{/if}
							{/if}
						{/each}
					</span>
					<span class="what">
						{s.use
							? `${s.instruction || 'task'}${itemSummary(s) ? ` with ${itemSummary(s)}` : ''}`
							: itemSummary(s) || s.instruction || 'nothing yet'}
					</span>
					{#if errs.length}<span class="badge">!</span>{/if}
					<span class="caret">{open ? '▾' : '▸'}</span>
				</button>

				{#if open}
					<div class="body">
						{#each errs as e, k (k)}<p class="err">{e.message}</p>{/each}

						<div class="field">
							<span class="lbl">When</span>
							<div class="cues">
								{@render cueInput(s, '_at', i)}
								{#if s._or}
									<span class="or">or</span>
									{@render cueInput(s, '_or', i)}
									<button
										class="icon"
										title="Remove second cue"
										onclick={() => {
											s._or = null;
											edit(s);
										}}>✕</button
									>
								{:else}
									<button
										class="add small"
										onclick={() => {
											s._or = { type: 'time', time: '' };
											edit(s);
										}}>+ or…</button
									>
								{/if}
							</div>
						</div>

						<div class="field">
							<span class="lbl">{s.use ? 'With' : 'Build'}</span>
							<div class="items">
								{#each s._items ?? [] as r, j (j)}
									{@const hit = lookup(r.name)}
									<div class="item">
										<span class="pic">
											{#if hit && iconFor(hit.kind, hit.id)}<img
													src={iconFor(hit.kind, hit.id)}
													alt=""
												/>{/if}
										</span>
										<input
											class="count"
											type="number"
											min="1"
											placeholder="#"
											bind:value={r.count}
											oninput={() => edit(s)}
											aria-label="How many"
										/>
										<input
											class="name"
											class:unknown={r.name && !hit}
											list="things"
											placeholder="Barracks, Marine, Stim Packs…"
											bind:value={r.name}
											oninput={() => edit(s)}
											aria-label="What"
										/>
										<input
											class="label"
											placeholder="label (optional)"
											bind:value={r.label}
											oninput={() => edit(s)}
											aria-label="Shown as"
										/>
										<button
											class="icon"
											title="Remove"
											onclick={() => {
												s._items!.splice(j, 1);
												edit(s);
											}}>✕</button
										>
									</div>
								{/each}
								<button
									class="add small"
									onclick={() => {
										(s._items ??= []).push({ name: '', count: '', label: '' });
										edit(s);
									}}>+ Add</button
								>
							</div>
						</div>

						<label class="check">
							<input type="checkbox" bind:checked={s.use} {onchange} />
							<span>This step <b>uses</b> these (scout, move out) instead of building them</span>
						</label>

						<label class="field">
							<span class="lbl">Action</span>
							<input
								bind:value={s.instruction}
								oninput={onchange}
								placeholder={s.use
									? 'Move out, Send an SCV to scout…'
									: 'optional: Cut SCVs, Research…'}
							/>
						</label>
						<label class="field">
							<span class="lbl">Short note</span>
							<input
								bind:value={s.description}
								oninput={onchange}
								placeholder="always shown under the step"
							/>
						</label>
						{#if s.notes !== undefined || showNotes[i]}
							<label class="field">
								<span class="lbl">Details</span>
								<textarea
									rows="3"
									bind:value={s.notes}
									oninput={onchange}
									placeholder="the reasoning; folded behind a toggle in the guide"
								></textarea>
							</label>
						{:else}
							<button class="add small" onclick={() => (showNotes[i] = true)}>+ Add details</button>
						{/if}

						<div class="tools">
							{#if !s.section}
								<button
									class="small"
									onclick={() => {
										s.section = 'New section';
										onchange();
									}}>Start a section here</button
								>
							{/if}
							<span class="spacer"></span>
							<button class="icon" title="Move up" disabled={i === 0} onclick={() => move(i, -1)}
								>↑</button
							>
							<button
								class="icon"
								title="Move down"
								disabled={i === steps.length - 1}
								onclick={() => move(i, 1)}>↓</button
							>
							<button class="icon" title="Duplicate" onclick={() => duplicate(i)}>⧉</button>
							<button class="icon danger" title="Delete step" onclick={() => remove(i)}>🗑</button>
						</div>
					</div>
				{/if}
			</li>
			<li class="between">
				<button onclick={() => insert(i + 1)} title="Insert a step here">+</button>
			</li>
		{/each}
	</ol>
	<button class="add" onclick={() => insert(steps.length)}>+ Add a step</button>
</div>

<style>
	.visual {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 14px 14px 40px;
		container-type: inline-size;
		font-size: 0.85rem;
	}
	input,
	textarea,
	select {
		font: inherit;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		padding: 5px 8px;
		min-width: 0;
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--text-3);
		opacity: 0.7;
	}
	input:focus,
	textarea:focus,
	select:focus {
		outline: none;
		border-color: var(--link);
	}
	textarea {
		resize: vertical;
		width: 100%;
	}
	button {
		font: inherit;
		color: var(--text);
		background: var(--bg-hover);
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		padding: 4px 10px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.small {
		font-size: 0.78rem;
		padding: 2px 8px;
	}
	.add {
		background: transparent;
		border-style: dashed;
		color: var(--text-2);
	}
	.icon {
		padding: 2px 7px;
		background: transparent;
		border-color: transparent;
		color: var(--text-3);
	}
	.icon:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.danger:hover:not(:disabled) {
		color: var(--red);
	}
	.err {
		color: var(--red);
		margin: 0 0 8px;
	}
	.meta {
		display: grid;
		gap: 10px;
		margin-bottom: 18px;
	}
	.meta label,
	.meta .wide {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.meta label > span,
	.lbl {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.meta em {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		font-style: normal;
		color: var(--text-3);
		opacity: 0.8;
	}
	.row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 10px;
	}
	.refrow {
		display: flex;
		gap: 6px;
	}
	.refrow input {
		flex: 1;
	}
	.meta .add {
		align-self: flex-start;
	}
	h3 {
		margin: 6px 0 8px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-3);
	}
	.steps {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
	}
	.section-row {
		display: flex;
		gap: 6px;
		margin: 14px 0 6px;
	}
	.section {
		flex: 1;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.75rem;
		color: var(--text-2);
		background: transparent;
		border-color: var(--border);
	}
	.step {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-elev);
	}
	.step.open {
		border-color: var(--border-strong);
	}
	.step.bad {
		border-color: color-mix(in srgb, var(--red) 60%, var(--border));
	}
	.head {
		all: unset;
		box-sizing: border-box;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		cursor: pointer;
	}
	.n {
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
		color: var(--text-3);
		min-width: 18px;
	}
	.when {
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		color: var(--link);
		white-space: nowrap;
		min-width: 92px;
	}
	.icons {
		display: flex;
		gap: 2px;
	}
	.icons img {
		width: 20px;
		height: 20px;
		object-fit: contain;
	}
	.what {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.use .what {
		color: var(--text-2);
		font-style: italic;
	}
	.badge {
		color: #fff;
		background: var(--red);
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0 6px;
	}
	.caret {
		color: var(--text-3);
	}
	.body {
		display: grid;
		gap: 10px;
		padding: 4px 12px 12px 36px;
	}
	.field {
		display: grid;
		grid-template-columns: 82px minmax(0, 1fr);
		gap: 8px;
		align-items: start;
	}
	.field > .lbl {
		padding-top: 7px;
	}
	.cues,
	.cue {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}
	.num {
		width: 64px;
	}
	.unit,
	.or {
		color: var(--text-3);
	}
	.items {
		display: grid;
		gap: 6px;
		justify-items: start;
	}
	.item {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		width: 100%;
	}
	.pic {
		width: 26px;
		height: 26px;
		flex: none;
		display: grid;
		place-items: center;
	}
	.pic img {
		max-width: 26px;
		max-height: 26px;
	}
	.count {
		width: 54px;
		flex: none;
	}
	.name {
		flex: 2 1 130px;
	}
	.name.unknown {
		border-color: var(--red);
	}
	.label {
		flex: 1 1 90px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-2);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-top: 4px;
		border-top: 1px solid var(--border);
	}
	.spacer {
		flex: 1;
	}
	.between {
		height: 10px;
		position: relative;
		display: flex;
		justify-content: center;
	}
	.between button {
		position: absolute;
		top: -6px;
		width: 20px;
		height: 20px;
		padding: 0;
		border-radius: 50%;
		font-size: 0.8rem;
		line-height: 1;
		opacity: 0;
		transition: opacity 0.1s;
		z-index: 1;
	}
	.between:hover button,
	.between button:focus-visible {
		opacity: 1;
	}
	/* narrow editor column: labels above fields, less indent */
	@container (max-width: 440px) {
		.body {
			padding-left: 12px;
		}
		.field {
			grid-template-columns: minmax(0, 1fr);
			gap: 4px;
		}
		.field > .lbl {
			padding-top: 0;
		}
		.when {
			min-width: 0;
		}
	}
	@media (hover: none) {
		.between button {
			opacity: 0.6;
		}
	}
</style>
