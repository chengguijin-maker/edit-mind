import { collectScenesFromQuery } from '@search/utils/query'

describe('collectScenesFromQuery', () => {
  it('collects every result from a query row instead of only the first hit', () => {
    const finalScenes: Array<{ id: string }> = []
    const sceneIds = new Set<string>()

    collectScenesFromQuery(
      {
        metadatas: [[
          { source: 'video-a', startTime: 0, endTime: 1 },
          { source: 'video-b', startTime: 1, endTime: 2 },
        ]],
        ids: [['scene-a', 'scene-b']],
        documents: [['doc-a', 'doc-b']],
      } as never,
      sceneIds,
      finalScenes as never
    )

    expect(finalScenes.map((scene) => scene.id)).toEqual(['scene-a', 'scene-b'])
    expect([...sceneIds]).toEqual(['scene-a', 'scene-b'])
  })

  it('skips duplicates without aborting later valid hits', () => {
    const finalScenes: Array<{ id: string }> = []
    const sceneIds = new Set<string>(['scene-a'])

    collectScenesFromQuery(
      {
        metadatas: [[
          { source: 'video-a', startTime: 0, endTime: 1 },
          { source: 'video-b', startTime: 1, endTime: 2 },
          { source: 'video-c', startTime: 2, endTime: 3 },
        ]],
        ids: [['scene-a', 'scene-b', 'scene-c']],
        documents: [['doc-a', 'doc-b', 'doc-c']],
      } as never,
      sceneIds,
      finalScenes as never
    )

    expect(finalScenes.map((scene) => scene.id)).toEqual(['scene-b', 'scene-c'])
    expect([...sceneIds]).toEqual(['scene-a', 'scene-b', 'scene-c'])
  })
})
