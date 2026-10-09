import type { MalReview } from '../../shared/types'

// MAL's three review verdicts: each gets one reserved slot in the initially visible list.
const verdicts = ['Recommended', 'Mixed Feelings', 'Not Recommended']

export function sortByReactions(reviews: readonly MalReview[]): MalReview[] {
	return [...reviews].sort((a, b) => (b.reactions ?? 0) - (a.reactions ?? 0))
}

// The most-reacted review of each verdict; slots a verdict can't fill go to the next most-reacted reviews.
// Returned in reactions order, like the full list.
export function featuredReviews(reviews: readonly MalReview[], slots = verdicts.length): MalReview[] {
	const sorted = sortByReactions(reviews)
	const picked = new Set<MalReview>()
	for (const verdict of verdicts) {
		const top = sorted.find((review) => review.verdict === verdict)
		if (top && picked.size < slots) {
			picked.add(top)
		}
	}
	for (const review of sorted) {
		if (picked.size >= slots) {
			break
		}
		picked.add(review)
	}
	return sorted.filter((review) => picked.has(review))
}
