import { NextFunction, Response, Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'

import { authenticate, csrfProtection, type AuthenticatedRequest } from '../middleware/auth'
import { membershipRequired, type CircleMembershipRequest } from '../middleware/membership'
import { roleRequired } from '../middleware/role'
import { prisma } from '../lib/prisma'
import { toNexconnUserId } from '../lib/nexconn'
import {
  createNexconnGroup,
  toNexconnGroupId,
} from '../lib/nexconnGroup'
import { InvitationStatus, MemberRole, Prisma } from '@prisma/client'
import { generateInvitationToken, hashInvitationToken } from '../lib/invitation'
import { sendInvitationEmail } from '../lib/email'

const router = Router()

const createCircleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
})

const invitationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const reqWithUser = req as AuthenticatedRequest
    return reqWithUser.user?.userId || 'anonymous'
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invitation requests, please try again later' },
})

const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['NEIGHBOR', 'FAMILY', 'EMERGENCY_CONTACT']),
})

const acceptInvitationSchema = z.object({
  token: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/),
})


type CircleResponse = {
  id: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

type CircleMembershipResponse = {
  circleId: string
  userId: string
  role: MemberRole
}

type CreateCircleResponse = {
  circle: CircleResponse
  membership: CircleMembershipResponse
}

type ListCircleResponse = {
  id: string
  name: string
  description: string | null
  createdAt: Date
  role: MemberRole
}

type CircleDetailResponse = {
  id: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  role: MemberRole
}

type CircleMemberResponse = {
  userId: string
  fullName: string
  role: MemberRole
  joinedAt: Date
}

/**
 * Response for the Nexconn group-channel resolution endpoint.
 *
 * Only the opaque Nexconn group ID is exposed — never the App Key, App
 * Secret, access token, or the circle's member list.
 */
type NexconnChannelResponse = {
  circleId: string
  groupId: string
  status: 'CREATED' | 'PENDING' | 'FAILED'
}

/**
 * Nexconn recipient entry for a circle member.
 *
 * Only the minimum information needed to address a member through a Nexconn
 * DirectChannel is exposed: the member's display name and the canonical
 * Nexconn user ID derived from the stored UUID. No credentials, tokens, or
 * App Secret are ever returned.
 */
type NexconnRecipientResponse = {
  userId: string
  nexconnUserId: string
  fullName: string
  role: MemberRole
}

/**
 * POST /api/circles
 * Creates a circle for the authenticated user and assigns them the ELDER role.
 * Circle and membership are created atomically in a Prisma transaction.
 */
router.post(
  '/',
  authenticate,
  csrfProtection,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = createCircleSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input' })
      return
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { name, description } = result.data
    const userId = req.user.userId

    let circle
    try {
      circle = await prisma.$transaction(async (tx) => {
        const created = await tx.circle.create({
          data: { name, description: description || null },
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        await tx.circleMember.create({
          data: {
            userId,
            circleId: created.id,
            role: MemberRole.ELDER,
          },
        })

        return created
      })
    } catch (err) {
      next(err)
      return
    }

    const response: CreateCircleResponse = {
      circle: {
        id: circle.id,
        name: circle.name,
        description: circle.description,
        createdAt: circle.createdAt,
        updatedAt: circle.updatedAt,
      },
      membership: {
        circleId: circle.id,
        userId,
        role: MemberRole.ELDER,
      },
    }

    res.status(201).json(response)
  }
)

/**
 * GET /api/circles
 * Lists circles belonging to the authenticated user, including their role.
 */
router.get(
  '/',
  authenticate,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const userId = req.user.userId

    try {
      const memberships = await prisma.circleMember.findMany({
        where: { userId },
        select: {
          circleId: true,
          role: true,
          circle: {
            select: {
              id: true,
              name: true,
              description: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { circle: { createdAt: 'desc' } },
      })

      const circles: ListCircleResponse[] = memberships.map((m) => ({
        id: m.circle.id,
        name: m.circle.name,
        description: m.circle.description,
        createdAt: m.circle.createdAt,
        role: m.role,
      }))

      res.json({ circles })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/circles/:circleId
 * Returns details of a single circle for an authenticated member.
 */
router.get(
  '/:circleId',
  authenticate,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.circleMembership) {
      res.status(403).json({ error: 'Membership required' })
      return
    }

    const circleId = req.circleMembership.circleId
    const role = req.circleMembership.role

    try {
      const circle = await prisma.circle.findUnique({
        where: { id: circleId },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (!circle) {
        res.status(404).json({ error: 'Circle not found' })
        return
      }

      const response: CircleDetailResponse = {
        id: circle.id,
        name: circle.name,
        description: circle.description,
        createdAt: circle.createdAt,
        updatedAt: circle.updatedAt,
        role,
      }

      res.json(response)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/circles/:circleId/members
 * Returns the members of a circle for an authenticated member.
 */
router.get(
  '/:circleId/members',
  authenticate,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.circleMembership) {
      res.status(403).json({ error: 'Membership required' })
      return
    }

    const circleId = req.circleMembership.circleId

    try {
      const members = await prisma.circleMember.findMany({
        where: { circleId },
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          user: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      })

      const response: CircleMemberResponse[] = members.map((m) => ({
        userId: m.userId,
        fullName: m.user.fullName,
        role: m.role,
        joinedAt: m.joinedAt,
      }))

      res.json({ members: response })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/circles/:circleId/nexconn-recipients
 * Resolves the Nexconn user IDs of a circle's members for direct messaging.
 *
 * Requires authentication and active membership in the requested circle, so
 * users outside the circle cannot enumerate its members. The caller's own
 * entry is included so the client can address itself (e.g. for self-notes) or
 * simply know which ID is theirs.
 *
 * Nexconn user IDs are derived from the stored UUID via the canonical
 * transformation used by token issuance (toNexconnUserId), so the IDs returned
 * here are the same ones accepted by DirectChannelIdentifier.
 */
router.get(
  '/:circleId/nexconn-recipients',
  authenticate,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.circleMembership) {
      res.status(403).json({ error: 'Membership required' })
      return
    }

    const circleId = req.circleMembership.circleId

    try {
      const members = await prisma.circleMember.findMany({
        where: { circleId },
        select: {
          userId: true,
          role: true,
          user: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      })

      const recipients: NexconnRecipientResponse[] = members.map((m) => ({
        userId: m.userId,
        nexconnUserId: toNexconnUserId(m.userId),
        fullName: m.user.fullName,
        role: m.role,
      }))

      res.json({ recipients })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/circles/:circleId/invitations
 * Creates a check-in invitation for a trusted circle member.
 * Only ELDER and ADMIN members can invite.
 */
router.post(
  '/:circleId/invitations',
  authenticate,
  csrfProtection,
  membershipRequired('circleId'),
  roleRequired(MemberRole.ELDER, MemberRole.ADMIN),
  invitationRateLimiter,
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = createInvitationSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input' })
      return
    }

    if (!req.user || !req.circleMembership) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { email: rawEmail, role } = result.data
    const normalizedEmail = rawEmail.trim().toLowerCase()
    const userId = req.user.userId
    const circleId = req.circleMembership.circleId

    // Check if recipient is already a member of this circle
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })

    if (existingUser) {
      const membership = await prisma.circleMember.findUnique({
        where: {
          userId_circleId: {
            userId: existingUser.id,
            circleId,
          },
        },
      })
      if (membership) {
        res.status(409).json({ error: 'User is already a member of this circle' })
        return
      }
    }

    // Generate token and hash
    const rawToken = generateInvitationToken()
    const tokenHash = hashInvitationToken(rawToken)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    // Get inviter and circle names for the email
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    })

    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      select: { name: true },
    })

    if (!inviter || !circle) {
      res.status(404).json({ error: 'Inviter or circle not found' })
      return
    }

    // Create invitation record
    let invitation
    try {
      invitation = await prisma.circleInvitation.create({
        data: {
          circleId,
          inviterId: userId,
          inviteeEmail: normalizedEmail,
          inviteeId: existingUser?.id ?? null,
          role,
          status: 'PENDING',
          tokenHash,
          expiresAt,
        },
        select: {
          id: true,
          circleId: true,
          userId: true,
          role: true,
          status: true,
          expiresAt: true,
        },
      })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        res.status(409).json({ error: 'An invitation already exists for this email' })
        return
      }
      next(err)
      return
    }

    // Send invitation email
    const emailResult = await sendInvitationEmail({
      to: normalizedEmail,
      circleName: circle.name,
      inviterName: inviter.fullName,
      token: rawToken,
      expiresAt,
    })

    // Handle email delivery result
    if (emailResult.status !== 'sent') {
      // Cancel the invitation only if it is still pending
      try {
        const cancellation = await prisma.circleInvitation.updateMany({
          where: {
            id: invitation.id,
            status: InvitationStatus.PENDING,
          },
          data: {
            status: InvitationStatus.CANCELLED,
          },
        })

        if (cancellation.count === 0) {
          // Invitation is no longer PENDING (e.g., already accepted or
          // cancelled); do not treat this as a cancellation failure.
          console.log(
            `Invitation ${invitation.id} could not be cancelled: status is no longer PENDING`,
          )
        }
      } catch (err) {
        // Cancellation itself failed; log a safe diagnostic and continue with
        // the delivery error response. Do not expose cancellation errors to
        // the client.
        console.log(
          `Invitation ${invitation.id} cancellation failed: ${err instanceof Prisma.PrismaClientKnownRequestError ? err.code : 'unknown error'}`,
        )
      }

      const statusCode =
        emailResult.status === 'not_configured' ||
        emailResult.status === 'configuration_error'
          ? 503
          : 502
      res.status(statusCode).json({ error: 'Invitation delivery failed' })
      return
    }

    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: normalizedEmail,
        role,
        status: 'PENDING',
        expiresAt,
      },
      delivery: 'accepted_by_provider',
    })
  }
)

/**
 * POST /api/invitations/accept
 * Accepts a pending invitation and creates a circle membership for the
 * authenticated user.
 */
router.post(
  '/invitations/accept',
  authenticate,
  csrfProtection,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = acceptInvitationSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input' })
      return
    }

    if (!req.user || !req.user.userId || !req.user.email) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { token } = result.data
    const normalizedEmail = req.user.email.trim().toLowerCase()
    const userId = req.user.userId

    if (!normalizedEmail) {
      res.status(400).json({ error: 'Invalid user email' })
      return
    }

    // Hash the token and find the invitation
    const tokenHash = hashInvitationToken(token)

    const invitation = await prisma.circleInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        circleId: true,
        inviteeEmail: true,
        inviteeId: true,
        role: true,
        status: true,
        expiresAt: true,
      },
    })

    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' })
      return
    }

    // Verify the invitee email matches the authenticated user
    if (invitation.inviteeEmail !== normalizedEmail) {
      res.status(403).json({ error: 'Invitation not intended for this account' })
      return
    }

    // Verify the invitee ID if already populated
    if (invitation.inviteeId && invitation.inviteeId !== userId) {
      res.status(403).json({ error: 'Invitation intended for another account' })
      return
    }

    const now = new Date()

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.circleInvitation.updateMany({
          where: {
            id: invitation.id,
            status: InvitationStatus.PENDING,
            expiresAt: { gt: now },
            inviteeEmail: normalizedEmail,
            ...(invitation.inviteeId
              ? { inviteeId: invitation.inviteeId }
              : {}),
          },
          data: {
            status: InvitationStatus.ACCEPTED,
            acceptedAt: now,
            inviteeId: userId,
          },
        })

        if (updated.count !== 1) {
          throw new Error('Invitation claim failed')
        }

        await tx.circleMember.create({
          data: {
            userId: userId,
            circleId: invitation.circleId,
            role: invitation.role,
          },
        })

        return { circleId: invitation.circleId, role: invitation.role }
      })
    } catch (err) {
      next(err)
      return
    }

    res.status(200).json({
      invitation: {
        id: invitation.id,
        circleId: invitation.circleId,
        role: invitation.role,
        status: 'ACCEPTED',
      },
    })
  }
)

/**
 * POST /api/invitations/decline
 * Declines a pending invitation. The authenticated user must match the
 * invitation's invitee email.
 */
router.post(
  '/invitations/decline',
  authenticate,
  csrfProtection,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = acceptInvitationSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input' })
      return
    }

    if (!req.user || !req.user.userId || !req.user.email) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { token } = result.data
    const normalizedEmail = req.user.email.trim().toLowerCase()
    const userId = req.user.userId

    if (!normalizedEmail) {
      res.status(400).json({ error: 'Invalid user email' })
      return
    }

    // Hash the token and find the invitation
    const tokenHash = hashInvitationToken(token)

    let invitation
    try {
      invitation = await prisma.circleInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          circleId: true,
          inviteeEmail: true,
          inviteeId: true,
          role: true,
          status: true,
          expiresAt: true,
        },
      })
    } catch (err) {
      next(err)
      return
    }

    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' })
      return
    }

    // Verify the invitee email matches the authenticated user
    if (invitation.inviteeEmail !== normalizedEmail) {
      res.status(403).json({ error: 'Invitation not intended for this account' })
      return
    }

    // Verify the invitee ID if already populated
    if (invitation.inviteeId && invitation.inviteeId !== userId) {
      res.status(403).json({ error: 'Invitation intended for another account' })
      return
    }

    const now = new Date()

    try {
      const updated = await prisma.circleInvitation.updateMany({
        where: {
          id: invitation.id,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: now },
          inviteeEmail: normalizedEmail,
          ...(invitation.inviteeId
            ? { inviteeId: invitation.inviteeId }
            : {}),
        },
        data: {
          status: InvitationStatus.DECLINED,
        },
      })

      if (updated.count !== 1) {
        res.status(409).json({ error: 'Invitation no longer available' })
        return
      }

      res.status(200).json({
        invitation: {
          id: invitation.id,
          circleId: invitation.circleId,
          role: invitation.role,
          status: 'DECLINED',
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/circles/:circleId/nexconn-channel
 * Resolves the Nexconn group channel mapped to a Pulse Circle.
 *
 * Requires authentication and active membership. Returns only the mapped
 * group ID and creation status — never credentials, tokens, or member lists.
 * A missing mapping is reported as 404 so the client can distinguish
 * "not created yet" from "not authorized".
 */
router.get(
  '/:circleId/nexconn-channel',
  authenticate,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.circleMembership) {
      res.status(403).json({ error: 'Membership required' })
      return
    }

    const circleId = req.circleMembership.circleId

    try {
      const channel = await prisma.circleNexconnChannel.findUnique({
        where: { circleId },
        select: {
          circleId: true,
          groupId: true,
          creationStatus: true,
        },
      })

      if (!channel) {
        res.status(404).json({ error: 'Nexconn channel not created for this circle' })
        return
      }

      const response: NexconnChannelResponse = {
        circleId: channel.circleId,
        groupId: channel.groupId,
        status: channel.creationStatus,
      }
      res.json(response)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/circles/:circleId/nexconn-channel
 * Creates the Nexconn group channel for a Pulse Circle, if one does not
 * already exist.
 *
 * Uses a database claim so concurrent callers cannot create duplicate groups.
 * An uncertain Nexconn response (timeout, unknown outcome) is recorded as
 * PENDING and never triggers automatic recreation; only a clearly failed
 * response is marked FAILED and made retryable.
 */
router.post(
  '/:circleId/nexconn-channel',
  authenticate,
  csrfProtection,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.circleMembership) {
      res.status(403).json({ error: 'Membership required' })
      return
    }

    const circleId = req.circleMembership.circleId
    const userId = req.circleMembership.userId
    const groupId = toNexconnGroupId(circleId)

    let claimed: { claimed: boolean; existing: { groupId: string; creationStatus: string } | null }
    try {
      // Claim the row first, inside a transaction, so two simultaneous
      // requests cannot both proceed to create an external group.
      claimed = await prisma.$transaction(async (tx) => {
        const existing = await tx.circleNexconnChannel.findUnique({
          where: { circleId },
          select: { groupId: true, creationStatus: true },
        })

        if (existing) {
          return { claimed: false, existing }
        }

        await tx.circleNexconnChannel.create({
          data: {
            circleId,
            groupId,
            ownerUserId: userId,
            creationStatus: 'PENDING',
          },
          select: { circleId: true, groupId: true, creationStatus: true },
        })

        return { claimed: true, existing: null }
      })
    } catch (err) {
      // P2002: another concurrent request claimed the row first. Re-read the
      // mapping and return it or 409 instead of surfacing a raw Prisma error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const current = await prisma.circleNexconnChannel.findUnique({
          where: { circleId },
          select: { circleId: true, groupId: true, creationStatus: true },
        })
        if (!current) {
          next(err)
          return
        }
        if (current.creationStatus === 'CREATED') {
          const response: NexconnChannelResponse = {
            circleId: current.circleId,
            groupId: current.groupId,
            status: 'CREATED',
          }
          res.json(response)
          return
        }
        res.status(409).json({
          error: 'Channel creation already in progress',
          groupId: current.groupId,
        })
        return
      }
      next(err)
      return
    }

    try {
      // claimed.existing is set when a row already existed; null means we just
      // claimed a fresh PENDING row and should proceed to create the group.
      if (claimed.existing) {
        const existing = claimed.existing
        if (existing.creationStatus === 'CREATED') {
          const response: NexconnChannelResponse = {
            circleId: req.params.circleId,
            groupId: existing.groupId,
            status: 'CREATED',
          }
          res.json(response)
          return
        }

        if (existing.creationStatus === 'PENDING') {
          res.status(409).json({
            error: 'Channel creation already in progress',
            groupId,
          })
          return
        }

        // FAILED: a prior attempt clearly failed, so this is safe to retry.
        // Flip back to PENDING inside a transaction so a concurrent caller
        // cannot race us into a duplicate creation.
        const retried = await prisma.$transaction(async (tx) => {
          const current = await tx.circleNexconnChannel.findUnique({
            where: { circleId },
            select: { creationStatus: true },
          })
          if (!current || current.creationStatus !== 'FAILED') {
            return { retried: false }
          }
          await tx.circleNexconnChannel.update({
            where: { circleId },
            data: { creationStatus: 'PENDING', nexconnError: null },
          })
          return { retried: true }
        })
        if (!retried.retried) {
          res.status(409).json({
            error: 'Channel creation already in progress',
            groupId,
          })
          return
        }
      }

      // We claimed a fresh PENDING row, so proceed to create the external group.

      // Fetch active members for the invitation list. Pulse Circle remains
      // the source of truth for membership.
      const members = await prisma.circleMember.findMany({
        where: { circleId },
        select: { userId: true },
        orderBy: { joinedAt: 'asc' },
      })
      const memberIds = members.map((m) => toNexconnUserId(m.userId))
      const ownerNexconnId = toNexconnUserId(userId)

      let result: Awaited<ReturnType<typeof createNexconnGroup>>
      try {
        result = await createNexconnGroup({
          channelId: groupId,
          name: `Pulse Circle ${circleId}`,
          owner: ownerNexconnId,
          userIds: memberIds.filter((id) => id !== ownerNexconnId),
        })
      } catch (err) {
        // A thrown error means a network failure or HTTP error. The outcome
        // is uncertain: the request may have reached Nexconn. Record PENDING
        // so automatic recreation is blocked; the client must retry manually.
        await prisma.circleNexconnChannel.update({
          where: { circleId },
          data: {
            creationStatus: 'PENDING',
            nexconnError: err instanceof Error ? err.message : 'nexconn_error',
          },
        })
        res.status(503).json({
          error: 'Unable to create the chat channel. Please try again later.',
        })
        return
      }

      if (result.ok) {
        await prisma.circleNexconnChannel.update({
          where: { circleId },
          data: { creationStatus: 'CREATED', nexconnError: null },
        })
        const response: NexconnChannelResponse = {
          circleId,
          groupId,
          status: 'CREATED',
        }
        res.status(201).json(response)
        return
      }

      // A clearly failed response (non-zero code) means the group was not
      // created, so this is safe to retry.
      await prisma.circleNexconnChannel.update({
        where: { circleId },
        data: {
          creationStatus: 'FAILED',
          nexconnError: `Nexconn code ${result.code}`,
        },
      })
      res.status(502).json({
        error: 'Unable to create the chat channel. Please try again later.',
      })
    } catch (err) {
      next(err)
    }
  }
)

export { router }
