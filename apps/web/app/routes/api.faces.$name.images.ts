import { logger } from '@shared/services/logger'
import { getImagesByPersonName } from '@shared/utils/faces'
import type { LoaderFunctionArgs } from 'react-router'
import { requireUserId } from '~/services/user.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
  await requireUserId(request)
  const { name } = params

  try {
    if (name) {
      const images = await getImagesByPersonName(name)

      return {
        images,
        name,
      }
    }
    throw new Error('Face images not found')
  } catch (error) {
    logger.error(error)
    return {
      images: [],
      name,
    }
  }
}
