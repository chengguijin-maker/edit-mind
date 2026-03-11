import { chmod } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { logger } from '@shared/services/logger'
import { FFmpegError } from '@media-utils/types/video'
import { FFMPEG_PATH, FFPROBE_PATH } from '@media-utils/constants'

const validatedBinaries = new Set<string>()
const chmodWarnings = new Set<string>()

const ensureBinaryPermissions = async (binaryPath: string): Promise<void> => {
  try {
    if (!existsSync(binaryPath)) return

    const stat = statSync(binaryPath)

    // Skip chmod when the binary is already executable.
    if ((stat.mode & 0o111) !== 0) return

    await chmod(binaryPath, 0o755)
  } catch (error) {
    if (!chmodWarnings.has(binaryPath)) {
      chmodWarnings.add(binaryPath)
      logger.warn(`Failed to set permissions for ${binaryPath}:` + error)
    }
  }
}

const validateBinary = async (binaryPath: string, name: string): Promise<void> => {
  if (validatedBinaries.has(binaryPath)) return

  await ensureBinaryPermissions(binaryPath)

  if (!existsSync(binaryPath)) {
    throw new Error(`${name} binary not found at path: ${binaryPath}`)
  }

  validatedBinaries.add(binaryPath)
}

export const validateBinaries = async (): Promise<void> => {
  await Promise.all([validateBinary(FFMPEG_PATH, 'FFmpeg'), validateBinary(FFPROBE_PATH, 'FFprobe')])
}

export const spawnFFmpeg = async (args: string[]): Promise<ChildProcess> => {
  await validateBinary(FFMPEG_PATH, 'FFmpeg')
  return spawn(FFMPEG_PATH, args)
}

export const spawnFFprobe = async (args: string[]): Promise<ChildProcess> => {
  await validateBinary(FFPROBE_PATH, 'FFprobe')
  return spawn(FFPROBE_PATH, args)
}
export const handleFFmpegProcess = (process: ChildProcess, operationName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    let errorOutput = ''

    process.stderr?.on('data', (data) => {
      errorOutput += data.toString()
    })

    process.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        const error: FFmpegError = new Error(
          `FFmpeg ${operationName} failed with code ${code}: ${errorOutput.trim() || 'Unknown error'}`
        )
        error.code = code ?? undefined
        error.stderr = errorOutput
        reject(error)
      }
    })

    process.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg for ${operationName}: ${err.message}`))
    })
  })
}
