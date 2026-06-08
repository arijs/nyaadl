import type { ApiEnvelope, ApiErrorBody } from '../../shared/api'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function buildDetailsSuffix(details: unknown): string {
	if (!isRecord(details)) {
		return ''
	}
	const torrentId = typeof details.torrentId === 'string' ? details.torrentId : undefined
	const title = typeof details.title === 'string' ? details.title : undefined
	const page = typeof details.page === 'number' ? details.page : undefined
	if (!torrentId && !title && page === undefined) {
		return ''
	}
	const parts: string[] = []
	if (torrentId) {
		parts.push(`torrentId=${torrentId}`)
	}
	if (page !== undefined) {
		parts.push(`page=${page}`)
	}
	if (title) {
		parts.push(`title=${title}`)
	}
	return parts.length ? ` (${parts.join(' | ')})` : ''
}

async function readApiError(response: Response): Promise<string> {
	const body = await response.json().catch(() => undefined) as unknown
	if (isRecord(body)) {
		const flatError = typeof body.error === 'string' ? body.error : undefined
		const flatMessage = typeof body.message === 'string' ? body.message : undefined
		const flatStatusText = typeof body.statusText === 'string' ? body.statusText : undefined
		const nestedData = isRecord(body.data) ? body.data : undefined
		const nestedError = typeof nestedData?.error === 'string' ? nestedData.error : undefined
		const nestedMessage = isRecord(body.data) && typeof body.data.message === 'string' ? body.data.message : undefined
		const details = nestedData?.details
		const baseMessage = flatError ?? nestedError ?? flatMessage ?? nestedMessage ?? flatStatusText
		if (baseMessage) {
			return `${baseMessage}${buildDetailsSuffix(details)}`
		}
	}
	return `Request failed: ${response.status}`
}

export async function getJson<T>(url: string): Promise<ApiEnvelope<T>> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(await readApiError(response))
	}
	return response.json() as Promise<ApiEnvelope<T>>
}

export async function postJson<T>(url: string): Promise<ApiEnvelope<T>> {
	const response = await fetch(url, { method: 'POST' })
	if (!response.ok) {
		throw new Error(await readApiError(response))
	}
	return response.json() as Promise<ApiEnvelope<T>>
}

export async function postJsonBody<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
	if (!response.ok) {
		throw new Error(await readApiError(response))
	}
	return response.json() as Promise<ApiEnvelope<T>>
}

export async function requestJson<T>(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<ApiEnvelope<T>> {
	const response = await fetch(url, {
		method,
		headers: body ? { 'content-type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	})
	if (!response.ok) {
		throw new Error(await readApiError(response))
	}
	return response.json() as Promise<ApiEnvelope<T>>
}
