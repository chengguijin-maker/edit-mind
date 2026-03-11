import type { Metadata, QueryResult } from 'chromadb'
import type { Scene } from '@shared/schemas'
import { metadataToScene } from '@vector/utils/shared'

export function collectScenesFromQuery(
  vectorQuery: QueryResult<Metadata>,
  scenesIds: Set<string>,
  finalScenes: Scene[]
) {
  for (let queryIndex = 0; queryIndex < vectorQuery.metadatas.length; queryIndex++) {
    const queryMetadatas = vectorQuery.metadatas[queryIndex] || []
    const queryIds = vectorQuery.ids[queryIndex] || []
    const queryDocuments = vectorQuery.documents?.[queryIndex] || []

    for (let resultIndex = 0; resultIndex < queryMetadatas.length; resultIndex++) {
      const metadata = queryMetadatas[resultIndex]
      const id = queryIds[resultIndex]
      const text = queryDocuments[resultIndex]

      if (!metadata || !id || !text) continue

      const scene = metadataToScene(metadata, id, text)
      if (scenesIds.has(scene.id)) continue

      scenesIds.add(scene.id)
      finalScenes.push(scene)
    }
  }
}
