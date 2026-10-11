<script lang="ts">
	// The form editor. It edits the article in place (the same object the YAML
	// tab shows) and calls `onchange` after every edit so the page can rewrite
	// the YAML and re-render the preview.
	import type { Issue } from '../src';
	import { iconFor } from '../src/icons';
	import { lookup } from '../src/names';
	import {
		namesFor,
		newStep,
		syncStep,
		stepLists,
		type Article,
		type Cue,
		type RawStage,
		type RawStep,
		type SourceIn
	} from './article';

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

	// ---- stages ----------------------------------------------------------------
	// A guide in stages is edited one segment at a time: a shared stage, or one
	// option of a choice. The step list below always edits the current segment.
	let seg = $state({ si: 0, oi: 0 });
	const stages = $derived(article.stages);
	const stage = $derived<RawStage | undefined>(
		stages?.[Math.min(seg.si, (stages?.length ?? 1) - 1)]
	);
	const segSteps = (): RawStep[] => {
		if (!article.stages) return (article.steps ??= []);
		const st = article.stages[seg.si];
		if (!st) return [];
		if (st.options) return ((st.options[seg.oi] ??= { steps: [] }).steps ??= []);
		return (st.steps ??= []);
	};
	const steps = $derived.by(() => {
		void seg.si;
		void seg.oi;
		void article.stages;
		void article.steps;
		return segSteps();
	});
	/** The yaml path of the current segment's step list, for matching errors. */
	const segPath = $derived<(string | number)[]>(
		!article.stages
			? ['steps']
			: stage?.options
				? ['stages', seg.si, 'options', seg.oi, 'steps']
				: ['stages', seg.si, 'steps']
	);
	const startsWith = (p: (string | number)[], pre: (string | number)[]) =>
		pre.every((x, k) => p[k] === x);
	const stageErrors = $derived(
		article.stages
			? errors.filter(
					(e) =>
						startsWith(e.path, ['stages', seg.si]) &&
						!(e.path.includes('steps') && e.path.length > e.path.indexOf('steps') + 1)
				)
			: []
	);
	const goto = (si: number, oi = 0) => {
		seg = { si, oi };
		openIdx = null;
	};
	// An option's id follows its label until someone edits the id by hand.
	const autoId = new WeakSet<object>();
	const slug = (t: string) =>
		t
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	/** Turn a flat guide into stages, one per section (the first, if unnamed, is "Opener"). */
	const splitIntoStages = () => {
		const out: RawStage[] = [];
		for (const st of article.steps ?? []) {
			if (st.section || out.length === 0) {
				out.push({ title: st.section || 'Opener', steps: [] });
				delete st.section;
			}
			out[out.length - 1].steps!.push(st);
		}
		article.stages = out.length ? out : [{ title: 'Opener', steps: [newStep()] }];
		delete article.steps;
		goto(0);
		onchange();
	};
	const addStage = (at: number) => {
		(article.stages ??= []).splice(at, 0, { title: 'New stage', steps: [newStep()] });
		goto(at);
		onchange();
	};
	const removeStage = (si: number) => {
		article.stages!.splice(si, 1);
		goto(Math.max(0, si - 1));
		onchange();
	};
	const moveStage = (si: number, d: number) => {
		const list = article.stages!;
		const j = si + d;
		if (j < 0 || j >= list.length) return;
		[list[si], list[j]] = [list[j], list[si]];
		goto(j);
		onchange();
	};
	const makeChoice = (st: RawStage) => {
		st.choose = 'What do you see?';
		st.options = [
			{ id: 'option-1', label: 'Option 1', steps: st.steps ?? [newStep()] },
			{ id: 'option-2', label: 'Option 2', steps: [newStep()] }
		];
		st.options.forEach((o) => autoId.add(o));
		delete st.steps;
		seg = { ...seg, oi: 0 };
		onchange();
	};
	const makeShared = (st: RawStage) => {
		st.steps = st.options?.[seg.oi]?.steps ?? [newStep()];
		delete st.choose;
		delete st.options;
		seg = { ...seg, oi: 0 };
		onchange();
	};
	const addOption = (st: RawStage) => {
		const n = (st.options ??= []).length + 1;
		const o = { id: `option-${n}`, label: `Option ${n}`, steps: [newStep()] };
		autoId.add(o);
		st.options.push(o);
		seg = { ...seg, oi: n - 1 };
		onchange();
	};
	const removeOption = (st: RawStage, oi: number) => {
		st.options!.splice(oi, 1);
		seg = { ...seg, oi: 0 };
		onchange();
	};

	// Things built by earlier (non-use) steps: what a "when built" cue can wait on.
	const builtBefore = (i: number): string[] => {
		const seen: string[] = [];
		// earlier stages along this path: shared steps, or the same option
		// (by id) of an earlier choice, else its first option
		const optId = stage?.options?.[seg.oi]?.id;
		const prior = (article.stages ?? [])
			.slice(0, seg.si)
			.flatMap((st) =>
				st.options
					? ((st.options.find((o) => o.id === optId) ?? st.options[0])?.steps ?? [])
					: (st.steps ?? [])
			);
		for (const s of [...prior, ...steps.slice(0, i)]) {
			if (s.use) continue;
			for (const it of s._items ?? []) {
				const n = lookup(it.name)?.name;
				if (n && !seen.includes(n)) seen.push(n);
			}
		}
		return seen.reverse();
	};

	const stepErrors = (i: number) =>
		errors.filter((e) => startsWith(e.path, segPath) && e.path[segPath.length] === i);

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

	const ensure = segSteps;
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

	// Step sources: where a step's timing or advice comes from.
	type SrcKind = 'youtube' | 'replay' | 'replays';
	const srcKind = (x: SourceIn): SrcKind =>
		x.replays ? 'replays' : 'replay' in x ? 'replay' : 'youtube';
	const addSource = (s: RawStep) => {
		(s.sources ??= []).push({ youtube: '' });
		onchange();
	};
	const setSrcKind = (s: RawStep, j: number, kind: string) => {
		const x = s.sources![j];
		const url = x.youtube ?? x.replay ?? '';
		s.sources![j] =
			kind === 'replays'
				? { replays: {} }
				: kind === 'replay'
					? { replay: url, label: x.label }
					: { youtube: url, label: x.label };
		onchange();
	};

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
			<input
				bind:value={article.title}
				oninput={onchange}
				placeholder="e.g. Nyoken's 2-Rax Academy"
			/>
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
	{#if !stages}
		<button class="add small" onclick={splitIntoStages}
			>Split into stages <em>for choices: what the scout saw, what the opponent techs to</em
			></button
		>
	{:else}
		<div class="stagebar">
			{#each stages as st, si (si)}
				<div class="stagechip" class:current={si === seg.si}>
					<button class="title" onclick={() => goto(si)}>{st.title || 'Untitled'}</button>
					{#if st.options}
						<div class="optchips">
							{#each st.options as o, oi (oi)}
								<button class:current={si === seg.si && oi === seg.oi} onclick={() => goto(si, oi)}
									>{o.label || o.id || '…'}</button
								>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
			<button class="add small" onclick={() => addStage(stages.length)}>+ Stage</button>
		</div>
		{#if stage}
			<div class="stagepanel">
				<label class="field">
					<span class="lbl">Stage title</span>
					<input bind:value={stage.title} oninput={onchange} placeholder="Opener, Mid game…" />
				</label>
				{#if stage.options}
					<label class="field">
						<span class="lbl">The choice <em>the question the reader answers</em></span>
						<input
							bind:value={stage.choose}
							oninput={onchange}
							placeholder="What did your scout see?"
						/>
					</label>
					{@const o = stage.options[seg.oi]}
					{#if o}
						<div class="optfields">
							<label class="field">
								<span class="lbl">Option</span>
								<input
									bind:value={o.label}
									oninput={() => {
										if (autoId.has(o)) o.id = slug(o.label ?? '');
										onchange();
									}}
									placeholder="vs 9 pool"
								/>
							</label>
							<label class="field">
								<span class="lbl">Id <em>same id in another stage = same choice</em></span>
								<input
									bind:value={o.id}
									oninput={() => {
										autoId.delete(o);
										onchange();
									}}
									placeholder="pool-first"
								/>
							</label>
							<label class="field wide">
								<span class="lbl">How you know</span>
								<input
									bind:value={o.read}
									oninput={onchange}
									placeholder="Lings arrive before the Nexus finishes"
								/>
							</label>
						</div>
					{/if}
				{/if}
				{#each stageErrors as e (e.message)}<p class="err">{e.message}</p>{/each}
				<div class="tools">
					{#if stage.options}
						<button class="small" onclick={() => addOption(stage)}>+ Option</button>
						{#if stage.options.length > 2}
							<button class="small" onclick={() => removeOption(stage, seg.oi)}
								>Remove this option</button
							>
						{/if}
						<button class="small" onclick={() => makeShared(stage)}
							>Make shared (keep this option)</button
						>
					{:else}
						<button class="small" onclick={() => makeChoice(stage)}>Make this a choice</button>
					{/if}
					<button class="small" onclick={() => addStage(seg.si + 1)}>+ Stage after</button>
					<span class="spacer"></span>
					<button
						class="icon"
						title="Move stage up"
						disabled={seg.si === 0}
						onclick={() => moveStage(seg.si, -1)}>↑</button
					>
					<button
						class="icon"
						title="Move stage down"
						disabled={seg.si === stages.length - 1}
						onclick={() => moveStage(seg.si, 1)}>↓</button
					>
					<button
						class="icon danger"
						title="Delete stage"
						disabled={stages.length === 1}
						onclick={() => removeStage(seg.si)}>🗑</button
					>
				</div>
			</div>
		{/if}
	{/if}
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

						<div class="field">
							<span class="lbl">Sources <em>where this comes from; shown behind a toggle</em></span>
							{#each s.sources ?? [] as x, j (j)}
								<div class="refrow source">
									<select
										value={srcKind(x)}
										onchange={(e) => setSrcKind(s, j, e.currentTarget.value)}
										aria-label="Source type"
									>
										<option value="youtube">Video</option>
										<option value="replay">Replay</option>
										<option value="replays">Replay stats</option>
									</select>
									{#if x.replays}
										<input
											class="num"
											type="number"
											min="1"
											placeholder="players"
											title="How many players took this step"
											bind:value={x.replays.players}
											oninput={onchange}
										/>
										<input
											class="clock"
											placeholder="5:52"
											title="Median time it was started"
											bind:value={x.replays.at}
											oninput={onchange}
										/>
										<input
											class="clock"
											placeholder="5:43-6:00"
											title="Where the middle half fell"
											bind:value={x.replays.range}
											oninput={onchange}
										/>
										<input
											class="num"
											type="number"
											min="0"
											placeholder="supply"
											title="Median supply"
											bind:value={x.replays.supply}
											oninput={onchange}
										/>
									{:else if srcKind(x) === 'replay'}
										<input
											bind:value={x.replay}
											oninput={onchange}
											placeholder="https://cwal.gg/viewer?match=…"
										/>
										<input
											class="label"
											bind:value={x.label}
											oninput={onchange}
											placeholder="label"
										/>
									{:else}
										<input
											bind:value={x.youtube}
											oninput={onchange}
											placeholder="https://youtu.be/…?t=95 (link at the moment)"
										/>
										<input
											class="label"
											bind:value={x.label}
											oninput={onchange}
											placeholder="label"
										/>
									{/if}
									<button
										class="icon"
										title="Remove source"
										onclick={() => {
											s.sources!.splice(j, 1);
											onchange();
										}}>✕</button
									>
								</div>
							{/each}
							<button class="add small" onclick={() => addSource(s)}>+ Add a source</button>
						</div>

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
	.refrow + .refrow {
		margin-top: 4px;
	}
	.refrow.source {
		margin-bottom: 4px;
	}
	.refrow.source input.num,
	.refrow.source input.clock {
		flex: 0 1 5.5em;
		min-width: 0;
	}
	.refrow.source input.label {
		flex: 0 1 9em;
	}
	.meta .add {
		align-self: flex-start;
	}
	.stagebar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: flex-start;
		margin-bottom: 8px;
	}
	.stagechip {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 3px;
		border-radius: 8px;
		border: 1px solid var(--border);
	}
	.stagechip.current {
		border-color: var(--accent);
	}
	.stagechip .title {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.optchips {
		display: flex;
		gap: 3px;
	}
	.optchips button {
		font-size: 0.72rem;
	}
	.optchips button.current {
		background: var(--accent);
		color: #0b0d10;
	}
	.stagepanel {
		display: grid;
		gap: 6px;
		margin-bottom: 10px;
		padding: 8px;
		border-radius: 8px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
	}
	.optfields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.optfields .wide {
		grid-column: 1 / -1;
	}
	.stagepanel .err {
		margin: 0;
		font-size: 0.78rem;
		color: var(--red, #f87171);
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
