import path from 'node:path'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dataRoot, ensureDirectory, readJsonFile, writeJsonFileAtomic, writeTextFileAtomic } from './jsonStore'

// One folder per series (keyed by the erai-raws slug): data/series/<slug>/{erai,erai-releases,mal,anidb}.json + <site>.<ext> images.
export const seriesRoot = path.join(dataRoot, 'series')

const imageExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
const contentTypes = Object.fromEntries(Object.entries(imageExtensions).map(([type, ext]) => [ext, type]))

// Slugs and site names come from URLs: reject anything that could escape data/series/.
export function isSafeSeriesKey(value: string | undefined): value is string {
	return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value)
}

function seriesDir(slug: string, root: string): string {
	if (!isSafeSeriesKey(slug)) {
		throw new Error(`Invalid series slug: ${slug}`)
	}
	return path.join(root, slug)
}

export async function readSeriesJson<T>(slug: string, name: string, root = seriesRoot): Promise<T | undefined> {
	return readJsonFile<T | undefined>(path.join(seriesDir(slug, root), `${name}.json`), undefined)
}

export async function writeSeriesJson<T>(slug: string, name: string, value: T, root = seriesRoot): Promise<void> {
	await writeJsonFileAtomic(path.join(seriesDir(slug, root), `${name}.json`), value)
}

// Which of the given sources already have their <name>.json saved (drives the "not downloaded yet" tab markers).
export async function listSavedSeriesSources<T extends string>(slug: string, names: readonly T[], root = seriesRoot): Promise<T[]> {
	const files = new Set(await readdir(seriesDir(slug, root)).catch(() => []))
	return names.filter((name) => files.has(`${name}.json`))
}

// Raw source payloads (e.g. anidb.xml) kept so they can be re-parsed without another request.
export async function readSeriesText(slug: string, fileName: string, root = seriesRoot): Promise<string | undefined> {
	return readFile(path.join(seriesDir(slug, root), fileName), 'utf8').catch(() => undefined)
}

export async function writeSeriesText(slug: string, fileName: string, content: string, root = seriesRoot): Promise<void> {
	await writeTextFileAtomic(path.join(seriesDir(slug, root), fileName), content)
}

export async function findSeriesImage(slug: string, site: string, root = seriesRoot): Promise<{ filePath: string; contentType: string } | undefined> {
	const dir = seriesDir(slug, root)
	for (const name of await readdir(dir).catch(() => [])) {
		const contentType = contentTypes[path.extname(name).slice(1)]
		if (name.startsWith(`${site}.`) && contentType) {
			return { filePath: path.join(dir, name), contentType }
		}
	}
	return undefined
}

// Best effort: a missing image never fails the details fetch.
export async function saveSeriesImage(slug: string, site: string, imageUrl: string | undefined, fetchImpl: typeof fetch = fetch, root = seriesRoot): Promise<void> {
	if (!imageUrl) {
		return
	}
	try {
		const response = await fetchImpl(imageUrl, { headers: { 'user-agent': 'Mozilla/5.0' } })
		const extension = imageExtensions[(response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '']
		if (!response.ok || !extension) {
			throw new Error(`${response.status} ${response.headers.get('content-type') ?? 'no content-type'}`)
		}
		const body = Buffer.from(await response.arrayBuffer())
		const previous = await findSeriesImage(slug, site, root)
		if (previous) {
			await rm(previous.filePath)
		}
		await ensureDirectory(seriesDir(slug, root))
		await writeFile(path.join(seriesDir(slug, root), `${site}.${extension}`), body)
	} catch (error) {
		console.warn(`Could not save ${site} image for ${slug}: ${error instanceof Error ? error.message : String(error)}`)
	}
}
