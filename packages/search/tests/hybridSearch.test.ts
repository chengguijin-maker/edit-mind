import { combineAllResults, combineResults } from '@search/services/hybridSearch'

function makeResult(source: string) {
  return {
    source,
    scenes: [],
    sceneCount: 0,
    duration: 0,
    createdAt: 0,
    aspectRatio: '16:9',
    camera: '',
    faces: [],
    emotions: [],
    objects: [],
    shotTypes: [],
  }
}

describe('hybrid search scoring', () => {
  it('marks image + text overlap as hybrid and applies boost', () => {
    const [result] = combineResults([makeResult('video-a')], [makeResult('video-a')], {
      imageWeight: 0.7,
      textWeight: 0.3,
      hasQuery: true,
    })

    expect(result.matchType).toBe('hybrid')
    expect(result.score).toBeCloseTo(1.2)
  })

  it('normalizes audio weight together with image and text in all-results mode', () => {
    const [result] = combineAllResults([makeResult('video-a')], [makeResult('video-a')], [makeResult('video-a')], {
      imageWeight: 1,
      textWeight: 1,
      audioWeight: 1,
      hasQuery: true,
    })

    expect(result.matchType).toBe('hybrid')
    expect(result.imageScore).toBe(1)
    expect(result.textScore).toBe(1)
    expect(result.audioScore).toBe(1)
    expect(result.score).toBeCloseTo(1.2)
  })

  it('returns audio-only matches when only audio results exist', () => {
    const [result] = combineAllResults([], [], [makeResult('video-a')], {
      imageWeight: 1,
      textWeight: 1,
      audioWeight: 1,
      hasQuery: true,
    })

    expect(result.matchType).toBe('audio')
    expect(result.score).toBe(1)
  })
})
