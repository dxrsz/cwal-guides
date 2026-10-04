// The build-order registry: every article in ../articles, parsed, under a
// stable url slug (its file name). cwal.gg's /builds pages and the preview
// site both read from here, so a build renders the same in both.
import { parseArticle } from './parse';
import type { BuildOrder } from './types';
import order from '../articles/order.json';

export type BuildEntry = { slug: string; build: BuildOrder };

const files = import.meta.glob('../articles/*.yaml', {
	eager: true,
	query: '?raw',
	import: 'default'
}) as Record<string, string>;

const parsed: BuildEntry[] = Object.entries(files).flatMap(([path, text]) => {
	const slug = path.match(/([^/]+)\.yaml$/)![1];
	const { build, errors } = parseArticle(text);
	if (!build) {
		// CI (`npm run check`) rejects broken articles, so this only fires on a
		// local edit; skip it rather than take the whole page down.
		console.error(`[guides] ${slug}.yaml:`, errors);
		return [];
	}
	return [{ slug, build }];
});

// Browse-page order: the slugs listed in order.json first, then any others by name.
const rank = (slug: string) => {
	const i = (order as string[]).indexOf(slug);
	return i < 0 ? Infinity : i;
};

/** All published builds, in the order they show on the browse page. */
export const builds: BuildEntry[] = parsed.sort(
	(a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug)
);

/** Look up a build by its url slug, or undefined if there is no such build. */
export const buildBySlug = (slug: string): BuildEntry | undefined =>
	builds.find((e) => e.slug === slug);
