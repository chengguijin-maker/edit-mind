import type { LoaderFunctionArgs } from 'react-router'
import fs from 'fs'
import path from 'path'
import { FACES_DIR } from '@shared/constants'
import { logger } from '@shared/services/logger'
import { requireUser } from '~/services/user.server'
import { createPathValidator } from '@shared/services/pathValidator'

const pathValidator = createPathValidator(FACES_DIR)

export async function loader({ params, request }: LoaderFunctionArgs) {
  const filePath = params['*']
  if (!filePath) {
    throw new Response('No file path provided', { status: 400 })
  }

  try {
    await requireUser(request)

    const decodedPath = decodeURIComponent(filePath)
    const validation = pathValidator.validatePath(decodedPath)

    if (!validation.isValid) {
      logger.warn(`Path validation failed for faces: ${decodedPath}`)
      throw new Response('Access denied', { status: 403 })
    }

    const fullPath = path.resolve(FACES_DIR, decodedPath.replace(/^[/\\]+/, ''))
    if (!fullPath.startsWith(FACES_DIR)) {
      throw new Response('Access denied', { status: 403 })
    }

    const stats = await fs.promises.stat(fullPath)

    if (!stats.isFile()) {
      throw new Response('Not a file', { status: 400 })
    }

    const contentType = getContentType(fullPath)
    const stream = fs.createReadStream(fullPath)

    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    if (error instanceof Response) throw error
    logger.error(error)
    throw new Response('File not found', { status: 404 })
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  }
  return types[ext] ?? 'application/octet-stream'
}
