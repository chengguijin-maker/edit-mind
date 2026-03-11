import { logger } from '@shared/services/logger'
import { audioEmbeddingWorker } from '../jobs/audioEmbedding'
import { chatWorker } from '../jobs/chat'
import { exportWorker } from '../jobs/export'
import { faceDeletionWorker } from '../jobs/faceDeletion'
import { faceLabellingWorker } from '../jobs/faceLabelling'
import { faceRenamingWorker } from '../jobs/faceRenaming'
import { frameAnalysisWorker } from '../jobs/frameAnalysis'
import { sceneCreationWorker, flowProducer } from '../jobs/sceneCreation'
import { smartCollectionWorker } from '../jobs/smartCollection'
import { textEmbeddingWorker } from '../jobs/textEmbedding'
import { audioTranscriptionWorker } from '../jobs/transcription'
import { videoFinalizationWorker } from '../jobs/videoFinalization'
import { videoStitcherWorker } from '../jobs/videoStitcher'
import { visualEmbeddingWorker } from '../jobs/visualEmbedding'
import { ImmichImporter } from '../jobs/ImmichImporter'

export async function shutdownWorkers() {
    try {
        logger.debug('Shutting down workers...')

        await Promise.all([
            frameAnalysisWorker.close(),
            audioTranscriptionWorker.close(),
            audioEmbeddingWorker.close(),
            visualEmbeddingWorker.close(),
            textEmbeddingWorker.close(),
            faceDeletionWorker.close(),
            faceLabellingWorker.close(),
            faceRenamingWorker.close(),
            smartCollectionWorker.close(),
            exportWorker.close(),
            videoStitcherWorker.close(),
            chatWorker.close(),
            sceneCreationWorker.close(),
            videoFinalizationWorker.close(),
            ImmichImporter.close(),
            flowProducer.close(),
        ])

        logger.info('All workers closed successfully')
    } catch (error) {
        logger.error({ error })
    } finally {
        process.exit(0)
    }
}
