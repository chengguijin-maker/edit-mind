const parsePositiveIntEnv = (key: string, fallback: number): number => {
  const rawValue = process.env[key]

  if (!rawValue) {
    return fallback
  }

  const parsedValue = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

export const EMBEDDING_BATCH_SIZE = parsePositiveIntEnv('TEXT_EMBEDDING_BATCH_SIZE', 10)
export const VISUAL_BATCH_SIZE = parsePositiveIntEnv('VISUAL_EMBEDDING_BATCH_SIZE', 4)
export const AUDIO_BATCH_SIZE = parsePositiveIntEnv('AUDIO_EMBEDDING_BATCH_SIZE', 4)
export const VISUAL_BATCH_CONCURRENCY = parsePositiveIntEnv('VISUAL_EMBEDDING_BATCH_CONCURRENCY', 2)
export const AUDIO_BATCH_CONCURRENCY = parsePositiveIntEnv('AUDIO_EMBEDDING_BATCH_CONCURRENCY', 2)
export const VISUAL_FRAMES_PER_SCENE = parsePositiveIntEnv('VISUAL_EMBEDDING_FRAMES_PER_SCENE', 3)
export const AUDIO_EMBEDDING_WORKER_CONCURRENCY = parsePositiveIntEnv('AUDIO_EMBEDDING_WORKER_CONCURRENCY', 2)
export const VISUAL_EMBEDDING_WORKER_CONCURRENCY = parsePositiveIntEnv('VISUAL_EMBEDDING_WORKER_CONCURRENCY', 2)

export const MODEL_CACHE_DIR = process.env.XENOVA_MODEL_CACHE_DIR || '/ml-models/embedding-models';
export const AUDIO_EMBEDDING_MODEL = 'Xenova/clap-htsat-unfused';
export const VISUAL_EMBEDDING_MODEL = 'Xenova/clip-vit-base-patch32';
export const TEXT_EMBEDDING_MODEL = 'Xenova/all-mpnet-base-v2';

export const EMBEDDING_TIMEOUT = 60000
export const MODEL_DIMENSIONS = {
  text: 768, // all-mpnet-base-v2
  visual: 512, // clip-vit-base-patch32
  audio: 512, // clap-htsat-unfused
}


export const AUDIO_EMBEDDINGS_DISABLED = process.env.DISABLE_AUDIO_EMBEDDINGS === 'true'
export const VISUAL_EMBEDDINGS_DISABLED = process.env.DISABLE_VISUAL_EMBEDDINGS === 'true'
