import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Vite's parser (oxc) rejects `\` + digit inside a JSX attribute string as a
// deprecated octal escape, which breaks `npm run dev`; and JSX strings don't
// process escapes in TS/Babel, so `\\` would render twice. Use `attr={"...\\..."}`.
// ponytail: regex scan, not a parse; good enough for one-line attribute literals.
test('no JSX attribute string contains a backslash', () => {
	const dir = import.meta.dirname
	const offenders = readdirSync(dir, { recursive: true, encoding: 'utf8' })
		.filter((f) => f.endsWith('.tsx'))
		.flatMap((f) =>
			readFileSync(join(dir, f), 'utf8')
				.split('\n')
				.flatMap((line, i) => (/\w="[^"]*\\/.test(line) ? [`${f}:${i + 1}`] : [])),
		)
	assert.deepEqual(offenders, [])
})
