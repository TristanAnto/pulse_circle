import { NextFunction, Response, Router } from 'express'

import { authenticate, csrfProtection, type AuthenticatedRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { InvitationStatus } from '@prisma/client'
import { addNexconnGroupMembers } from '../lib/nexconnGroup'
import { toNexconnUserId } from '../lib/nexconn'

const router = Router()

/**
 * GET /invitations
 * Lists pending invitations received by the authenticated user.
 *
 * Invitations are matched by the authenticated user's email against
 * `inviteeEmail`. Only PENDING, non-expired invitations are returned.
 * `tokenHash` is never exposed.
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

    const normalizedEmail = req.user.email.trim().toLowerCase()
    const now = new Date()

    try {
      const invitations = await prisma.circleInvitation.findMany({
        where: {
          inviteeEmail: normalizedEmail,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          circleId: true,
          circle: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          inviterId: true,
          inviter: {
            select: {
              id: true,
              fullName: true,
            },
          },
          role: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      res.json({ invitations })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /invitations/:invitationId/accept
 * Accepts a pending invitation by ID for the authenticated recipient.
 *
 * Preserves the email ownership check: the authenticated user's email must
 * match the invitation's inviteeEmail. Creates the CircleMember record and
 * marks the invitation ACCEPTED.
 */
router.post(
  '/:invitationId/accept',
  authenticate,
  csrfProtection,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user || !req.user.userId || !req.user.email) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { invitationId } = req.params
    if (!invitationId || typeof invitationId !== 'string') {
      res.status(404).json({ error: 'Invitation not found' })
      return
    }

    const normalizedEmail = req.user.email.trim().toLowerCase()
    const userId = req.user.userId
    const now = new Date()

    try {
      const invitation = await prisma.circleInvitation.findUnique({
        where: { id: invitationId },
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

      // Email ownership check: only the invited email can accept.
      if (invitation.inviteeEmail !== normalizedEmail) {
        res.status(403).json({ error: 'Invitation not intended for this account' })
        return
      }

      // Invitee ID check if already populated.
      if (invitation.inviteeId && invitation.inviteeId !== userId) {
        res.status(403).json({ error: 'Invitation intended for another account' })
        return
      }

      // Lock the Circle row to serialize with concurrent member removals.
      const circleRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "Circle" WHERE id = $1 FOR UPDATE`,
        invitation.circleId
      )
      if (circleRows.length === 0) {
        res.status(404).json({ error: 'Circle not found' })
        return
      }

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
          status: InvitationStatus.ACCEPTED,
          acceptedAt: now,
          inviteeId: userId,
        },
      })

      if (updated.count !== 1) {
        res.status(409).json({ error: 'Invitation no longer available' })
        return
      }

      await prisma.circleMember.create({
        data: {
          userId: userId,
          circleId: invitation.circleId,
          role: invitation.role,
        },
      })

      // If a Nexconn group channel already exists for this circle, add the
      // newly accepted member to it so Nexconn delivers messages to them.
      // Channel membership sync only runs during channel creation; new
      // members invited later must be synced here.
      let nexconnSyncSkipped = false
      try {
        const channel = await prisma.circleNexconnChannel.findUnique({
          where: { circleId: invitation.circleId },
          select: { groupId: true, creationStatus: true },
        })

        if (channel && channel.creationStatus === 'CREATED' && channel.groupId) {
          const nexconnUserId = toNexconnUserId(userId)
          const syncResult = await addNexconnGroupMembers({
            channelId: channel.groupId,
            userIds: [nexconnUserId],
          })

          if (!syncResult.ok) {
            // Provider code 25412 = "already a member" — treat as success.
            const alreadyMember =
              typeof syncResult.code === 'number' && syncResult.code === 25412
            if (!alreadyMember) {
              // Circle membership committed; Nexconn sync failed. Preserve
              // the member record and report the sync failure so the user
              // can retry via a recovery path rather than silently losing
              // messages.
              res.status(502).json({
                error: 'Circle membership added but chat sync failed.',
                nexconnSync: false,
                nexconnCode: syncResult.code,
              })
              return
            }
          }
        } else {
          nexconnSyncSkipped = true
        }
      } catch {
        // Channel lookup or sync failed unexpectedly. Circle membership is
        // already committed; preserve state and report sync failure.
        res.status(502).json({
          error: 'Circle membership added but chat sync failed.',
          nexconnSync: false,
        })
        return
      }

      res.status(200).json({
        invitation: {
          id: invitation.id,
          circleId: invitation.circleId,
          role: invitation.role,
          status: 'ACCEPTED',
        },
        ...(nexconnSyncSkipped
          ? { nexconnSync: 'skipped: no CREATED channel' }
          : { nexconnSync: true }),
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /invitations/:invitationId/decline
 * Declines a pending invitation by ID for the authenticated recipient.
 *
 * Preserves the email ownership check.
 */
router.post(
  '/:invitationId/decline',
  authenticate,
  csrfProtection,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user || !req.user.email) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { invitationId } = req.params
    if (!invitationId || typeof invitationId !== 'string') {
      res.status(404).json({ error: 'Invitation not found' })
      return
    }

    const normalizedEmail = req.user.email.trim().toLowerCase()
    const now = new Date()

    try {
      const invitation = await prisma.circleInvitation.findUnique({
        where: { id: invitationId },
        select: {
          id: true,
          inviteeEmail: true,
          status: true,
          expiresAt: true,
        },
      })

      if (!invitation) {
        res.status(404).json({ error: 'Invitation not found' })
        return
      }

      if (invitation.inviteeEmail !== normalizedEmail) {
        res.status(403).json({ error: 'Invitation not intended for this account' })
        return
      }

      const updated = await prisma.circleInvitation.updateMany({
        where: {
          id: invitation.id,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: now },
          inviteeEmail: normalizedEmail,
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
          status: 'DECLINED',
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

export { router }
