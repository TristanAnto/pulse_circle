import { randomBytes } from 'crypto'

import { prisma } from './prisma'

export function createSyncLeaseOwnerToken(): string {
  return randomBytes(16).toString('hex')
}

export async function acquireCircleNexconnSyncLease(
  circleId: string,
  ownerToken: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await prisma.$executeRawUnsafe<number>(
    `UPDATE "CircleNexconnChannel"
     SET "syncLockOwner" = $1,
         "syncLockExpiresAt" = clock_timestamp() + ($2::bigint * interval '1 millisecond'),
         "updatedAt" = clock_timestamp()
     WHERE "circleId" = $3
       AND ("syncLockExpiresAt" IS NULL OR "syncLockExpiresAt" <= clock_timestamp())`,
    ownerToken, ttlMs, circleId
  )
  return result === 1
}

export async function renewCircleNexconnSyncLease(
  circleId: string,
  ownerToken: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await prisma.$executeRawUnsafe<number>(
    `UPDATE "CircleNexconnChannel"
     SET "syncLockExpiresAt" = clock_timestamp() + ($2::bigint * interval '1 millisecond'),
         "updatedAt" = clock_timestamp()
     WHERE "circleId" = $1
       AND "syncLockOwner" = $3
       AND "syncLockExpiresAt" > clock_timestamp()`,
    circleId, ttlMs, ownerToken
  )
  return result === 1
}

export async function assertCircleNexconnSyncLeaseHeld(
  circleId: string,
  ownerToken: string,
): Promise<void> {
  const result = await prisma.$queryRawUnsafe<{ syncLockOwner: string | null }[]>(
    `SELECT "syncLockOwner"
     FROM "CircleNexconnChannel"
     WHERE "circleId" = $1
       AND "syncLockOwner" = $2
       AND "syncLockExpiresAt" > clock_timestamp()`,
    circleId, ownerToken
  )
  if (result.length !== 1) {
    throw new Error('CircleNexconn sync lease is not held or has expired')
  }
}

export async function releaseCircleNexconnSyncLease(
  circleId: string,
  ownerToken: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "CircleNexconnChannel"
     SET "syncLockOwner" = NULL,
         "syncLockExpiresAt" = NULL,
         "updatedAt" = clock_timestamp()
     WHERE "circleId" = $1
       AND "syncLockOwner" = $2`,
    circleId, ownerToken
  )
}
