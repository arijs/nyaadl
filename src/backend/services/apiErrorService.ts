import { createError } from 'h3'

export function badRequest(message: string, details?: unknown) {
	return createError({
		statusCode: 400,
		statusMessage: message,
		data: { success: false, error: message, details },
	})
}

export function notFound(message: string, details?: unknown) {
	return createError({
		statusCode: 404,
		statusMessage: message,
		data: { success: false, error: message, details },
	})
}

// A remote site (Nyaa, erai-raws, MAL, AniDB) failed: keep its message visible to the UI instead of a bare 500.
export function upstreamError(error: unknown, statusCode = 502) {
	const message = error instanceof Error ? error.message : String(error)
	return createError({
		statusCode,
		statusMessage: message,
		data: { success: false, error: message },
	})
}

export function conflict(message: string, details?: unknown) {
	return createError({
		statusCode: 409,
		statusMessage: message,
		data: { success: false, error: message, details },
	})
}