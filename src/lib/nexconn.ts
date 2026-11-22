import { NCEngine, MessageHandler } from '@nexconn/chat'

import { api } from '@/lib/api'

const APP_KEY = import.meta.env.VITE_NEXCONN_APP_KEY ?? ''
const HANDLER_ID = 'pulse-circle-messages'

let initialized = false
let connected = false
let connectionPromise: Promise<{ connected: boolean; error?: string }> | null = null
let handlerRegistered = false
let disconnectRequested = false
const connectionListeners = new Set<(connected: boolean) => void>()

function notifyConnectionListeners(connectedState: boolean): void {
  // Snapshot so a listener that unsubscribes during notification cannot
  // mutate the Set we are iterating over.
  const listeners = Array.from(connectionListeners)
  for (let i = 0; i < listeners.length; i++) {
    try {
      listeners[i](connectedState)
    } catch {
      // Isolate listener failures: one bad listener must not break the
      // connection/disconnect flow or interrupt notifications to others.
    }
  }
}

export function initNexconn(): void {
  if (initialized) return
  if (!APP_KEY) {
    console.warn('VITE_NEXCONN_APP_KEY not configured — Nexconn chat disabled')
    return
  }
  NCEngine.initialize({ appKey: APP_KEY })
  initialized = true
}

export function connectNexconn(): Promise<{ connected: boolean; error?: string }> {
  if (connected) {
    return Promise.resolve({ connected: true })
  }
  if (connectionPromise) {
    return connectionPromise
  }
const promise = (async () => {
    disconnectRequested = false
    if (!initialized) {
      initNexconn()
    }
    if (!initialized) {
      return { connected: false, error: 'Nexconn not configured' }
    }
    try {
      const data = (await api.post('/api/auth/nexconn-token')) as {
        nexconnUserId: string
        accessToken: string
      }

      if (typeof data.accessToken !== 'string' || data.accessToken.length === 0) {
        return { connected: false, error: 'Invalid token received from server' }
      }
      if (typeof data.nexconnUserId !== 'string' || data.nexconnUserId.length === 0) {
        return { connected: false, error: 'Invalid user ID received from server' }
      }

      const result = await NCEngine.connect({ token: data.accessToken })
      if (!result.isOk) {
        return { connected: false, error: 'Connection failed' }
      }

      // Validate SDK identity against backend's nexconnUserId
      if (!result.data?.userId || result.data.userId !== data.nexconnUserId) {
        try {
          await NCEngine.disconnect()
        } catch {
          // ignore
        }
        return { connected: false, error: 'Identity mismatch' }
      }

      // A disconnect requested while connecting must not leave us connected
      if (disconnectRequested) {
        try {
          await NCEngine.disconnect()
        } catch {
          // ignore
        }
        return { connected: false, error: 'Disconnect requested during connection' }
      }

      connected = true
      notifyConnectionListeners(true)
      return { connected: true }
    } catch {
      return { connected: false, error: 'Unable to connect to chat service' }
    }
  })()
  connectionPromise = promise

  // Rejection-safe cleanup: only clear the shared promise if it is still this one
  promise.then(
    () => {
      if (connectionPromise === promise) connectionPromise = null
    },
    () => {
      if (connectionPromise === promise) connectionPromise = null
    }
  )

  return promise
}

export async function disconnectNexconn(): Promise<void> {
  // Signal any in-flight connection to abort, then wait for it to settle
  disconnectRequested = true
  const inflight = connectionPromise
  if (inflight) {
    await inflight
  }
  if (!connected) return
  let disconnectOk = true
  try {
    await NCEngine.disconnect()
  } catch {
    disconnectOk = false
  }
  // Only mark disconnected if the disconnect call succeeded
  if (disconnectOk) {
    connected = false
    handlerRegistered = false
    notifyConnectionListeners(false)
  }
  // If disconnect failed, keep connected=true so state is not corrupted
  disconnectRequested = false
}

export function addMessageHandler(handler: MessageHandler): void {
  if (!connected) {
    console.warn('Cannot add message handler: not connected')
    return
  }
  if (handlerRegistered) {
    return
  }
  NCEngine.addMessageHandler(HANDLER_ID, handler)
  handlerRegistered = true
}

export function removeMessageHandler(): void {
  try {
    NCEngine.removeMessageHandler(HANDLER_ID)
  } catch {
    // Ignore remove errors
  }
  handlerRegistered = false
}

export function isNexconnConnected(): boolean {
  return connected
}

export function isNexconnInitialized(): boolean {
  return initialized
}

/**
 * Subscribe to connection-state changes.
 *
 * The new listener is invoked once, immediately, with the current state so a
 * caller that mounts before the connection settles still receives the
 * transition when it later succeeds or fails. Only the newly added listener
 * is notified here; existing subscribers are unaffected. Returns an
 * unsubscribe function.
 */
export function subscribeNexconnConnection(
  listener: (connected: boolean) => void
): () => void {
  connectionListeners.add(listener)
  try {
    listener(connected)
  } catch {
    // Isolate listener failures: a throwing listener must not break
    // subscription or notifications to other listeners.
  }
  return () => {
    connectionListeners.delete(listener)
  }
}

/**
 * Map a Pulse Circle user ID (UUID) to a Nexconn-compatible user ID.
 *
 * Nexconn user IDs are stored as 32-character hex strings (UUID hyphens
 * stripped). This mirrors server/src/lib/nexconn.ts so the frontend can
 * resolve Nexconn sender IDs back to Pulse Circle member records.
 *
 * The original Pulse Circle UUID in the database is never modified.
 */
export function toNexconnUserId(userId: string): string {
  return userId.replace(/-/g, '')
}
