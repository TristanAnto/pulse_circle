import { Resend } from 'resend'

export type EmailSendResult =
  | { status: 'sent'; messageId: string }
  | { status: 'not_configured'; reason: 'email_provider_not_configured' }
  | { status: 'configuration_error'; reason: string }
  | { status: 'delivery_failed'; reason: string }

type SendInvitationEmailParams = {
  to: string
  circleName: string
  inviterName: string
  token: string
  expiresAt: Date
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HEADER_CRLF_REGEX = /[\r\n]/

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatExpiryDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function validateHeaderValue(value: string, fieldName: string): void {
  if (HEADER_CRLF_REGEX.test(value)) {
    throw new Error(`Invalid ${fieldName}: contains newline characters`)
  }
}

function validateEmail(value: string, fieldName: string): void {
  if (!EMAIL_REGEX.test(value)) {
    throw new Error(`Invalid ${fieldName}: not a valid email address`)
  }
}

function parseAndValidateAppBaseUrl(): URL {
  const raw = process.env.APP_BASE_URL
  if (!raw) {
    throw new Error('APP_BASE_URL is not configured')
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('APP_BASE_URL is malformed')
  }

  const scheme = url.protocol
  const isProduction = process.env.NODE_ENV === 'production'

  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new Error('APP_BASE_URL has unsupported scheme')
  }

  if (scheme === 'https:') {
    // HTTPS is always allowed
  } else if (scheme === 'http:') {
    if (isProduction) {
      throw new Error('HTTP not allowed in production')
    }
    const hostname = url.hostname
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.endsWith('.localhost')) {
      throw new Error('HTTP only allowed for localhost in development')
    }
  }

  if (url.username || url.password) {
    throw new Error('APP_BASE_URL must not contain credentials')
  }

  return url
}

function buildAcceptanceUrl(baseUrl: URL, token: string): string {
  const url = new URL('/accept-invite', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * Send an invitation email via Resend.
 *
 * Returns a typed result. Never logs the raw invitation token, acceptance URL,
 * API key, or complete email contents. On provider failure, returns a safe
 * error result instead of throwing.
 */
export async function sendInvitationEmail(
  params: SendInvitationEmailParams,
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const fromName = process.env.RESEND_FROM_NAME

  const { inviterName, circleName, token } = params

  // Email provider is optional at startup. If no API key is set, report that
  // delivery is not configured rather than crashing.
  if (!apiKey) {
    return {
      status: 'not_configured',
      reason: 'email_provider_not_configured',
    }
  }

  // If the API key exists but sender configuration is incomplete, fail safely.
  if (!fromEmail) {
    return {
      status: 'configuration_error',
      reason: 'RESEND_FROM_EMAIL is not configured',
    }
  }

  if (!fromName) {
    return {
      status: 'configuration_error',
      reason: 'RESEND_FROM_NAME is not configured',
    }
  }

  let baseUrl: URL
  try {
    baseUrl = parseAndValidateAppBaseUrl()
  } catch (err) {
    return {
      status: 'configuration_error',
      reason: err instanceof Error ? err.message : 'APP_BASE_URL is invalid',
    }
  }

  const acceptanceUrl = buildAcceptanceUrl(baseUrl, token)

  const safeInviterName = escapeHtml(inviterName)
  const safeCircleName = escapeHtml(circleName)
  const expiresAtFormatted = formatExpiryDate(params.expiresAt)

  try {
    // Validate sender header values before using them
    validateHeaderValue(fromName, 'RESEND_FROM_NAME')
    validateHeaderValue(fromEmail, 'RESEND_FROM_EMAIL')
    validateEmail(fromEmail, 'RESEND_FROM_EMAIL')

    const resend = new Resend(apiKey)

    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [params.to],
      subject: `You're invited to join ${safeCircleName} on Pulse Circle`,
      text: buildTextEmail(
        inviterName,
        circleName,
        acceptanceUrl,
        expiresAtFormatted,
      ),
      html: buildHtmlEmail(
        safeInviterName,
        safeCircleName,
        acceptanceUrl,
        expiresAtFormatted,
      ),
    })

    if (result.error) {
      return {
        status: 'delivery_failed',
        reason: 'email_delivery_failed',
      }
    }

    return {
      status: 'sent',
      messageId: result.data?.id ?? 'unknown',
    }
  } catch {
    return {
      status: 'delivery_failed',
      reason: 'email_delivery_failed',
    }
  }
}

function buildTextEmail(
  inviterName: string,
  circleName: string,
  acceptanceUrl: string,
  expiresAtFormatted: string,
): string {
  return `
Pulse Circle - Invitation

${inviterName} has invited you to join the "${circleName}" circle on Pulse Circle.

Pulse Circle connects older adults living alone with trusted neighbors and family through daily check-ins and real-time communication.

To accept this invitation, click the link below:
${acceptanceUrl}

This invitation expires on ${expiresAtFormatted}.

If you did not expect this invitation, you can safely ignore this email.

--
Pulse Circle
`
}

function buildHtmlEmail(
  inviterName: string,
  circleName: string,
  acceptanceUrl: string,
  expiresAtFormatted: string,
): string {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #047857;">Pulse Circle</h1>
    <p>You have been invited to join the "<strong>${circleName}</strong>" circle on Pulse Circle.</p>
    <p>${inviterName} is connecting with you through Pulse Circle - daily check-ins and real-time communication for older adults, trusted neighbors and family.</p>
    <p style="margin: 30px 0;">
      <a href="${acceptanceUrl}" style="background-color: #047857; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a>
    </p>
    <p><strong>This invitation expires on ${expiresAtFormatted}.</strong></p>
    <p>If you did not expect this invitation, you can safely ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e5e5e5; margin-top: 30px;" />
    <p style="font-size: 12px; color: #666;">Pulse Circle - Daily connection for older adults, trusted neighbors and family.</p>
  </body>
</html>
`
}
