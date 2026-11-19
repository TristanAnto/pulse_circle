const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

// CSRF cookie name must match the backend configuration
// (server/src/config/env.ts -> COOKIE_CSRF_NAME, default 'pulse_csrf').
const CSRF_COOKIE_NAME = 'pulse_csrf'

export type ApiError = Error & {
  status?: number
  body?: unknown
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${escapedName}=([^;]*)`)
  )
  return match ? match[1] : undefined
}

async function parseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      return await res.json()
    } catch {
      // Invalid JSON despite the content type header. Return null so the
      // caller can still derive a readable error from the response status.
      return null
    }
  }
  return res.text()
}

function handleResponse(res: Response): unknown {
  const isOk = res.ok
  return parseBody(res).then((body) => {
    if (isOk) {
      return body
    }
    const errorBody = body as { error?: string } | undefined
    const message =
      errorBody?.error ?? `Request failed with status ${res.status}`
    const err = new Error(message) as ApiError
    err.status = res.status
    err.body = body
    throw err
  })
}

function buildHeaders(
  init: RequestInit,
  isStateChanging: boolean
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (init.headers) {
    if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value
      }
    } else {
      for (const [key, value] of Object.entries(init.headers)) {
        headers[key] = String(value)
      }
    }
  }
  if (isStateChanging) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME)
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
  }
  return headers
}

export async function apiRequest(
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const url = `${API_BASE_URL}${path}`
  const method = (init.method ?? 'GET').toUpperCase()
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init, isStateChanging),
  })

  return handleResponse(res)
}

export const api = {
  get: (path: string) => apiRequest(path, { method: 'GET' }),
  post: (path: string, body?: unknown) =>
    apiRequest(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: (path: string, body?: unknown) =>
    apiRequest(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: (path: string, body?: unknown) =>
    apiRequest(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: (path: string) => apiRequest(path, { method: 'DELETE' }),
}
