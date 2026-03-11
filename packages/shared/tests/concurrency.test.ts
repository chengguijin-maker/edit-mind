import { describe, expect, it } from 'vitest'

import { mapWithConcurrencyLimit } from '../src/utils/concurrency'

describe('mapWithConcurrencyLimit', () => {
  it('preserves result order while limiting concurrency', async () => {
    let activeWorkers = 0
    let maxActiveWorkers = 0

    const values = [30, 10, 20, 5]
    const results = await mapWithConcurrencyLimit(values, 2, async (delay, index) => {
      activeWorkers += 1
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers)

      await new Promise((resolve) => setTimeout(resolve, delay))

      activeWorkers -= 1
      return `job-${index}`
    })

    expect(results).toEqual(['job-0', 'job-1', 'job-2', 'job-3'])
    expect(maxActiveWorkers).toBeLessThanOrEqual(2)
  })

  it('falls back to a single worker when concurrency is invalid', async () => {
    const visited: number[] = []

    await mapWithConcurrencyLimit([1, 2, 3], 0, async (value) => {
      visited.push(value)
      return value
    })

    expect(visited).toEqual([1, 2, 3])
  })
})
