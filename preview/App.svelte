<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { parseArticle, builds, type BuildOrder, type Issue } from '../src';
	import BuildGuide from '../src/BuildGuide.svelte';
	import BuildSearch from '../src/BuildSearch.svelte';
	import VisualEditor from './VisualEditor.svelte';
	import template from './template.yaml?raw';
	import { hydrate, readArticle, writeArticle, type Article } from './article';

	// Where pull requests go. Articles live at articles/<slug>.yaml.
	const REPO = 'dxrsz/cwal-guides';
	const ARTICLES = 'articles';

	const sources = import.meta.glob('../articles/*.yaml', {
		eager: true,
		query: '?raw',
		import: 'default'
	}) as Record<string, string>;
	const existing = Object.entries(sources)
		.map(([p, text]) => ({ slug: p.match(/([^/]+)\.yaml$/)![1], text }))
		.sort((a, b) => a.slug.localeCompare(b.slug));

	// ---- the draft, kept in this browser between visits -------------------
	const DRAFT_KEY = 'cwal-guides:draft';
	// A new guide starts nearly empty; the example shows every feature in use.
	const BLANK = 'title: \nmatchup: TvZ\nobjective: \nsteps:\n  - at: 9 supply\n    make: \n';
	// Where the editor's text came from: a blank guide, the example, or the
	// slug of a published build being edited.
	type Source = '__blank' | '__example' | string;
	const pristine = (src: Source) =>
		src === '__blank'
			? BLANK
			: src === '__example'
				? template
				: (existing.find((x) => x.slug === src)?.text ?? '');
	type Draft = { text: string; source?: Source; editing?: string | null; mode?: 'visual' | 'yaml' };
	const load = (): Draft => {
		try {
			const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
			if (d && typeof d.text === 'string') return d;
		} catch {
			/* storage blocked or corrupt: start fresh */
		}
		return { text: BLANK, source: '__blank' };
	};
	const initial = load();
	let text = $state(initial.text);
	// The slug of the published article being edited, or null for a new one.
	let source = $state<Source>(initial.source ?? initial.editing ?? '__example');
	// The slug of the published article being edited, or null for a new one.
	const editing = $derived(source.startsWith('__') ? null : source);
	// Visual (form) or YAML editing. Both edit the same article text.
	let mode = $state<'visual' | 'yaml'>(initial.mode ?? 'visual');
	$effect(() => {
		const d: Draft = { text, source, mode };
		try {
			localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
		} catch {
			/* not fatal; the draft just won't survive a reload */
		}
	});

	// ---- parse, debounced; keep showing the last good render on errors ----
	let errors = $state<Issue[]>([]);
	let good = $state<BuildOrder | null>(null);
	let goodKey = $state('');
	let stale = $state(false);
	const run = (src: string) => {
		const r = parseArticle(src);
		errors = r.errors;
		if (r.build) {
			const key = JSON.stringify(r.build);
			// Remount the guide only when the render actually changes; it snapshots
			// its steps on mount, the same way the cwal.gg route does.
			if (key !== goodKey) {
				good = r.build;
				goodKey = key;
			}
			stale = false;
		} else stale = good !== null;
	};
	run(untrack(() => text));
	$effect(() => {
		const src = text;
		const t = setTimeout(() => run(src), 250);
		return () => clearTimeout(t);
	});

	// ---- the visual editor's model ------------------------------------------
	// The form edits `model`; each edit rewrites `text` from it. Text that
	// changes any other way (the YAML tab, "Start from") is read back into a
	// fresh model. `written` remembers our own writes so they don't loop.
	let model = $state<Article | null>(null);
	let written = '';
	const readModel = (src: string) => {
		const a = readArticle(src);
		model = a ? hydrate(a) : null;
	};
	readModel(untrack(() => text));
	$effect(() => {
		const src = text;
		if (src !== written) untrack(() => readModel(src));
	});
	const fromVisual = () => {
		if (!model) return;
		written = writeArticle($state.snapshot(model) as Article);
		text = written;
	};

	// ---- preview controls ---------------------------------------------------
	let view = $state<'guide' | 'sheet' | 'card'>('guide');
	let guideView = $state<'guide' | 'sheet'>('guide');
	$effect(() => {
		if (view === 'guide' || view === 'sheet') guideView = view;
	});
	$effect(() => {
		// The guide's own Guide / Cheat sheet toggle drives the tabs back.
		const g = guideView;
		untrack(() => {
			if (view !== 'card') view = g;
		});
	});
	let phone = $state(false);

	const slugify = (s: string) =>
		s
			.toLowerCase()
			.replace(/['’]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 60) || 'my-build';
	const slug = $derived(
		editing ?? slugify((typeof model?.title === 'string' && model.title) || 'my-build')
	);
	const cardBuilds = $derived(
		good ? [{ slug, build: good }, ...builds.filter((b) => b.slug !== slug)] : builds
	);

	// ---- editor helpers -----------------------------------------------------
	let ta: HTMLTextAreaElement | undefined = $state();
	let gutter: HTMLDivElement | undefined = $state();
	const lineCount = $derived(text.split('\n').length);
	const errLines = $derived(new Set(errors.map((e) => e.line).filter(Boolean)));

	const goTo = async (line?: number) => {
		// In the visual editor, the step itself carries the message.
		if (!line || mode !== 'yaml') return;
		await tick();
		if (!ta) return;
		const lines = text.split('\n');
		const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
		ta.focus();
		ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
		const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
		ta.scrollTop = Math.max(0, (line - 4) * lh);
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== 'Tab' || !ta) return;
		e.preventDefault();
		const { selectionStart: a, selectionEnd: b } = ta;
		text = text.slice(0, a) + '  ' + text.slice(b);
		requestAnimationFrame(() => ta!.setSelectionRange(a + 2, a + 2));
	};
	const syncScroll = () => {
		if (gutter && ta) gutter.scrollTop = ta.scrollTop;
	};

	const start = (e: Event) => {
		const sel = e.currentTarget as HTMLSelectElement;
		const v = sel.value as Source;
		// Only ask when there are edits that would be lost.
		if (text !== pristine(source) && !confirm('Discard your changes and switch?')) {
			sel.value = source;
			return;
		}
		source = v;
		text = pristine(v);
		// Don't keep showing the previous guide while the new one is incomplete.
		good = null;
		goodKey = '';
		stale = false;
	};

	// ---- hand-off to GitHub -------------------------------------------------
	let toast = $state('');
	const flash = (m: string) => {
		toast = m;
		setTimeout(() => (toast = ''), 6000);
	};
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			return false;
		}
	};
	const download = () => {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type: 'text/yaml' }));
		a.download = `${slug}.yaml`;
		a.click();
		URL.revokeObjectURL(a.href);
	};
	const propose = async () => {
		if (errors.length) return flash('Fix the problems listed under the editor first.');
		if (editing) {
			// GitHub can't prefill an edit, so hand over via the clipboard.
			const ok = await copy();
			window.open(`https://github.com/${REPO}/edit/main/${ARTICLES}/${editing}.yaml`, '_blank');
			return flash(
				ok
					? 'Copied. On GitHub, select all in the editor, paste, then "Propose changes".'
					: 'Copy the editor text, then paste it over the file on GitHub.'
			);
		}
		const base = `https://github.com/${REPO}/new/main/${ARTICLES}?filename=${encodeURIComponent(slug + '.yaml')}`;
		const full = `${base}&value=${encodeURIComponent(text)}`;
		if (full.length < 8000) {
			window.open(full, '_blank');
			return flash('Opened GitHub with your article filled in. Click "Propose new file".');
		}
		const ok = await copy();
		window.open(base, '_blank');
		flash(
			ok
				? 'Your article is long, so it was copied instead. Paste it into the GitHub editor, then "Propose new file".'
				: 'Copy the editor text and paste it into the GitHub editor.'
		);
	};
</script>

<div class="app">
	<header class="top">
		<a class="brand" href="https://cwal.gg/builds" target="_blank" rel="noopener"
			>cwal<span>.gg</span></a
		>
		<h1>Build Order Builder</h1>
		<a class="help" href="https://github.com/{REPO}/#readme" target="_blank" rel="noopener"
			>Format guide</a
		>
	</header>

	<main class="split">
		<section class="editor">
			<div class="bar">
				<select value={source} onchange={start} aria-label="Guide">
					<optgroup label="Write a new guide">
						<option value="__blank">New blank guide</option>
						<option value="__example">New, from the example</option>
					</optgroup>
					<optgroup label="Edit a published guide">
						{#each existing as a (a.slug)}<option value={a.slug}>{a.slug}</option>{/each}
					</optgroup>
				</select>
				<div class="tabs mode" role="tablist" aria-label="Editor">
					<button
						role="tab"
						aria-selected={mode === 'visual'}
						class:active={mode === 'visual'}
						onclick={() => (mode = 'visual')}>Visual</button
					>
					<button
						role="tab"
						aria-selected={mode === 'yaml'}
						class:active={mode === 'yaml'}
						onclick={() => (mode = 'yaml')}>YAML</button
					>
				</div>
				<span class="file">{ARTICLES}/<b>{slug}</b>.yaml{editing ? '' : ' (new)'}</span>
			</div>
			{#if mode === 'visual'}
				{#if model}
					<VisualEditor article={model} {errors} onchange={fromVisual} />
				{:else}
					<p class="broken">
						The YAML has a syntax error, so the visual editor can't read it.
						<button onclick={() => (mode = 'yaml')}>Fix it in YAML</button>
					</p>
				{/if}
			{:else}
				<div class="code">
					<div class="gutter" bind:this={gutter} aria-hidden="true">
						{#each { length: lineCount } as _, i (i)}
							<div class:bad={errLines.has(i + 1)}>{i + 1}</div>
						{/each}
					</div>
					<textarea
						bind:this={ta}
						bind:value={text}
						onkeydown={onKey}
						onscroll={syncScroll}
						spellcheck="false"
						autocapitalize="off"
						autocomplete="off"
						aria-label="Article YAML"
					></textarea>
				</div>
			{/if}
			<div class="problems" class:ok={!errors.length}>
				{#if errors.length}
					<b>{errors.length} problem{errors.length > 1 ? 's' : ''}</b>
					<ul>
						{#each errors as e, i (i)}
							<li>
								<button onclick={() => goTo(e.line)}>
									{#if mode === 'visual' && e.path[0] === 'steps' && typeof e.path[1] === 'number'}
										<span class="ln">step {e.path[1] + 1}</span>
									{:else if e.line}<span class="ln">line {e.line}</span>{/if}
									{e.message}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<span>✓ Looks good. This is exactly how it will render on cwal.gg.</span>
				{/if}
			</div>
			<div class="actions">
				<button class="primary" onclick={propose} disabled={errors.length > 0}
					>{editing ? 'Propose this edit on GitHub' : 'Open a pull request on GitHub'}</button
				>
				<button onclick={async () => flash((await copy()) ? 'Copied.' : 'Copy failed.')}
					>Copy</button
				>
				<button onclick={download}>Download</button>
			</div>
		</section>

		<section class="preview">
			<div class="bar">
				<div class="tabs" role="tablist" aria-label="Preview">
					<button
						role="tab"
						aria-selected={view === 'guide'}
						class:active={view === 'guide'}
						onclick={() => (view = 'guide')}>Full guide</button
					>
					<button
						role="tab"
						aria-selected={view === 'sheet'}
						class:active={view === 'sheet'}
						onclick={() => (view = 'sheet')}>Cheat sheet</button
					>
					<button
						role="tab"
						aria-selected={view === 'card'}
						class:active={view === 'card'}
						onclick={() => (view = 'card')}>Browse card</button
					>
				</div>
				<label class="phone"><input type="checkbox" bind:checked={phone} /> Phone width</label>
			</div>
			{#if stale}
				<div class="stale">
					Showing the last version without problems. Fix the editor to update.
				</div>
			{/if}
			<div class="stage" class:phone>
				{#if !good}
					<p class="empty">
						The preview appears once the guide has a title, an objective and a first step.
					</p>
				{:else if view === 'card'}
					<div class="cardpage">
						<BuildSearch builds={cardBuilds} hrefFor={() => '#'} />
					</div>
				{:else}
					{#key goodKey}
						<BuildGuide build={good} backHref={null} bind:view={guideView} />
					{/key}
				{/if}
			</div>
		</section>
	</main>

	{#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
	}
	.brand {
		font-weight: 800;
		font-size: 1.05rem;
		color: var(--text);
		text-decoration: none;
	}
	.brand span {
		color: var(--accent);
	}
	h1 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.help {
		margin-left: auto;
		color: var(--link);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.mode {
		margin-right: 4px;
	}
	.broken {
		padding: 24px 16px;
		color: var(--text-2);
	}
	.split {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(340px, 5fr) 7fr;
	}
	.editor {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid var(--border);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		min-height: 44px;
		flex-wrap: wrap;
	}
	select,
	button {
		font: inherit;
		font-size: 0.82rem;
		color: var(--text);
		background: var(--bg-hover);
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		padding: 4px 10px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.file {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--text-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file b {
		color: var(--text-2);
		font-weight: 600;
	}
	.code {
		flex: 1;
		min-height: 0;
		display: flex;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 12.5px;
		line-height: 19px;
	}
	.gutter {
		overflow: hidden;
		padding: 10px 0;
		min-width: 42px;
		text-align: right;
		color: var(--text-3);
		background: var(--bg-elev);
		user-select: none;
	}
	.gutter div {
		padding: 0 8px 0 6px;
		height: 19px;
	}
	.gutter .bad {
		color: #fff;
		background: color-mix(in srgb, var(--red) 55%, transparent);
	}
	textarea {
		flex: 1;
		resize: none;
		border: 0;
		outline: none;
		padding: 10px 12px;
		margin: 0;
		font: inherit;
		line-height: inherit;
		color: var(--text);
		background: var(--bg);
		white-space: pre;
		overflow: auto;
		tab-size: 2;
	}
	.problems {
		max-height: 30%;
		overflow: auto;
		padding: 8px 12px;
		border-top: 1px solid var(--border);
		font-size: 0.82rem;
		color: var(--red);
		background: color-mix(in srgb, var(--red) 7%, var(--bg));
	}
	.problems.ok {
		color: var(--green);
		background: color-mix(in srgb, var(--green) 6%, var(--bg));
	}
	.problems ul {
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
	}
	.problems li button {
		all: unset;
		cursor: pointer;
		display: block;
		padding: 2px 0;
		color: var(--text);
	}
	.problems li button:hover {
		text-decoration: underline;
	}
	.ln {
		font-family: ui-monospace, monospace;
		color: var(--red);
		margin-right: 6px;
	}
	.actions {
		display: flex;
		gap: 8px;
		padding: 10px 12px;
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.actions .primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
		font-weight: 600;
	}
	.preview {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}
	.tabs {
		display: flex;
		gap: 4px;
	}
	.tabs button {
		background: transparent;
		border-color: transparent;
		color: var(--text-2);
	}
	.tabs button.active {
		background: var(--bg-hover);
		border-color: var(--border-strong);
		color: var(--text);
	}
	.phone {
		margin-left: auto;
		font-size: 0.82rem;
		color: var(--text-2);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.stale {
		padding: 6px 12px;
		font-size: 0.8rem;
		color: #f5c04a;
		background: color-mix(in srgb, #f5c04a 10%, var(--bg));
		border-bottom: 1px solid var(--border);
	}
	.stage {
		flex: 1;
		overflow: auto;
		min-height: 0;
	}
	.stage.phone {
		max-width: 390px;
		margin: 12px auto;
		border: 1px solid var(--border-strong);
		border-radius: 18px;
	}
	.cardpage {
		max-width: 940px;
		margin: 0 auto;
		padding: 28px 20px 80px;
	}
	.empty {
		padding: 40px;
		color: var(--text-3);
		text-align: center;
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: 22px;
		transform: translateX(-50%);
		max-width: min(560px, calc(100vw - 32px));
		padding: 10px 16px;
		border-radius: 8px;
		background: var(--bg-hover);
		border: 1px solid var(--border-strong);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
		font-size: 0.85rem;
	}
	@media (max-width: 860px) {
		.app {
			height: auto;
		}
		.split {
			grid-template-columns: 1fr;
		}
		.editor {
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
		.code {
			height: 55vh;
			flex: none;
		}
		.stage {
			overflow: visible;
		}
	}
</style>
