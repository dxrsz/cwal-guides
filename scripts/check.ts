// Validates every article the same way the preview page does. CI runs this on
// pull requests so a broken article can't be merged.
import { readdirSync, readFileSync } from 'node:fs';
import { parseArticle } from '../src/parse';

const dir = new URL('../articles/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
let bad = 0;
for (const f of files) {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*\.yaml$/.test(f)) {
		console.error(
			`articles/${f}: file names are lowercase words joined by "-" (it becomes the url).`
		);
		bad++;
	}
	const { errors } = parseArticle(readFileSync(new URL(f, dir), 'utf8'));
	for (const e of errors) {
		console.error(`articles/${f}${e.line ? `:${e.line}` : ''}: ${e.message}`);
		bad++;
	}
}
const order = JSON.parse(readFileSync(new URL('order.json', dir), 'utf8')) as string[];
for (const s of order) {
	if (!files.includes(`${s}.yaml`)) {
		console.error(`articles/order.json lists "${s}" but there is no ${s}.yaml.`);
		bad++;
	}
}
if (bad) {
	console.error(`\n${bad} problem${bad > 1 ? 's' : ''}.`);
	process.exit(1);
}
console.log(`${files.length} articles OK.`);
