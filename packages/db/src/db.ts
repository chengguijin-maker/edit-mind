import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __editMindPrisma__: PrismaClient | undefined
}

const prisma = globalThis.__editMindPrisma__ ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__editMindPrisma__ = prisma
}

export default prisma

export { prisma }
