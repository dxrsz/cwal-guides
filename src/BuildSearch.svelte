<script lang="ts">
	// The build browser: a text filter plus matchup chips over the build registry,
	// rendering each build as a card that links to its guide. Kept purely client
	// side; the registry is small and static, so there is nothing to fetch.
	import type { BuildEntry } from './registry';

	let {
		builds,
		hrefFor = (slug: string) => `/builds/${slug}`
	}: { builds: BuildEntry[]; hrefFor?: (slug: string) => string } = $props();

	let q = $state('');
	let matchup = $state<string | null>(null);

	// The matchups present in the registry, in first-seen order, for the chips.
	const matchups = $derived.by(() => {
		const seen: string[] = [];
		for (const { build } of builds) if (!seen.includes(build.matchup)) seen.push(build.matchup);
		return seen;
	});

	const results = $derived.by(() => {
		const term = q.trim().toLowerCase();
		return builds.filter(({ build }) => {
			if (matchup && build.matchup !== matchup) return false;
			if (!term) return true;
			const hay = [build.title, build.creator, build.tagline, build.matchup]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return hay.includes(term);
		});
	});
</script>

<div class="controls">
	<div class="searchbox">
		<span class="ico" aria-hidden="true">⌕</span>
		<input
			type="search"
			placeholder="Search builds by name, player, or matchup"
			bind:value={q}
			aria-label="Search builds"
		/>
	</div>
	{#if matchups.length > 1}
		<div class="chips" role="group" aria-label="Filter by matchup">
			<button class="chip" class:active={matchup === null} onclick={() => (matchup = null)}
				>All</button
			>
			{#each matchups as m (m)}
				<button
					class="chip"
					class:active={matchup === m}
					onclick={() => (matchup = matchup === m ? null : m)}>{m}</button
				>
			{/each}
		</div>
	{/if}
</div>

{#if results.length}
	<ul class="grid">
		{#each results as { slug, build } (slug)}
			<li>
				<a class="card" href={hrefFor(slug)}>
					<div class="top">
						<span class="matchup">{build.matchup}</span>
						{#if build.references?.some((r) => r.kind === 'youtube')}
							<span class="badge yt" title="Has a video guide">▶</span>
						{/if}
					</div>
					<h3>{build.title}</h3>
					{#if build.tagline}<p class="tagline">{build.tagline}</p>{/if}
					<div class="foot">
						{#if build.creator}<span>by <b>{build.creator}</b></span>{/if}
						<span class="count">{build.steps.length} steps</span>
					</div>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty">No builds match “{q}”.</p>
{/if}

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		margin-bottom: 22px;
	}
	.searchbox {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1 1 260px;
		padding: 9px 14px;
		border-radius: var(--radius);
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
	}
	.searchbox:focus-within {
		border-color: var(--accent);
	}
	.searchbox .ico {
		color: var(--text-3);
		font-size: 1.1rem;
		line-height: 1;
	}
	.searchbox input {
		flex: 1;
		border: none;
		outline: none;
		background: transparent;
		color: var(--text);
		font-size: 0.92rem;
	}
	.searchbox input::placeholder {
		color: var(--text-3);
	}

	.chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.chip {
		appearance: none;
		cursor: pointer;
		padding: 6px 12px;
		border-radius: 999px;
		font-family: ui-monospace, monospace;
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--text-2);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		transition:
			color 0.15s,
			background 0.15s,
			border-color 0.15s;
	}
	.chip:hover {
		color: var(--text);
	}
	.chip.active {
		color: #0b0d10;
		background: var(--accent);
		border-color: var(--accent);
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 16px;
	}

	.card {
		display: block;
		height: 100%;
		padding: 16px 18px;
		border-radius: var(--radius);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		text-decoration: none;
		transition:
			border-color 0.15s,
			background 0.15s,
			transform 0.15s;
	}
	.card:hover {
		border-color: var(--accent);
		background: var(--bg-hover);
		transform: translateY(-2px);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.matchup {
		font-family: ui-monospace, monospace;
		font-weight: 700;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		padding: 2px 8px;
		border-radius: 999px;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.badge.yt {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 5px;
		font-size: 0.6rem;
		color: #fff;
		background: #ff0033;
	}
	.card h3 {
		margin: 0 0 6px;
		font-size: 1.12rem;
		font-weight: 800;
		color: var(--text);
	}
	.tagline {
		margin: 0 0 14px;
		font-size: 0.86rem;
		line-height: 1.45;
		color: var(--text-2);
	}
	.foot {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.82rem;
		color: var(--text-3);
	}
	.foot b {
		color: var(--text-2);
		font-weight: 600;
	}
	.foot .count {
		font-family: ui-monospace, monospace;
		font-size: 0.74rem;
	}

	.empty {
		color: var(--text-3);
		font-size: 0.92rem;
	}
</style>
