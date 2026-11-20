import { NextFunction, Response } from 'express'

import { prisma } from '../lib/prisma'
import { AuthenticatedRequest } from './auth'
import type { MemberRole } from '@prisma/client'

/**
 * Express request with an authenticated user and a verified circle membership.
 *
 * Attached by membershipRequired() after confirming the caller belongs to the
 * requested circle.
 */
export interface CircleMembershipRequest extends AuthenticatedRequest {
  circleMembership?: {
    circleId: string
    userId: string
    role: MemberRole
  }
}

// Prisma uses UUID primary keys. Validate the format before querying so a
// malformed ID returns 404 instead of a database error.
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Middleware factory: verifies the authenticated caller is a member of the
 * requested circle.
 *
 * Intended order: authenticate -> membershipRequired -> optional roleRequired.
 *
 * @param paramName Route parameter name holding the circle ID. Defaults to
 *   'circleId'.
 */
export function membershipRequired(
  paramName: string = 'circleId'
) {
  return async (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Missing authentication is not valid membership.
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    // Missing or malformed circle ID: do not reveal whether a circle exists.
    const circleId = req.params[paramName]
    if (!circleId || typeof circleId !== 'string' || !UUID_REGEX.test(circleId)) {
      res.status(404).json({ error: 'Circle not found' })
      return
    }

    try {
      // Query using the compound unique constraint on (userId, circleId).
      // Only the authenticated user's own membership is ever considered;
      // client-supplied user IDs are never trusted.
      const membership = await prisma.circleMember.findUnique({
        where: {
          userId_circleId: {
            userId: req.user.userId,
            circleId,
          },
        },
        select: {
          circleId: true,
          userId: true,
          role: true,
        },
      })

      if (!membership) {
        // 404 (not 403) avoids revealing whether the circle exists.
        res.status(404).json({ error: 'Circle not found' })
        return
      }

      req.circleMembership = membership
      next()
    } catch (err) {
      // Database/Prisma failures go through the centralized error handler.
      next(err)
    }
  }
}
