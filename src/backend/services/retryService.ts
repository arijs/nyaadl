export interface RetryOptions {
	attempts?: number
	baseDelayMs?: number
}

function isRetryableError(error: unknown): boolean {
	if (error instanceof Error) {
		return /fetch|network|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(error.message)
	}
	return false
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const attempts = Math.max(1, options.attempts ?? 3)
	const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250)
	let lastError: unknown

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await operation()
		} catch (error) {
			lastError = error
			if (attempt >= attempts || !isRetryableError(error)) {
				break
			}
			const delayMs = baseDelayMs * attempt
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Operation failed after retries')
}