// Where the plugin is read from when this module's own location cannot be turned into a file path (a bundle, a
// non-file URL): the repository's packages/emaki-cli/plugin under the current folder.
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:url', async (original) => ({
	...(await original()),
	fileURLToPath: () => { throw new TypeError('not a file URL') }
}))

describe('the plugin folder', () => {
	it('falls back to packages/emaki-cli/plugin under the current folder', async () => {
		const { PLUGIN_DIR } = await import('../src/plugin.js')
		expect(PLUGIN_DIR).toBe(resolve(process.cwd(), 'packages/emaki-cli/plugin'))
	})
})
