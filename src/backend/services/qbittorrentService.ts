import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { QbittorrentFailureKind, QbittorrentRuntimeConfig } from '@shared/types'

const qbittorrentPasswordPath = path.join(process.cwd(), 'qbittorrent password.txt')

let cachedSidCookie: string | undefined
const qbittorrentRuntimeState: { baseUrl: string; username: string; password?: string } = {
	baseUrl: 'http://localhost:7055',
	username: 'admin',
}

export interface AddTorrentInput {
	torrentFilePath: string
	torrentFilename: string
	savePath: string
}

export interface UpdateQbittorrentConfigInput {
	baseUrl?: string
	username?: string
	password?: string
}

export interface QbittorrentAddResult {
	ok: boolean
	status: number
	statusText: string
	responseText: string
}

export class QbittorrentRequestError extends Error {
	kind: QbittorrentFailureKind
	suggestion?: string
	status?: number
	responseText?: string

	constructor(message: string, kind: QbittorrentFailureKind, suggestion?: string, status?: number, responseText?: string) {
		super(message)
		this.name = 'QbittorrentRequestError'
		this.kind = kind
		this.suggestion = suggestion
		this.status = status
		this.responseText = responseText
	}
}

function normalizeBaseUrl(value: string): string {
	return value.trim().replace(/\/+$/, '')
}

async function resolvePassword(): Promise<string | undefined> {
	if (typeof qbittorrentRuntimeState.password === 'string') {
		return qbittorrentRuntimeState.password || undefined
	}
	const password = await readFile(qbittorrentPasswordPath, 'utf8').then((value) => value.trim()).catch(() => '')
	return password || undefined
}

function classifyNetworkError(error: unknown): QbittorrentRequestError {
	if (error instanceof QbittorrentRequestError) {
		return error
	}
	const cause = error instanceof Error && 'cause' in error ? (error as Error & { cause?: NodeJS.ErrnoException }).cause : undefined
	const code = cause?.code ?? ''
	if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
		return new QbittorrentRequestError('Timed out while contacting qBittorrent. Verify that qBittorrent is running and that the Web UI is reachable at the configured base URL.', 'timeout', 'Check whether qBittorrent is running and confirm the Web UI base URL.')
	}
	if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
		return new QbittorrentRequestError('Could not reach qBittorrent Web UI. Verify that qBittorrent is running and listening on the configured base URL.', 'unreachable', 'Start qBittorrent or update the Web UI base URL.')
	}
	const message = error instanceof Error ? error.message : 'Unexpected qBittorrent request failure'
	return new QbittorrentRequestError(message, 'http')
}

async function buildAddTorrentForm(input: AddTorrentInput): Promise<FormData> {
	const torrentBytes = await readFile(input.torrentFilePath)
	const form = new FormData()
	form.append('fileselect[]', new Blob([torrentBytes], { type: 'application/x-bittorrent' }), input.torrentFilename)
	form.append('autoTMM', 'false')
	form.append('savepath', input.savePath)
	form.append('rename', '')
	form.append('category', '')
	form.append('stopped', 'true')
	form.append('addToTopOfQueue', 'true')
	form.append('stopCondition', 'None')
	form.append('contentLayout', 'Original')
	form.append('dlLimit', 'NaN')
	form.append('upLimit', 'NaN')
	return form
}

async function loadSidCookie(): Promise<string | undefined> {
	if (cachedSidCookie) {
		return cachedSidCookie
	}

	const password = await resolvePassword()
	if (!password) {
		return undefined
	}

	let response: Response
	try {
		response = await fetch(`${qbittorrentRuntimeState.baseUrl}/api/v2/auth/login`, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
			},
			body: new URLSearchParams({
				username: qbittorrentRuntimeState.username,
				password,
			}),
			signal: AbortSignal.timeout(7000),
		})
	} catch (error) {
		throw classifyNetworkError(error)
	}

	if (!response.ok) {
		if (response.status === 401 || response.status === 403) {
			throw new QbittorrentRequestError('qBittorrent rejected the provided username or password.', 'auth', 'Provide valid qBittorrent Web UI credentials and try again.')
		}
		throw new QbittorrentRequestError(`qBittorrent login failed: ${response.status} ${response.statusText}`, 'http')
	}

	const setCookie = response.headers.get('set-cookie') ?? ''
	const sidMatch = /SID=[^;]+/i.exec(setCookie)
	if (sidMatch?.[0]) {
		cachedSidCookie = sidMatch[0]
	}

	return cachedSidCookie
}

async function postTorrentAdd(form: FormData, cookieHeader?: string): Promise<Response> {
	try {
		return await fetch(`${qbittorrentRuntimeState.baseUrl}/api/v2/torrents/add`, {
			method: 'POST',
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			body: form,
			signal: AbortSignal.timeout(7000),
		})
	} catch (error) {
		throw classifyNetworkError(error)
	}
}

export async function addTorrentToQbittorrent(input: AddTorrentInput): Promise<QbittorrentAddResult> {
	let response = await postTorrentAdd(await buildAddTorrentForm(input))

	if (response.status === 401 || response.status === 403) {
		cachedSidCookie = undefined
		const sidCookie = await loadSidCookie().catch((error: unknown) => {
			throw classifyNetworkError(error)
		})
		if (!sidCookie) {
			throw new QbittorrentRequestError('qBittorrent requires authentication before adding torrents.', 'auth', 'Provide qBittorrent Web UI credentials and retry the failed torrent.')
		}
		response = await postTorrentAdd(await buildAddTorrentForm(input), sidCookie)
	}

	if (!response.ok) {
		const responseText = await response.text().catch(() => '')
		if (response.status === 401 || response.status === 403) {
			throw new QbittorrentRequestError('qBittorrent rejected the current session or credentials while adding the torrent.', 'auth', 'Provide valid qBittorrent Web UI credentials and retry the failed torrent.', response.status, responseText)
		}
		throw new QbittorrentRequestError(`qBittorrent add failed: ${response.status} ${response.statusText}${responseText ? ` - ${responseText}` : ''}`, 'http', undefined, response.status, responseText)
	}

	const responseText = await response.text().catch(() => '')
	return {
		ok: true,
		status: response.status,
		statusText: response.statusText,
		responseText,
	}
}

export function getQbittorrentRuntimeConfig(): QbittorrentRuntimeConfig {
	return {
		baseUrl: qbittorrentRuntimeState.baseUrl,
		username: qbittorrentRuntimeState.username,
		hasPassword: Boolean(qbittorrentRuntimeState.password),
	}
}

export function updateQbittorrentRuntimeConfig(input: UpdateQbittorrentConfigInput): QbittorrentRuntimeConfig {
	if (typeof input.baseUrl === 'string' && input.baseUrl.trim()) {
		qbittorrentRuntimeState.baseUrl = normalizeBaseUrl(input.baseUrl)
	}
	if (typeof input.username === 'string' && input.username.trim()) {
		qbittorrentRuntimeState.username = input.username.trim()
	}
	if (typeof input.password === 'string') {
		qbittorrentRuntimeState.password = input.password
	}
	cachedSidCookie = undefined
	return getQbittorrentRuntimeConfig()
}