import { env } from './config/env'
import { app } from './app'

const port = env.port

const server = app.listen(port, () => {
  console.log(
    `Pulse Circle API listening on port ${port} (${env.nodeEnv})`,
  )
})

const shutdown = (signal: string) => {
  console.log(`${signal} received: shutting down Pulse Circle API`)
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
