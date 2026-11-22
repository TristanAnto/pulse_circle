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
  addNexconnGroupMembers,
  listAllNexconnGroupMembers,
  listNexconnGroupMembers,
  sendNexconnGroupMessage,
  toNexconnGroupId,
} from '../lib/nexconnGroup'
import {
  createSyncLeaseOwnerToken,
  acquireCircleNexconnSyncLease,
  renewCircleNexconnSyncLease,
  assertCircleNexconnSyncLeaseHeld,
  releaseCircleNexconnSyncLease,
} from '../lib/circleNexconnSyncLease'
import { CheckInStatus, InvitationStatus, MemberRole, Prisma } from '@prisma/client'
import { generateInvitationToken, hashInvitationToken } from '../lib/invitation'
import { sendInvitationEmail } from '../lib/email'

const router = Router()

const createCircleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
})

const updateCircleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
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

const sendNexconnMessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
})

const checkInSchema = z.object({})


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
  unreadCount: number
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
  checkedInToday: boolean
  checkedInAt: Date | null
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
 * Response for the Nexconn group-channel synchronization endpoint.
 *
 * Extends the channel response with membership sync statistics.
 * `status` values are response-only and are NOT part of the database enum.
 */
type NexconnChannelSyncResponse = {
  circleId: string
  groupId: string
  status: 'CREATED' | 'SYNCED' | 'PARTIAL' | 'FAILED'
  membersSynced: number
  membersRemaining: number
  complete: boolean
  nexconnError?: string
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

type CheckInResponse = {
  id: string
  userId: string
  circleId: string
  status: CheckInStatus
  checkedInAt: Date | null
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

      // Fetch per-circle unread counts for the authenticated user.
      const readStates = await prisma.conversationReadState.findMany({
        where: { userId },
        select: { circleId: true, unreadCount: true },
      })
      const unreadCountMap = new Map(
        readStates.map(
          (rs: { circleId: string; unreadCount: number }) =>
            [rs.circleId, rs.unreadCount] as [string, number]
        )
      )

      const circles: ListCircleResponse[] = memberships.map((m) => ({
        id: m.circle.id,
        name: m.circle.name,
        description: m.circle.description,
        createdAt: m.circle.createdAt,
        role: m.role,
        unreadCount: unreadCountMap.get(m.circle.id) ?? 0,
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
 * POST /api/circles/:circleId/read
 * Marks the conversation as read for the authenticated user, resetting the
 * unread count to zero and recording the read timestamp.
 */
router.post(
  '/:circleId/read',
  authenticate,
  csrfProtection,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user || !req.circleMembership) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const circleId = req.circleMembership.circleId
    const userId = req.user.userId

    try {
      await prisma.conversationReadState.upsert({
        where: {
          userId_circleId: {
            userId,
            circleId,
          },
        },
        update: {
          unreadCount: 0,
          lastReadAt: new Date(),
        },
        create: {
          userId,
          circleId,
          unreadCount: 0,
          lastReadAt: new Date(),
        },
      })

      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/circles/:circleId/messages/unread
 * Increments the unread message count for the authenticated user's
 * conversation with the given circle. Called by the frontend when a new
 * incoming message arrives via Nexconn.
 */
router.post(
  '/:circleId/messages/unread',
  authenticate,
  csrfProtection,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user || !req.circleMembership) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const circleId = req.circleMembership.circleId
    const userId = req.user.userId

    try {
      await prisma.conversationReadState.upsert({
        where: {
          userId_circleId: {
            userId,
            circleId,
          },
        },
        update: {
          unreadCount: {
            increment: 1,
          },
        },
        create: {
          userId,
          circleId,
          unreadCount: 1,
        },
      })

      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/circles/:circleId/check-in
 * Records a daily check-in for the authenticated user in the specified circle.
 *
 * Requires authentication and active circle membership. Prevents duplicate
 * check-ins for the same user, circle, and calendar day by checking for an
 * existing COMPLETED record before creating one (no unique constraint exists
 * on userId + circleId + calendar day in the schema).
 */
router.post(
  '/:circleId/check-in',
  authenticate,
  csrfProtection,
  membershipRequired('circleId'),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user || !req.circleMembership) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const circleId = req.circleMembership.circleId
    const userId = req.user.userId

    try {
      const result = checkInSchema.safeParse(req.body)
      if (!result.success) {
        res.status(400).json({ error: 'Invalid input' })
        return
      }

      // Compute the server's calendar day boundaries for duplicate detection.
      const now = new Date()
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)

      // Duplicate prevention: no unique constraint exists on
      // (userId, circleId, calendar day), so enforce it in application code.
      const existing = await prisma.checkIn.findFirst({
        where: {
          userId,
          circleId,
          status: CheckInStatus.COMPLETED,
          checkedInAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
        select: {
          id: true,
          checkedInAt: true,
          status: true,
        },
      })

      if (existing) {
        res.json({
          success: true,
          alreadyCheckedIn: true,
          checkIn: {
            id: existing.id,
            userId,
            circleId,
            status: existing.status,
            checkedInAt: existing.checkedInAt,
          },
        })
        return
      }

      const checkIn = await prisma.checkIn.create({
        data: {
          userId,
          circleId,
          status: CheckInStatus.COMPLETED,
          checkedInAt: now,
        },
        select: {
          id: true,
          userId: true,
          circleId: true,
          status: true,
          checkedInAt: true,
        },
      })

      const response: CheckInResponse = {
        id: checkIn.id,
        userId: checkIn.userId,
        circleId: checkIn.circleId,
        status: checkIn.status,
        checkedInAt: checkIn.checkedInAt,
      }

      res.status(201).json({
        success: true,
        alreadyCheckedIn: false,
        checkIn: response,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * PATCH /api/circles/:circleId
 * Renames a circle. Only ELDER or ADMIN members may rename.
 */
router.patch(
  '/:circleId',
  authenticate,
  csrfProtection,
  membershipRequired('circleId'),
  roleRequired(MemberRole.ELDER, MemberRole.ADMIN),
  async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = updateCircleSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input' })
      return
    }

    if (!req.user || !req.circleMembership) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const circleId = req.circleMembership.circleId
    const { name, description } = result.data

    try {
      const circle = await prisma.circle.update({
        where: { id: circleId },
        data: {
          name,
          description: description ?? null,
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      const response: CircleResponse = {
        id: circle.id,
        name: circle.name,
        description: circle.description,
        createdAt: circle.createdAt,
        updatedAt: circle.updatedAt,
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
      // Compute calendar day boundaries consistent with the check-in write
      // endpoint (server local time, start-of-day to end-of-day).
      const now = new Date()
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)

      // Fetch all members and today's completed check-ins in parallel
      // (single query each, no N+1).
      const [members, todayCheckIns] = await Promise.all([
        prisma.circleMember.findMany({
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
        }),
        prisma.checkIn.findMany({
          where: {
            circleId,
            status: CheckInStatus.COMPLETED,
            checkedInAt: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
          select: {
            userId: true,
            checkedInAt: true,
          },
        }),
      ])

      // Index today's check-ins by userId for O(1) lookup per member.
      const checkInMap = new Map<string, Date>()
      for (const ci of todayCheckIns) {
        checkInMap.set(ci.userId, ci.checkedInAt ?? new Date(0))
      }

      const response: CircleMemberResponse[] = members.map((m) => {
        const checkedInAt = checkInMap.get(m.userId) ?? null
        return {
          userId: m.userId,
          fullName: m.user.fullName,
          role: m.role,
          joinedAt: m.joinedAt,
          checkedInToday: checkedInAt !== null,
          checkedInAt,
        }
      })

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

    // Prevent duplicate active invitations to the same email for this circle.
    const now = new Date()
    const existingPending = await prisma.circleInvitation.findFirst({
      where: {
        circleId,
        inviteeEmail: normalizedEmail,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
    })
    if (existingPending) {
      res.status(409).json({ error: 'A pending invitation already exists for this email' })
      return
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

    // Send invitation email (optional — delivery is not required for
    // in-app acceptance when the invitee is already registered).
    const emailResult = await sendInvitationEmail({
      to: normalizedEmail,
      circleName: circle.name,
      inviterName: inviter.fullName,
      token: rawToken,
      expiresAt,
    })

    let deliveryStatus = 'not_sent'
    if (emailResult.status === 'sent') {
      deliveryStatus = 'accepted_by_provider'
    }

    // If email delivery failed and the invitee is not a registered user,
    // cancel the invitation since there is no in-app acceptance path for
    // them. If the invitee is registered, keep the invitation PENDING so
    // they can accept it inside Pulse Circle.
    if (emailResult.status !== 'sent' && !existingUser) {
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
          console.log(
            `Invitation ${invitation.id} could not be cancelled: status is no longer PENDING`,
          )
        }
      } catch (err) {
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
      delivery: deliveryStatus,
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
        // Lock the Circle row before any membership mutation to serialize
        // with concurrent member removals.
        const circleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "Circle" WHERE id = $1 FOR UPDATE`,
          invitation.circleId
        )
        if (circleRows.length === 0) {
          throw new Error('Circle not found')
        }

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
 * POST /api/circles/:circleId/nexconn-channel/sync-member
 * Synchronizes the authenticated caller's own Nexconn identity into the
 * existing CREATED Nexconn group channel for this Circle.
 *
 * Requires authentication and active Circle membership. Only the caller's
 * own Nexconn user ID is synced — no target user ID is accepted from the
 * client. Does not create a new channel or modify CircleMember records.
 * Provider code 25412 (already a member) is treated as success.
 */
router.post(
  '/:circleId/nexconn-channel/sync-member',
  authenticate,
  membershipRequired('circleId'),
  csrfProtection,
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

      if (channel.creationStatus !== 'CREATED' || !channel.groupId) {
        res.status(400).json({ error: 'Nexconn channel is not ready for member sync' })
        return
      }

      const nexconnUserId = toNexconnUserId(userId)
      const syncResult = await addNexconnGroupMembers({
        channelId: channel.groupId,
        userIds: [nexconnUserId],
      })

      if (!syncResult.ok) {
        const alreadyMember =
          typeof syncResult.code === 'number' && syncResult.code === 25412
        if (alreadyMember) {
          res.status(200).json({
            circleId,
            groupId: channel.groupId,
            nexconnSync: 'already-member',
          })
          return
        }
        res.status(502).json({
          error: 'Nexconn member sync failed.',
          nexconnSync: false,
          nexconnCode: syncResult.code,
        })
        return
      }

      res.status(200).json({
        circleId,
        groupId: channel.groupId,
        nexconnSync: 'added',
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/circles/:circleId/nexconn-channel
 * Creates the Nexconn group channel for a Pulse Circle, if one does not
 * already exist, then synchronizes all Pulse Circle members into the group.
 *
 * Uses a per-circle database lease so concurrent callers cannot create
 * duplicate groups or run conflicting synchronization operations.
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
    const ownerToken = createSyncLeaseOwnerToken()
    const ttlMs = 60_000

    let leaseHeld = false

    try {
      // Step 1: Lock the Circle row, then insert or preserve the placeholder
      // mapping inside a short transaction. The Circle lock serializes
      // placeholder creation with the future member-removal no-channel path.
      const channel = await prisma.$transaction(
        async (tx) => {
        const circleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "Circle" WHERE id = $1 FOR UPDATE`,
          circleId
        )
        if (circleRows.length === 0) {
          throw new Error('Circle not found')
        }

        // Revalidate authorization: the calling user must be a member of
        // this circle (already enforced by membershipRequired middleware;
        // re-check under the lock for defense in depth).
        const membership = await tx.circleMember.findUnique({
          where: {
            userId_circleId: {
              userId: req.circleMembership!.userId,
              circleId,
            },
          },
          select: { circleId: true, userId: true, role: true },
        })
        if (!membership) {
          throw new Error('Membership required')
        }

        // Insert placeholder if absent; preserve any existing mapping.
        await tx.$executeRawUnsafe(
          `INSERT INTO "CircleNexconnChannel" ("circleId", "groupId", "ownerUserId", "creationStatus", "updatedAt")
           VALUES ($1, $2, $3, 'PENDING', clock_timestamp())
           ON CONFLICT ("circleId") DO NOTHING`,
          circleId, groupId, userId
        )

        // Read and return the channel mapping (existing or newly created).
        return await tx.circleNexconnChannel.findUnique({
          where: { circleId },
          select: {
            circleId: true,
            groupId: true,
            ownerUserId: true,
            creationStatus: true,
          },
        })
      }, { maxWait: 10000, timeout: 10000 })

      if (!channel) {
        res.status(500).json({ error: 'Channel mapping not found' })
        return
      }

      // Step 2: Acquire the per-circle lease. No Nexconn request is made
      // unless the lease is held.
      leaseHeld = await acquireCircleNexconnSyncLease(circleId, ownerToken, ttlMs)
      if (!leaseHeld) {
        res.status(409).json({
          error: 'Operation already in progress for this circle',
          groupId,
        })
        return
      }

      // The stored ownerUserId is the source of truth for the Nexconn owner.
      // It is initialized once on placeholder creation and never overwritten.
      const storedOwnerNexconnId = toNexconnUserId(channel.ownerUserId)

      // Step 4: Handle PENDING or FAILED rows — recovery check.
      // Verify whether an earlier uncertain creation actually succeeded
      // before deciding to create or retry.
      if (channel.creationStatus === 'PENDING' || channel.creationStatus === 'FAILED') {
        await assertCircleNexconnSyncLeaseHeld(circleId, ownerToken)
        await renewCircleNexconnSyncLease(circleId, ownerToken, ttlMs)

        const existenceCheck = await listNexconnGroupMembers({ channelId: groupId })

        if (existenceCheck.ok) {
          // Group exists externally — mark CREATED and proceed to sync.
          await updateCircleNexconnChannelFenced(circleId, ownerToken, 'CREATED', null)
        } else if (existenceCheck.code === 25410) {
          // RC_GROUP_ID_NOT_EXIST — the group does not exist externally.
          // Proceed to group creation below (Step 5).
        } else {
          // Uncertain outcome — preserve state, return retryable response.
          res.status(503).json({
            circleId,
            groupId,
            status: channel.creationStatus === 'FAILED' ? 'FAILED' : 'PENDING',
            membersSynced: 0,
            membersRemaining: 0,
            complete: false,
            nexconnError: `Unable to verify channel state (code ${existenceCheck.code})`,
          })
          return
        }
      }

      // Step 5: Create the group if not yet CREATED.
      // Re-read the row because recovery may have marked it CREATED.
      const currentChannel = await prisma.circleNexconnChannel.findUnique({
        where: { circleId },
        select: { creationStatus: true },
      })

      if (currentChannel?.creationStatus !== 'CREATED') {
        await assertCircleNexconnSyncLeaseHeld(circleId, ownerToken)
        await renewCircleNexconnSyncLease(circleId, ownerToken, ttlMs)

        // Fetch Pulse Circle members for the creation invite list.
        // Pulse Circle remains the source of truth for membership.
        const members = await prisma.circleMember.findMany({
          where: { circleId },
          select: { userId: true },
          orderBy: { joinedAt: 'asc' },
        })
        const memberIds = members.map((m) => toNexconnUserId(m.userId))
        const inviteeIds = memberIds.filter((id) => id !== storedOwnerNexconnId).slice(0, 30)

        const createResult = await createNexconnGroup({
          channelId: groupId,
          name: `Pulse Circle ${circleId}`,
          owner: storedOwnerNexconnId,
          userIds: inviteeIds,
        })

        if (createResult.ok) {
          await updateCircleNexconnChannelFenced(circleId, ownerToken, 'CREATED', null)
        } else if (createResult.code === 25409) {
          // Duplicate group — external group already exists. Mark CREATED.
          await updateCircleNexconnChannelFenced(circleId, ownerToken, 'CREATED', null)
        } else {
          // Clearly failed response — safe to retry later.
          await updateCircleNexconnChannelFenced(
            circleId,
            ownerToken,
            'FAILED',
            `Nexconn code ${createResult.code}`
          )
          res.status(502).json({
            circleId,
            groupId,
            status: 'FAILED',
            membersSynced: 0,
            membersRemaining: 0,
            complete: false,
            nexconnError: `Nexconn code ${createResult.code}`,
          })
          return
        }
      }

      // Step 6: Batch member synchronization.
      const syncResult = await syncNexconnMembers(
        circleId,
        groupId,
        storedOwnerNexconnId,
        ownerToken,
        ttlMs,
      )

      const response: NexconnChannelSyncResponse = {
        circleId,
        groupId,
        status: syncResult.complete ? 'SYNCED' : 'PARTIAL',
        membersSynced: syncResult.membersSynced,
        membersRemaining: syncResult.membersRemaining,
        complete: syncResult.complete,
        ...(syncResult.nexconnError ? { nexconnError: syncResult.nexconnError } : {}),
      }

      res.status(200).json(response)
      return

    } catch (err) {
      next(err)
    } finally {
      if (leaseHeld) {
        try {
          await releaseCircleNexconnSyncLease(circleId, ownerToken)
        } catch {
          // Release failure is non-fatal; the lease expires via TTL.
        }
      }
    }
  }
)

/**
 * POST /api/circles/:circleId/nexconn-messages
 * Sends a text message to the Nexconn group channel mapped to a Pulse Circle.
 *
 * Requires authentication, active membership, and a valid CSRF token. The
 * caller must be a member of the circle and the circle must have a Nexconn
 * channel mapping in CREATED state (created via
 * POST /api/circles/:circleId/nexconn-channel).
 */
router.post(
  '/:circleId/nexconn-messages',
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

    const result = sendNexconnMessageSchema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input' })
      return
    }

    const circleId = req.circleMembership.circleId
    const userId = req.circleMembership.userId
    const { text } = result.data

    try {
      const channel = await prisma.circleNexconnChannel.findUnique({
        where: { circleId },
        select: { groupId: true, creationStatus: true },
      })

      if (!channel || channel.creationStatus !== 'CREATED') {
        res.status(400).json({
          error: 'Nexconn channel is not ready for messaging',
        })
        return
      }

      const senderNexconnId = toNexconnUserId(userId)

      const sendResult = await sendNexconnGroupMessage({
        channelId: channel.groupId,
        senderUserId: senderNexconnId,
        text,
      })

      if (!sendResult.ok) {
        res.status(502).json({
          error: 'Failed to send message via Nexconn',
          nexconnCode: sendResult.code,
        })
        return
      }

      res.status(200).json({ ok: true })
      return
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Synchronize Pulse Circle members into an existing Nexconn group.
 *
 * Compares the Pulse Circle membership (source of truth) against actual
 * Nexconn group members (paginated), then adds missing members in batches
 * of at most 100. Lease ownership is verified and renewed before every
 * external Nexconn request.
 */
async function syncNexconnMembers(
  circleId: string,
  groupId: string,
  ownerNexconnId: string,
  ownerToken: string,
  ttlMs: number,
): Promise<{
  membersSynced: number
  membersRemaining: number
  complete: boolean
  nexconnError?: string
}> {
  // Fetch all Pulse Circle members (source of truth).
  const members = await prisma.circleMember.findMany({
    where: { circleId },
    select: { userId: true },
    orderBy: { joinedAt: 'asc' },
  })

  const expectedNexconnIds = new Set(
    members.map((m) => toNexconnUserId(m.userId)).filter((id) => id !== ownerNexconnId)
  )

  // Fetch all actual Nexconn members (paginated through all pages).
  await assertCircleNexconnSyncLeaseHeld(circleId, ownerToken)
  await renewCircleNexconnSyncLease(circleId, ownerToken, ttlMs)

  const allMembers = await listAllNexconnGroupMembers({ channelId: groupId })

  if (!allMembers.ok) {
    return {
      membersSynced: 0,
      membersRemaining: expectedNexconnIds.size,
      complete: false,
      nexconnError: `Nexconn member-list error (code ${allMembers.code})`,
    }
  }

  const actualNexconnIds = new Set(allMembers.memberIds)
  let remainingIds = [...expectedNexconnIds].filter(
    (id) => !actualNexconnIds.has(id),
  )

  if (remainingIds.length === 0) {
    return { membersSynced: 0, membersRemaining: 0, complete: true }
  }

  const batchSize = 100
  const membersSynced = 0
  let nexconnError: string | undefined

  while (remainingIds.length > 0) {
    await assertCircleNexconnSyncLeaseHeld(circleId, ownerToken)
    await renewCircleNexconnSyncLease(circleId, ownerToken, ttlMs)

    const batch = remainingIds.slice(0, batchSize)

    const joinResult = await addNexconnGroupMembers({
      channelId: groupId,
      userIds: batch,
    })

    if (joinResult.ok) {
      remainingIds = remainingIds.slice(batch.length)
    } else if (joinResult.code === 25412) {
      // Already a member — non-fatal. Verify which batch members are present.
      await assertCircleNexconnSyncLeaseHeld(circleId, ownerToken)
      await renewCircleNexconnSyncLease(circleId, ownerToken, ttlMs)

      const verifyResult = await listAllNexconnGroupMembers({ channelId: groupId })
      if (!verifyResult.ok) {
        return {
          membersSynced,
          membersRemaining: remainingIds.length,
          complete: false,
          nexconnError: `Join verification failed (code ${verifyResult.code})`,
        }
      }

      const verifiedIds = new Set(verifyResult.memberIds)
      remainingIds = remainingIds.filter((id) => !verifiedIds.has(id))
    } else if (joinResult.code === 25411) {
      // Capacity exceeded — safe partial sync, do not mark FAILED.
      nexconnError = 'Nexconn group capacity exceeded'
      break
    } else {
      // Other error — verify membership before deciding next steps.
      await assertCircleNexconnSyncLeaseHeld(circleId, ownerToken)
      await renewCircleNexconnSyncLease(circleId, ownerToken, ttlMs)

      const verifyResult = await listAllNexconnGroupMembers({ channelId: groupId })
      if (!verifyResult.ok) {
        return {
          membersSynced,
          membersRemaining: remainingIds.length,
          complete: false,
          nexconnError: `Join error (code ${joinResult.code}) and verification failed`,
        }
      }

      const verifiedIds = new Set(verifyResult.memberIds)
      remainingIds = remainingIds.filter((id) => !verifiedIds.has(id))
      nexconnError = `Nexconn join error (code ${joinResult.code})`
    }
  }

  // Final verification of complete membership state.
  await assertCircleNexconnSyncLeaseHeld(circleId, ownerToken)
  await renewCircleNexconnSyncLease(circleId, ownerToken, ttlMs)

  const finalResult = await listAllNexconnGroupMembers({ channelId: groupId })
  if (!finalResult.ok) {
    return {
      membersSynced,
      membersRemaining: remainingIds.length,
      complete: false,
      nexconnError: `Final verification failed (code ${finalResult.code})`,
    }
  }

  const finalIds = new Set(finalResult.memberIds)
  const trueRemaining = [...expectedNexconnIds].filter(
    (id) => !finalIds.has(id),
  ).length

  const initiallyAbsent = [...expectedNexconnIds].filter(
    (id) => !actualNexconnIds.has(id),
  )
  const newlyConfirmed = initiallyAbsent.filter(
    (id) => finalIds.has(id),
  ).length

  return {
    membersSynced: newlyConfirmed,
    membersRemaining: trueRemaining,
    complete: trueRemaining === 0,
    ...(nexconnError ? { nexconnError } : {}),
  }
}

async function updateCircleNexconnChannelFenced(
  circleId: string,
  ownerToken: string,
  creationStatus: string,
  nexconnError: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Lock Circle row.
    const circleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "Circle" WHERE id = $1 FOR UPDATE`,
      circleId
    )
    if (circleRows.length === 0) {
      throw new Error('Circle not found')
    }

    // Lock CircleNexconnChannel row.
    const channelRows = await tx.$queryRawUnsafe<Array<{
      syncLockOwner: string | null
      syncLockExpiresAt: Date | null
    }>>(
      `SELECT "syncLockOwner", "syncLockExpiresAt"
       FROM "CircleNexconnChannel"
       WHERE "circleId" = $1
       FOR UPDATE`,
      circleId
    )
    if (channelRows.length === 0) {
      throw new Error('Channel mapping not found')
    }
    const channel = channelRows[0]

    // Verify owner and expiry using database clock_timestamp().
    const timeRows = await tx.$queryRawUnsafe<{ now: Date }[]>(
      `SELECT clock_timestamp() AS now`
    )
    const dbNow = timeRows[0].now

    if (
      channel.syncLockOwner !== ownerToken ||
      channel.syncLockExpiresAt === null ||
      channel.syncLockExpiresAt <= dbNow
    ) {
      throw new Error('Channel sync lease not held or expired')
    }

    // Conditional UPDATE — re-fences at execution time using clock_timestamp().
    const result = await tx.$executeRawUnsafe(
      `UPDATE "CircleNexconnChannel"
       SET "creationStatus" = $1::"CircleChannelStatus",
           "nexconnError" = $2,
           "updatedAt" = clock_timestamp()
       WHERE "circleId" = $3
         AND "syncLockOwner" = $4
         AND "syncLockExpiresAt" > clock_timestamp()`,
      creationStatus, nexconnError, circleId, ownerToken
    )

    if (result !== 1) {
      throw new Error('Lease expired before channel state update; no rows updated')
    }
  })
}

export { router }
