import { NextFunction, Response } from 'express'

import type { MemberRole } from '@prisma/client'
import { CircleMembershipRequest } from './membership'

/**
 * Middleware factory: verifies the verified circle membership's role is one of
 * the allowed roles.
 *
 * Intended order: authenticate -> membershipRequired -> roleRequired(...roles).
 *
 * @param allowedRoles One or more MemberRole values permitted to proceed.
 *   Must not be empty; calling with no arguments throws at setup time so a
 *   permissive route can never be created by accident.
 */
export function roleRequired(...allowedRoles: MemberRole[]) {
  if (allowedRoles.length === 0) {
    throw new Error('roleRequired requires at least one allowed role')
  }

  const allowedSet = new Set(allowedRoles)

  return (
    req: CircleMembershipRequest,
    res: Response,
    next: NextFunction
  ): void => {
    // Fail closed if membership context is missing (membershipRequired did not
    // run or did not attach a verified membership).
    if (!req.circleMembership) {
      res.status(403).json({ error: 'Membership required' })
      return
    }

    // Role comes from the verified database membership, never from the client.
    if (!allowedSet.has(req.circleMembership.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    next()
  }
}
