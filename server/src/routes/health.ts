import { Router } from 'express'

import { prisma } from '../lib/prisma'

export const router = Router()

/**
 * GET /api/health
 * Simple service health response. No system information is exposed.
 */
router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'pulse-circle-api' })
})

/**
 * GET /api/health/db
 * Verifies database connectivity. Returns a safe status without exposing
 * connection strings, credentials, or server internals.
 */
router.get('/db', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    res.json({ status: 'connected' })
  } catch {
    res.status(503).json({ status: 'unavailable', error: 'database unreachable' })
  }
})
