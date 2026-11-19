import { env } from './config/env'
import { app } from './app'
import { prisma } from './lib/prisma'

const port = env.port

const server = app.listen(port, () => {
  console.log(
    `Pulse Circle API listening on port ${port} (${env.nodeEnv})`,
  )
})

let shuttingDown = false

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  console.log(`${signal} received: shutting down Pulse Circle API`)
  server.close(async () => {
    console.log('HTTP server closed')
    try {
      await prisma.$disconnect()
      console.log('Prisma client disconnected')
    } catch (err) {
      console.error('Error disconnecting Prisma:', err)
    }
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
