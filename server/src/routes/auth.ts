import { Request, Response, Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'

import { authenticate, csrfProtection, type AuthenticatedRequest } from '../middleware/auth'
import {
  cookieOptions,
  generateCsrfToken,
  hashPassword,
  signToken,
  safeUser,
  verifyPassword,
} from '../lib/auth'
import { prisma } from '../lib/prisma'
import { env } from '../config/env'

const router = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
})

const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1),
})

function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.cookieName, token, cookieOptions())
}

function ensureCsrfCookie(res: Response, req: Request): void {
  if (!req.cookies?.[env.cookieCsrfName]) {
    res.cookie(env.cookieCsrfName, generateCsrfToken(), {
      ...cookieOptions(),
      httpOnly: false,
    })
  }
}

router.post('/register', authLimiter, async (req, res) => {
  const result = registerSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const { fullName, email, password } = result.data
  const normalizedEmail = email.toLowerCase()

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' })
    return
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.user.create({
    data: {
      fullName,
      email: normalizedEmail,
      passwordHash,
    },
    select: { id: true, email: true, fullName: true },
  })

  const token = signToken({ userId: user.id, email: user.email })
  ensureCsrfCookie(res, req)
  setAuthCookie(res, token)

  res.status(201).json({ user: safeUser(user) })
})

router.post('/login', authLimiter, async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const { email, password } = result.data
  const normalizedEmail = email.toLowerCase()

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, fullName: true, passwordHash: true },
  })

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const token = signToken({ userId: user.id, email: user.email })
  ensureCsrfCookie(res, req)
  setAuthCookie(res, token)

  res.json({ user: safeUser(user) })
})

router.post('/logout', authenticate, csrfProtection, (_req, res) => {
  res.clearCookie(env.cookieName, {
    path: '/',
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
  })
  res.clearCookie(env.cookieCsrfName, {
    path: '/',
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
  })
  res.json({ message: 'Logged out' })
})

router.get('/me', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, fullName: true },
  })

  if (!user) {
    res.status(401).json({ error: 'User not found' })
    return
  }

  res.json({ user: safeUser(user) })
})

export { router }
