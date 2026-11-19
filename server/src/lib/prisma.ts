import { PrismaClient } from '@prisma/client'

// Singleton PrismaClient. The globalThis guard prevents duplicate client
// instances (and therefore duplicate connection pools) during tsx watch
// hot-reloads in development.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
