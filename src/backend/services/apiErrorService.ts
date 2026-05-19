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

export function conflict(message: string, details?: unknown) {
	return createError({
		statusCode: 409,
		statusMessage: message,
		data: { success: false, error: message, details },
	})
}