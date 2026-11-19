import express, { Application } from 'express'
import cors from 'cors'
import { env } from './config/env'
import { router as healthRouter } from './routes/health'
import { notFound } from './middleware/notFound'
import { errorHandler } from './middleware/errorHandler'

export const app: Application = express()

app.use(express.json())
app.use(cors({ origin: env.corsOrigin }))

app.use('/api/health', healthRouter)

app.use(notFound)
app.use(errorHandler)
