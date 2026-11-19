import express, { Application } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { env } from './config/env'
import { router as healthRouter } from './routes/health'
import { router as authRouter } from './routes/auth'
import { notFound } from './middleware/notFound'
import { errorHandler } from './middleware/errorHandler'

export const app: Application = express()

app.use(express.json())
app.use(cookieParser())
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
)

app.use('/api/auth', authRouter)
app.use('/api/health', healthRouter)

app.use(notFound)
app.use(errorHandler)
