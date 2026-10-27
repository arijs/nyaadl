// Parses torrent titles of the release groups seen so far outside Erai-raws: English and romaji
// titles, season/episode, episode name and the release tags (source, codecs, audio, subtitles...).
// ponytail: one regex per group, written against titles already met; a new group or a new layout
// of a known group returns undefined and falls back to the generic normalization.

export interface ReleaseTags {
	source?: string
	sourceType?: string
	videoCodec?: string
	bitDepth?: string
	audioCodec?: string
	audioLanguages?: string
	subtitles?: string
	censorship?: string
	repack?: string
}

export type ReleaseTagKey = keyof ReleaseTags

export interface ParsedRelease {
	group: string
	englishTitle?: string
	romajiTitle?: string
	season?: number
	episode?: string
	version?: string
	episodeTitle?: string
	batch: boolean
	resolution?: string
	crc32?: string
	tags: ReleaseTags
}

export const releaseTagLabels: Record<ReleaseTagKey, string> = {
	source: 'Fonte',
	sourceType: 'Tipo',
	videoCodec: 'Vídeo',
	bitDepth: 'Bits',
	audioCodec: 'Áudio',
	audioLanguages: 'Idiomas',
	subtitles: 'Legendas',
	censorship: 'Censura',
	repack: 'Repack',
}

// Release groups whose titles carry their own series title; folders named "[Group] Title [...]".
export const parsedReleaseGroups = ['ToonsHub', 'VARYG', 'denisplay', 'hisako', 'Judas', 'Doomdos', 'Yameii', 'AnoZu', 'SubsPlease'] as const

const tagMatchers: Array<[ReleaseTagKey, string, RegExp]> = [
	['source', 'bili', /\bBILI(?:BILI)?(?:\s+INTERNATIONAL)?\b/i],
	['source', 'iqiyi', /\bIQ(?:IYI)?\b/i],
	['source', 'adn', /\bADN\b/i],
	['source', 'amzn', /\bAMZN\b/i],
	['source', 'liv', /\bLIV\b/i],
	['source', 'unext', /\bU-?NEXT\b/i],
	['source', 'cr', /\bCR\b/i],
	['source', 'ov', /\bOV\b/i],
	['sourceType', 'web-dl', /\bWEB-?DL\b/i],
	['sourceType', 'bd', /\b(?:BD|BluRay)\b/i],
	['videoCodec', 'av1', /\bAV1\b/i],
	['videoCodec', 'h265', /\b(?:H[ .]?265|HEVC|x265)\b/i],
	['videoCodec', 'h264', /\b(?:H[ .]?264|x264|AVC)\b/i],
	['bitDepth', '10bit', /\b10[- ]?bit\b/i],
	['audioCodec', 'ddp2.0', /\bDDP\s?2\.0\b/i],
	['audioCodec', 'aac2.0', /\bAAC\s?2\.0\b/i],
	['audioCodec', 'aac', /\bAAC\b/i],
	['audioCodec', 'flac', /\bFLAC/i],
	['audioLanguages', 'english-dub', /\bEnglish\s+Dub\b/i],
	['audioLanguages', 'dual', /\bDual(?:[- ]Audio)?\b(?!-Subs?)/i],
	['audioLanguages', 'multi', /\bMulti-Audio\b|\bMULTi\b(?!-)/i],
	['subtitles', 'multi', /\bMulti-?Subs?\b|\bMSubs\b/i],
	['subtitles', 'english', /\bEnglish-Sub\b|\bESub\b/i],
	['censorship', 'uncensored', /\bUncensored\b/i],
	['censorship', 'censored', /\bCensored\b/i],
	['repack', 'repack', /\bREPACK\b/i],
]

// First matching value per tag key wins (more specific patterns are listed first).
export function parseReleaseTags(text: string): ReleaseTags {
	const tags: ReleaseTags = {}
	for (const [key, value, pattern] of tagMatchers) {
		if (tags[key] === undefined && pattern.test(text)) {
			tags[key] = value
		}
	}
	return tags
}

interface GroupMatch {
	group: string
	english?: string
	romaji?: string
	season?: string
	episode?: string
	episodeTitle?: string
	batch?: boolean
	// Everything that is not a title: scanned for tags, version, CRC32 and resolution.
	meta: string
}

type GroupParser = (title: string) => GroupMatch | undefined

const seasonEpisode = 'S(?<season>\\d{1,2})(?:E(?<episode>\\d{1,4}))?'

const groupParsers: GroupParser[] = [
	// [ToonsHub] <EN> S01E03 REPACK 1080p UNCENSORED ADN WEB-DL AAC2.0 H.264 (<ROMAJI>, Multi-Subs) [BATCH]
	(title) => {
		const m = new RegExp(`^\\[ToonsHub\\]\\s*(?<english>.+?)\\s+${seasonEpisode}\\b(?<meta1>.*?)\\((?<romaji>[^,()]+)(?<meta2>[^)]*)\\)(?<meta3>.*)$`, 'i').exec(title)
		return m?.groups && { group: 'ToonsHub', ...m.groups, meta: `${m.groups.meta1} ${m.groups.meta2} ${m.groups.meta3}` }
	},
	// <EN> S02E07 <episode title> 1080p CR WEB-DL DUAL AAC2.0 H.264-VARYG (<ROMAJI> 2nd Season, Dual-Audio, Multi-Subs)
	(title) => {
		const m = new RegExp(`^(?<english>.+?)\\s+${seasonEpisode}\\b\\s*(?<episodeTitle>.*?)\\s*(?<meta1>\\b\\d{3,4}p\\b.*?)-VARYG\\s*(?:\\((?<romaji>[^,()]+)(?<meta2>[^)]*)\\))?\\s*$`, 'i').exec(title)
		return m?.groups && { group: 'VARYG', ...m.groups, meta: `${m.groups.meta1} ${m.groups.meta2 ?? ''}` }
	},
	// [denisplay] <ROMAJI> - 04 [1080p] [AV1] (<EN>) (Uncensored) V2   /   [hisako] <ROMAJI> - 01 [1080p] WEB-DL (<EN>) (Uncensored)
	(title) => {
		const m = /^\[(?<group>denisplay|hisako)\]\s*(?<romaji>.+?)\s+-\s+(?<episode>\d{1,4})\s*(?<meta1>[^(]*)\((?<english>[^)]+)\)(?<meta2>.*)$/i.exec(title)
		return m?.groups && { ...m.groups, group: m.groups.group!.toLowerCase(), meta: `${m.groups.meta1} ${m.groups.meta2}` }
	},
	// [Judas] <ROMAJI> {<EN>) [Uncensored] - S01E04 [1080p][HEVC x265 10bit][Multi-Subs] (Weekly)
	(title) => {
		const m = new RegExp(`^\\[Judas\\]\\s*(?<romaji>.+?)\\s*\\{(?<english>[^)}]+)[)}](?<meta1>.*?)-\\s*${seasonEpisode}\\b(?<meta2>.*)$`, 'i').exec(title)
		return m?.groups && { group: 'Judas', ...m.groups, meta: `${m.groups.meta1} ${m.groups.meta2}` }
	},
	// [Doomdos] - <ROMAJI> - S01E04 [Uncensored] [1080p OV WEB-DL] [<EN>!]
	(title) => {
		const m = new RegExp(`^\\[Doomdos\\]\\s*-\\s*(?<romaji>.+?)\\s+-\\s+${seasonEpisode}\\b(?<meta1>.*)\\[(?<english>[^\\]]+)\\]\\s*$`, 'i').exec(title)
		return m?.groups && { group: 'Doomdos', ...m.groups, meta: m.groups.meta1! }
	},
	// [Yameii] <EN> - S02E08 [English Dub] [CR WEB-DL 1080p H264 AAC] [75BB90C4] (<ROMAJI> 2 - Season 2 - S2)
	(title) => {
		const m = new RegExp(`^\\[Yameii\\]\\s*(?<english>.+?)\\s+-\\s+${seasonEpisode}\\b(?<meta1>.*?)\\((?<romaji>[^)]+)\\)\\s*$`, 'i').exec(title)
		return m?.groups && { group: 'Yameii', ...m.groups, meta: m.groups.meta1! }
	},
	// [AnoZu] <EN> S02E08 1080p CR WEB-DL Dual-Audio DDP 2.0 H.264 - <ROMAJI> 2
	(title) => {
		const m = new RegExp(`^\\[AnoZu\\]\\s*(?<english>.+?)\\s+${seasonEpisode}\\b(?<meta1>.*?)\\s+-\\s+(?<romaji>.+?)\\s*$`, 'i').exec(title)
		return m?.groups && { group: 'AnoZu', ...m.groups, meta: m.groups.meta1! }
	},
	// [SubsPlease] <ROMAJI> S2 - 12 (1080p) [1C882FDF]   /   [SubsPlease] <ROMAJI> S2 (01-12) (1080p) [Batch]
	(title) => {
		const m = /^\[SubsPlease\]\s*(?<romaji>.+?)(?:\s+S(?<season>\d{1,2}))?\s+(?:-\s+(?<episode>\d{1,4}(?:v\d+)?)|\((?<range>\d+-\d+)\))(?<meta1>.*)$/i.exec(title)
		return m?.groups && { group: 'SubsPlease', ...m.groups, batch: m.groups.range !== undefined, meta: m.groups.meta1! }
	},
	// [Erai-raws] <title> - 03 [1080p CR WEB-DL AVC AAC][MultiSub][HASH]: only the tags, the series identity stays the Erai one.
	(title) => {
		const m = /^\[Erai-raws\][^[]*(?<meta1>\[.*)$/i.exec(title)
		return m?.groups && { group: 'Erai-raws', meta: m.groups.meta1! }
	},
]

const reExtension = /\.(?:mkv|mp4|avi)$/i
const reResolution = /\b(\d{3,4}p)\b/i
const reCrc32 = /\[([A-F0-9]{8})\]/i
const reVersion = /(?:^|\s|\d)(v\d)\b/i

// "Keikaku- restart" (a colon written as a hyphen) and "Keikaku restart" are the same title.
function cleanTitle(title: string | undefined): string | undefined {
	return title?.trim().replace(/(\w)-\s+/g, '$1 ') || undefined
}

// "Name 2nd Season", "Name 2 - Season 2 - S2", "Name 2": the season is kept apart, not in the title.
function stripSeasonMarker(title: string, season: number | undefined): string {
	if (!season || season < 2) {
		return title
	}
	return title
		.replace(new RegExp(`\\s+${season}(?:st|nd|rd|th)\\s+Season$`, 'i'), '')
		.replace(new RegExp(`\\s+${season}\\s+-\\s+Season\\s+${season}\\s+-\\s+S${season}$`, 'i'), '')
		.replace(new RegExp(`\\s+${season}$`), '')
		.trim()
}

export function parseReleaseTitle(rawTitle: string): ParsedRelease | undefined {
	const title = rawTitle.trim().replace(reExtension, '')
	for (const parser of groupParsers) {
		const match = parser(title)
		if (!match) {
			continue
		}
		const season = match.season ? Number(match.season) : undefined
		return {
			group: match.group,
			englishTitle: cleanTitle(match.english),
			romajiTitle: cleanTitle(match.romaji && stripSeasonMarker(match.romaji.trim(), season)),
			season,
			episode: match.episode,
			version: reVersion.exec(match.meta)?.[1]?.toLowerCase(),
			episodeTitle: match.episodeTitle?.trim() || undefined,
			batch: match.batch ?? (match.group !== 'Erai-raws' && !match.episode),
			resolution: reResolution.exec(title)?.[1]?.toLowerCase(),
			crc32: reCrc32.exec(match.meta)?.[1]?.toUpperCase(),
			tags: parseReleaseTags(match.meta),
		}
	}
	return undefined
}

// Title used in series keys and folder names: "Name" for season 1, "Name S02" from season 2 on.
export function releaseIdentityTitle(parsed: ParsedRelease, which: 'english' | 'romaji'): string | undefined {
	const title = which === 'english' ? parsed.englishTitle : parsed.romajiTitle
	if (!title) {
		return undefined
	}
	return parsed.season && parsed.season > 1 ? `${title} S${String(parsed.season).padStart(2, '0')}` : title
}
