import path from 'node:path'
import express, { Application } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { env } from './config/env'
import { router as healthRouter } from './routes/health'
import { router as authRouter } from './routes/auth'
import { router as circlesRouter } from './routes/circles'
import { router as invitationsRouter } from './routes/invitations'
import { notFound } from './middleware/notFound'
import { errorHandler } from './middleware/errorHandler'

export const app: Application = express()

// Absolute path to the built frontend (dist/) resolved from the compiled
// backend location (server/dist/). Works whether the app is started from
// the project root or from server/.
const distPath = path.resolve(__dirname, '../../dist')

app.use(express.json())
app.use(cookieParser())
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
)

app.use('/api/auth', authRouter)
app.use('/api/circles', circlesRouter)
app.use('/api/invitations', invitationsRouter)
app.use('/api/health', healthRouter)

// Serve built frontend static assets (index.html, assets, favicon).
app.use(express.static(distPath))

// SPA fallback for client-side routes (non-API GET requests only).
// React Router handles /messages, /dashboard, /accept-invite/:id, etc.
// Direct navigation or refresh on these paths returns index.html so the
// frontend can take over routing. API routes are excluded so unknown
// /api/* endpoints keep returning JSON 404 from the notFound middleware.
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use(notFound)
app.use(errorHandler)
