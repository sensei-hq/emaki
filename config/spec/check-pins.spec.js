import { describe, expect, it } from 'vitest'
import { stalePins } from '../check-pins.mjs'

describe('check-pins', () => {
	it('flags a sibling pinned to another release', () => {
		expect(stalePins({ version: '0.2.0', dependencies: { '@senseihq/emaki': '0.1.0', ramda: '1.0.0' } })).toEqual(['@senseihq/emaki@0.1.0'])
	})
	it('accepts the same release, a caret on it, or a dist-tag', () => {
		expect(stalePins({ version: '0.2.0', dependencies: { '@senseihq/emaki': '0.2.0', '@senseihq/emaki-svelte': '^0.2.0' }, peerDependencies: { '@senseihq/emaki': 'latest' } })).toEqual([])
	})
})
