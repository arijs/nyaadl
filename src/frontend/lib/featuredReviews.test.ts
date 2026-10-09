import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MalReview } from '../../shared/types'
import { featuredReviews, sortByReactions } from './featuredReviews'

const review = (user: string, verdict: string | undefined, reactions?: number): MalReview => ({ user, verdict, reactions, text: user })
const users = (reviews: MalReview[]) => reviews.map((item) => item.user)

test('sortByReactions puts the most-reacted reviews first', () => {
	assert.deepEqual(users(sortByReactions([review('a', 'Recommended', 2), review('b', 'Recommended'), review('c', 'Recommended', 9)])), ['c', 'a', 'b'])
})

test('featuredReviews keeps one slot per verdict, in reactions order', () => {
	const reviews = [
		review('rec-top', 'Recommended', 50),
		review('rec-2', 'Recommended', 40),
		review('mixed-top', 'Mixed Feelings', 5),
		review('not-top', 'Not Recommended', 30),
		review('not-2', 'Not Recommended', 20),
	]
	assert.deepEqual(users(featuredReviews(reviews)), ['rec-top', 'not-top', 'mixed-top'])
})

test('featuredReviews fills a missing verdict slot with the next most-reacted reviews', () => {
	const reviews = [
		review('rec-top', 'Recommended', 50),
		review('rec-2', 'Recommended', 45),
		review('rec-3', 'Recommended', 1),
		review('not-top', 'Not Recommended', 10),
	]
	// No "Mixed Feelings": its slot goes to rec-2 (more reactions than rec-3).
	assert.deepEqual(users(featuredReviews(reviews)), ['rec-top', 'rec-2', 'not-top'])
})

test('featuredReviews returns everything when there are fewer reviews than slots', () => {
	assert.deepEqual(users(featuredReviews([review('only', undefined, 3), review('two', 'Recommended', 4)])), ['two', 'only'])
	assert.deepEqual(featuredReviews([]), [])
})
