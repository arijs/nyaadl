import path from 'node:path'
import type { DetailsCrawlerEntry, DetailsCrawlerSource, DetailsCrawlerStatus, DetailsCrawlerStepResult, WatchTargetFile } from '@shared/api'
import type { DecisionRecord, DecisionStatus, EraiRawsSeries, QbittorrentAddApiResponseItem, WatchTarget } from '@shared/types'
import { getAnidbClientStatus, getAnidbDetails, anidbAnimeId } from './anidbService'
import { resolveEraiSeriesSlug } from './eraiAnimeListService'
import { EraiRawsAuthError, getEraiSeries } from './eraiRawsService'
import { getMalDetails, malAnimeId } from './malService'
import { findNyaaDetailFile, getNyaaDetail } from './nyaaDetailService'
import { extractReleaseFingerprint } from './localLibraryService'
import { buildNormalizedKey, deriveSeriesBase } from './normalizeService'
import { findIndexedTorrentByPath, getQbittorrentIndex, normalizeQbittorrentPath, type IndexedTorrent } from './qbittorrentIndexService'
import { decisionsState, qbittorrentAddResponsesState, watchRootsState, watchTargetsState } from './runtimeStateService'
import { listSavedSeriesSources, readSeriesJson } from '../storage/seriesStore'
import { listWatchTargetFiles } from './watchTargetFilesService'
import { getRootMatch } from './watchTargetService'

const sources: DetailsCrawlerSource[] = ['nyaa', 'erai', 'mal', 'anidb']
const stepResults: DetailsCrawlerStepResult[] = ['cached', 'fetched', 'no-link', 'no-torrent', 'skipped', 'error']
// At most one series every 3s, counted only after series that went to the network.
export const crawlIntervalMs = 3000
const recentLimit = 50

// Season roots are named "YYYY.N <season>" (N = 1 Inverno .. 4 Outono); newest first, others last.
export function seasonOrder(rootPath: string): number {
	const match = /(\d{4})\.(\d)/.exec(path.basename(rootPath))
	return match ? Number(match[1]) * 10 + Number(match[2]) : Number.NEGATIVE_INFINITY
}

export interface CrawlTarget {
	target: WatchTarget
	rootName: string
}

export function orderCrawlTargets(targets: WatchTarget[], roots: string[]): CrawlTarget[] {
	const byRoot = new Map<string, WatchTarget[]>()
	for (const target of targets) {
		const root = getRootMatch(target.folderPath, roots) ?? ''
		byRoot.set(root, [...(byRoot.get(root) ?? []), target])
	}
	return [...byRoot.keys()]
		.sort((left, right) => seasonOrder(right) - seasonOrder(left) || path.basename(left).localeCompare(path.basename(right)))
		.flatMap((root) => (byRoot.get(root) ?? [])
			.sort((left, right) => left.folderName.localeCompare(right.folderName))
			.map((target) => ({ target, rootName: root ? path.basename(root) : 'other' })))
}

export interface FolderTorrent {
	torrentId: string
	name: string
}

// The torrent of the lowest episode among those sent to a folder (by name; unnumbered ones last).
export function pickFolderTorrentId(torrents: FolderTorrent[]): string | undefined {
	const episode = (torrent: FolderTorrent) => Number.parseInt(extractReleaseFingerprint(torrent.name).episode ?? '', 10)
	const order = (torrent: FolderTorrent) => (Number.isNaN(episode(torrent)) ? Number.POSITIVE_INFINITY : episode(torrent))
	return [...torrents].sort((left, right) => order(left) - order(right) || left.name.localeCompare(right.name))[0]?.torrentId
}

const downloadedStatuses = new Set<DecisionStatus>(['auto_downloaded', 'approved', 'already_downloaded'])

// Torrents of a target from what nyaadl and qBittorrent know, for when no local file leads to one.
// ponytail: linear scans of the add history, the qBittorrent index and the decisions; only runs for targets with no usable file.
export function findTargetTorrents(
	target: WatchTarget,
	sources: { sent: QbittorrentAddApiResponseItem[]; indexed: Iterable<IndexedTorrent>; decisions: DecisionRecord[] },
): FolderTorrent[] {
	const folder = normalizeQbittorrentPath(target.folderPath)
	const sent = sources.sent
		.filter((response) => response.ok && normalizeQbittorrentPath(response.targetFolderPath) === folder)
		.map((response) => ({ torrentId: response.torrentId, name: response.torrentFilename }))
	// A file inside the folder, or a batch whose content is the folder itself.
	const indexed = [...sources.indexed]
		.filter((torrent) => torrent.nyaaTorrentId && [torrent.contentPath, path.dirname(torrent.contentPath)].some((candidate) => normalizeQbittorrentPath(candidate) === folder))
		.map((torrent) => ({ torrentId: torrent.nyaaTorrentId!, name: torrent.name }))
	// Downloaded or approved torrents of the same series+resolution, even if qBittorrent no longer has them.
	const decided = sources.decisions
		.filter((decision) => downloadedStatuses.has(decision.status) && buildNormalizedKey(deriveSeriesBase(decision.item.seriesBaseRaw), decision.item.resolution) === target.normalizedKey)
		.map((decision) => ({ torrentId: decision.torrentId, name: decision.item.title }))
	return [...sent, ...indexed, ...decided]
}

type NyaaDetailForSlug = { information?: string; title: string }

export interface CrawlDeps {
	listFiles: (target: WatchTarget) => Promise<WatchTargetFile[]>
	findIndexedNyaaId: (filePath: string) => string | undefined
	// Torrents of the target when no local file leads to one: files not on disk yet (nyaadl adds torrents to
	// qBittorrent stopped), a batch torrent whose content is the folder itself, or a torrent gone from qBittorrent.
	findFolderTorrents: (target: WatchTarget) => FolderTorrent[]
	processedAtUtc: (torrentId: string) => string | undefined
	hasNyaaDetail: (torrentId: string) => Promise<boolean>
	getNyaaDetail: (torrentId: string, processedAtUtc: string | undefined) => Promise<NyaaDetailForSlug>
	resolveSlug: (detail: NyaaDetailForSlug) => Promise<string | undefined>
	savedSeriesSources: (slug: string) => Promise<string[]>
	readEraiSeries: (slug: string) => Promise<Pick<EraiRawsSeries, 'links'> | undefined>
	getEraiSeries: (slug: string) => Promise<unknown>
	getMalDetails: (slug: string) => Promise<unknown>
	getAnidbDetails: (slug: string) => Promise<unknown>
}

export interface CrawlTargetResult {
	torrentId?: string
	slug?: string
	steps: Record<DetailsCrawlerSource, DetailsCrawlerStepResult>
	errors: string[]
	usedNetwork: boolean
	// Set when the run must stop (the erai-raws session is gone: every later series would fail too).
	fatal?: string
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

// One target: the first local file's Nyaa details, then the series' Erai page, MAL and AniDB data.
// Anything already saved is skipped without touching the network. `options.anidbEnabled` is turned off
// for the rest of the run when AniDB isn't configured or bans us.
export async function crawlTarget(target: WatchTarget, deps: CrawlDeps, options: { anidbEnabled: boolean }): Promise<CrawlTargetResult> {
	const result: CrawlTargetResult = { steps: { nyaa: 'no-torrent', erai: 'skipped', mal: 'skipped', anidb: 'skipped' }, errors: [], usedNetwork: false }
	const fail = (source: DetailsCrawlerSource, error: unknown) => {
		result.steps[source] = 'error'
		result.errors.push(`${source}: ${message(error)}`)
	}

	// "Only the first file is enough": the first file (by episode) with a known torrent id.
	const files = await deps.listFiles(target)
	for (const file of files) {
		result.torrentId = file.torrent?.torrentId ?? deps.findIndexedNyaaId(path.join(target.folderPath, file.name))
		if (result.torrentId) {
			break
		}
	}
	result.torrentId ??= pickFolderTorrentId(deps.findFolderTorrents(target))
	if (!result.torrentId) {
		return result
	}

	let detail: NyaaDetailForSlug
	try {
		result.steps.nyaa = (await deps.hasNyaaDetail(result.torrentId)) ? 'cached' : 'fetched'
		detail = await deps.getNyaaDetail(result.torrentId, deps.processedAtUtc(result.torrentId))
	} catch (error) {
		fail('nyaa', error)
		return finish(result)
	}
	// From the Nyaa "Information" link, or by title in erai-raws' Anime List when the link isn't a series page.
	try {
		result.slug = await deps.resolveSlug(detail)
	} catch (error) {
		fail('erai', error)
		if (error instanceof EraiRawsAuthError) {
			result.fatal = error.message
		}
		return finish(result)
	}
	if (!result.slug) {
		result.steps.erai = result.steps.mal = result.steps.anidb = 'no-link'
		return finish(result)
	}
	const slug = result.slug

	const saved = new Set(await deps.savedSeriesSources(slug))
	try {
		if (saved.has('erai') && saved.has('erai-releases')) {
			result.steps.erai = 'cached'
		} else {
			result.steps.erai = 'fetched'
			await deps.getEraiSeries(slug)
		}
	} catch (error) {
		fail('erai', error)
		if (error instanceof EraiRawsAuthError) {
			result.fatal = error.message
		}
		return finish(result)
	}

	// MAL and AniDB links come from the Erai page: without one, nothing is fetched (and the next run won't wait either).
	const links = (await deps.readEraiSeries(slug))?.links ?? []
	const sourcesToFetch = [
		{ source: 'mal' as const, hasLink: links.some((link) => malAnimeId(link.url)), get: deps.getMalDetails },
		{ source: 'anidb' as const, hasLink: links.some((link) => anidbAnimeId(link.url)), get: deps.getAnidbDetails },
	]
	for (const { source, hasLink, get } of sourcesToFetch) {
		if (saved.has(source)) {
			result.steps[source] = 'cached'
		} else if (!hasLink) {
			result.steps[source] = 'no-link'
		} else if (source === 'anidb' && !options.anidbEnabled) {
			result.steps[source] = 'skipped'
		} else {
			try {
				result.steps[source] = 'fetched'
				await get(slug)
			} catch (error) {
				fail(source, error)
				if (source === 'anidb' && /banned|not configured/i.test(message(error))) {
					options.anidbEnabled = false
				}
			}
		}
	}
	return finish(result)
}

function finish(result: CrawlTargetResult): CrawlTargetResult {
	result.usedNetwork = Object.values(result.steps).some((step) => step === 'fetched' || step === 'error')
	return result
}

export function createCrawlerStatus(): DetailsCrawlerStatus {
	const counts = Object.fromEntries(sources.map((source) => [source, Object.fromEntries(stepResults.map((step) => [step, 0]))])) as DetailsCrawlerStatus['counts']
	return { state: 'idle', total: 0, position: 0, counts, recent: [] }
}

export interface LoopDeps {
	crawl: (target: WatchTarget) => Promise<CrawlTargetResult>
	sleep: (ms: number) => Promise<void>
	now: () => number
}

// Walks the ordered targets, updating `status` as it goes. Stops between targets when status.state is set to
// 'stopping', or when a target reports a fatal error.
export async function runCrawlLoop(status: DetailsCrawlerStatus, targets: CrawlTarget[], deps: LoopDeps): Promise<void> {
	status.total = targets.length
	let nextStartAt = 0
	for (const [index, { target, rootName }] of targets.entries()) {
		const wait = nextStartAt - deps.now()
		if (wait > 0) {
			await deps.sleep(wait)
		}
		if (status.state === 'stopping') {
			status.state = 'stopped'
			status.stopReason = 'Stopped by the user'
			break
		}
		status.position = index + 1
		status.current = { folderName: target.folderName, rootName }
		const startedAt = deps.now()
		const result = await deps.crawl(target).catch((error: unknown): CrawlTargetResult => ({
			steps: { nyaa: 'error', erai: 'skipped', mal: 'skipped', anidb: 'skipped' },
			errors: [message(error)],
			usedNetwork: true,
		}))
		const entry: DetailsCrawlerEntry = {
			folderName: target.folderName,
			rootName,
			torrentId: result.torrentId,
			slug: result.slug,
			steps: result.steps,
			error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
			atUtc: new Date(deps.now()).toISOString(),
		}
		for (const source of sources) {
			status.counts[source][result.steps[source]] += 1
		}
		status.recent = [entry, ...status.recent].slice(0, recentLimit)
		nextStartAt = result.usedNetwork ? startedAt + crawlIntervalMs : 0
		if (result.fatal) {
			status.state = 'stopped'
			status.stopReason = result.fatal
			break
		}
	}
	if (status.state === 'running' || status.state === 'stopping') {
		status.state = status.state === 'stopping' ? 'stopped' : 'finished'
		status.stopReason ??= status.state === 'stopped' ? 'Stopped by the user' : undefined
	}
	status.current = undefined
	status.finishedAtUtc = new Date(deps.now()).toISOString()
}

// --- App service: one run at a time, started and stopped by hand; its state lives in memory only. ---

let status = createCrawlerStatus()

const appCrawlDeps: CrawlDeps = {
	listFiles: (target) => listWatchTargetFiles(target, decisionsState),
	findIndexedNyaaId: (filePath) => findIndexedTorrentByPath(getQbittorrentIndex(), filePath)?.nyaaTorrentId,
	findFolderTorrents: (target) => findTargetTorrents(target, { sent: qbittorrentAddResponsesState, indexed: getQbittorrentIndex().torrents.values(), decisions: decisionsState }),
	processedAtUtc: (torrentId) => decisionsState.find((decision) => decision.torrentId === torrentId)?.createdAtUtc,
	hasNyaaDetail: async (torrentId) => Boolean(await findNyaaDetailFile(torrentId)),
	getNyaaDetail: (torrentId, processedAtUtc) => getNyaaDetail(torrentId, { processedAtUtc }),
	resolveSlug: (detail) => resolveEraiSeriesSlug(detail),
	savedSeriesSources: (slug) => listSavedSeriesSources(slug, ['erai', 'erai-releases', 'mal', 'anidb'] as const),
	readEraiSeries: (slug) => readSeriesJson<EraiRawsSeries>(slug, 'erai'),
	getEraiSeries: (slug) => getEraiSeries(slug),
	getMalDetails: (slug) => getMalDetails(slug),
	getAnidbDetails: (slug) => getAnidbDetails(slug),
}

export function getDetailsCrawlerStatus(): DetailsCrawlerStatus {
	return status
}

export async function startDetailsCrawler(): Promise<DetailsCrawlerStatus> {
	if (status.state === 'running' || status.state === 'stopping') {
		return status
	}
	const options = { anidbEnabled: (await getAnidbClientStatus()).configured }
	const run = createCrawlerStatus()
	run.state = 'running'
	run.startedAtUtc = new Date().toISOString()
	status = run
	void runCrawlLoop(run, orderCrawlTargets(watchTargetsState, watchRootsState), {
		crawl: (target) => crawlTarget(target, appCrawlDeps, options),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		now: () => Date.now(),
	}).catch((error: unknown) => {
		run.state = 'stopped'
		run.stopReason = message(error)
	})
	return status
}

export function stopDetailsCrawler(): DetailsCrawlerStatus {
	if (status.state === 'running') {
		status.state = 'stopping'
	}
	return status
}
