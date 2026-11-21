import { MemberRole, Prisma } from '@prisma/client'

import { toNexconnUserId } from './nexconn'

export type ClaimRemovalRecordResult =
  | {
      ok: true
      id: string
      claimedBy: string
      claimExpiresAt: Date
    }
  | {
      ok: false
      reason: 'not_claimable' | 'invalid_input'
    }

export async function claimNexconnRemovalRecord(
  tx: Prisma.TransactionClient,
  removalRecordId: string,
  ownerToken: string,
  ttlMs: number,
): Promise<ClaimRemovalRecordResult> {
  if (!ownerToken || typeof ownerToken !== 'string' || ownerToken.trim().length === 0) {
    return { ok: false, reason: 'invalid_input' }
  }

  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    return { ok: false, reason: 'invalid_input' }
  }

  const rows = await tx.$queryRawUnsafe<Array<{
    id: string
    claimedBy: string
    claimExpiresAt: Date
  }>>(
    `UPDATE "NexconnRemovalRecord"
     SET "claimedBy" = $1,
         "claimExpiresAt" = clock_timestamp() + ($2::bigint * interval '1 millisecond')
     WHERE "id" = $3
       AND "status" IN ('PENDING', 'UNKNOWN')
       AND (
         ("claimedBy" IS NULL AND "claimExpiresAt" IS NULL)
         OR
         ("claimedBy" IS NOT NULL AND "claimExpiresAt" <= clock_timestamp())
       )
     RETURNING "id", "claimedBy", "claimExpiresAt"`,
    ownerToken, ttlMs, removalRecordId
  )

  if (rows.length === 0) {
    return { ok: false, reason: 'not_claimable' }
  }

  if (rows.length > 1) {
    throw new Error('Unexpected: multiple removal records matched claim predicate')
  }

  return {
    ok: true,
    id: rows[0].id,
    claimedBy: rows[0].claimedBy,
    claimExpiresAt: rows[0].claimExpiresAt,
  }
}

export type CreateRemovalRetryChildResult =
  | {
      ok: true
      child: {
        id: string
        circleId: string | null
        targetUserId: string | null
        requestingUserId: string | null
        nexconnUserId: string
        groupId: string | null
        status: string
        idempotencyKey: string
        createdAt: Date
      }
    }
  | {
      ok: false
      reason:
        | 'not_found'
        | 'not_failed'
        | 'already_has_child'
        | 'duplicate_key'
        | 'invalid_input'
    }

/**
 * Creates at most one retry child from a FAILED NexconnRemovalRecord source.
 *
 * Callers MUST invoke this helper inside `prisma.$transaction()` and pass the
 * transaction client as `tx`. TypeScript does not enforce this boundary; it is
 * a caller contract. Without a transaction, the source-row lock and child
 * insertion are not atomic, and duplicate retry children can be created under
 * concurrency.
 *
 * @param tx Prisma transaction client (must be from `prisma.$transaction()`)
 * @param sourceRecordId ID of the FAILED source removal record
 * @param idempotencyKey New, non-empty idempotency key for the retry child
 */
export async function createNexconnRemovalRetryChild(
  tx: Prisma.TransactionClient,
  sourceRecordId: string,
  idempotencyKey: string,
): Promise<CreateRemovalRetryChildResult> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    return { ok: false, reason: 'invalid_input' }
  }

  if (!sourceRecordId || typeof sourceRecordId !== 'string') {
    return { ok: false, reason: 'invalid_input' }
  }

  // Step 1: Lock the source row to serialize concurrent retry requests.
  const sourceRows = await tx.$queryRawUnsafe<Array<{
    id: string
    status: string
    retrySourceId: string | null
    circleId: string | null
    targetUserId: string | null
    requestingUserId: string | null
    nexconnUserId: string
    groupId: string | null
  }>>(
    `SELECT "id", "status", "retrySourceId", "circleId", "targetUserId",
            "requestingUserId", "nexconnUserId", "groupId"
     FROM "NexconnRemovalRecord"
     WHERE "id" = $1
     FOR UPDATE`,
    sourceRecordId
  )

  if (sourceRows.length === 0) {
    return { ok: false, reason: 'not_found' }
  }

  const source = sourceRows[0]

  // Step 2: Require FAILED status — only FAILED originals can be retried.
  if (source.status !== 'FAILED') {
    return { ok: false, reason: 'not_failed' }
  }

  // Step 3: Require retrySourceId IS NULL — a retry child cannot become a source.
  if (source.retrySourceId !== null) {
    return { ok: false, reason: 'already_has_child' }
  }

  // Step 4: Check for an existing retry child first.
  const existingChildRows = await tx.$queryRawUnsafe<Array<{
    id: string
    circleId: string | null
    targetUserId: string | null
    requestingUserId: string | null
    nexconnUserId: string
    groupId: string | null
    status: string
    idempotencyKey: string
    createdAt: Date
  }>>(
    `SELECT "id", "circleId", "targetUserId", "requestingUserId",
            "nexconnUserId", "groupId", "status", "idempotencyKey", "createdAt"
     FROM "NexconnRemovalRecord"
     WHERE "retrySourceId" = $1`,
    sourceRecordId
  )

  if (existingChildRows.length === 1) {
    // An existing retry child exists. If the supplied idempotency key matches
    // the child's own key, return the child (idempotent retry). If the key is
    // used by an unrelated record, return duplicate_key. If the key is unused,
    // return the existing child (recovery path).
    if (existingChildRows[0].idempotencyKey === idempotencyKey) {
      return { ok: true, child: existingChildRows[0] }
    }

    const keyCollisionRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id"
       FROM "NexconnRemovalRecord"
       WHERE "idempotencyKey" = $1`,
      idempotencyKey
    )

    if (keyCollisionRows.length > 0) {
      return { ok: false, reason: 'duplicate_key' }
    }

    return { ok: true, child: existingChildRows[0] }
  }

  if (existingChildRows.length > 1) {
    throw new Error('Unexpected: multiple retry children for the same source record')
  }

  // Step 5: No existing child. Pre-insert idempotency-key check: if the
  // supplied key is already used by an unrelated record, reject.
  const keyCollisionRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id"
     FROM "NexconnRemovalRecord"
     WHERE "idempotencyKey" = $1`,
    idempotencyKey
  )

  if (keyCollisionRows.length > 0) {
    return { ok: false, reason: 'duplicate_key' }
  }

  // Step 6: Insert one retry child inside a savepoint so a unique-key
  // collision does not abort the caller's transaction.
  const childId = crypto.randomUUID()

  await tx.$executeRawUnsafe(`SAVEPOINT retry_child_insert_savepoint`)

  try {
    const childRows = await tx.$queryRawUnsafe<Array<{
      id: string
      circleId: string | null
      targetUserId: string | null
      requestingUserId: string | null
      nexconnUserId: string
      groupId: string | null
      status: string
      idempotencyKey: string
      createdAt: Date
    }>>(
      `INSERT INTO "NexconnRemovalRecord"
       ("id", "circleId", "targetUserId", "requestingUserId", "nexconnUserId",
        "groupId", "status", "claimedBy", "claimExpiresAt", "retrySourceId",
        "idempotencyKey", "nexconnError", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9, NULL, clock_timestamp(), clock_timestamp())
       RETURNING "id", "circleId", "targetUserId", "requestingUserId",
                 "nexconnUserId", "groupId", "status", "idempotencyKey", "createdAt"`,
      childId,
      source.circleId,
      source.targetUserId,
      source.requestingUserId,
      source.nexconnUserId,
      source.groupId,
      'PENDING',
      sourceRecordId,
      idempotencyKey
    )

    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT retry_child_insert_savepoint`)

    if (childRows.length !== 1) {
      throw new Error('Failed to create retry child')
    }

    return { ok: true, child: childRows[0] }
  } catch (err) {
    // Restore transaction usability before classifying the error.
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT retry_child_insert_savepoint`)
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT retry_child_insert_savepoint`)

    // Only classify idempotencyKey unique violations as duplicate_key.
    const isIdempotencyKeyViolation =
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      (
        (Array.isArray(err.meta?.target) &&
          err.meta.target.includes('idempotencyKey')) ||
        (typeof err.message === 'string' &&
          err.message.includes('NexconnRemovalRecord_idempotencyKey_key'))
      )

    if (isIdempotencyKeyViolation) {
      return { ok: false, reason: 'duplicate_key' }
    }
    throw err
  }
}

export type NoChannelRemovalResult =
  | {
      ok: true
      status: 'REMOVED'
      removalRecordId: string
      circleId: string
      targetUserId: string
      requestingUserId: string
      replayed: boolean
    }
  | {
      ok: false
      reason:
        | 'circle_not_found'
        | 'requester_not_member'
        | 'requester_insufficient_role'
        | 'target_not_member'
        | 'last_leader_protection'
        | 'channel_appeared_use_channel_flow'
        | 'idempotency_key_collision'
        | 'existing_operation_pending'
        | 'existing_operation_unknown'
        | 'existing_operation_failed'
        | 'invalid_input'
      removalRecordId?: string
      status?: string
    }

/**
 * Remove a Circle member when no CircleNexconnChannel exists, creating a
 * terminal NexconnRemovalRecord with groupId NULL inside one transaction.
 *
 * Lock order: Circle row → CircleNexconnChannel row (re-read under lock).
 * All writes (CircleMember DELETE + NexconnRemovalRecord INSERT) are scoped
 * by a savepoint so an idempotency-key collision rolls back both writes.
 *
 * Callers MUST invoke this helper inside `prisma.$transaction()` and pass the
 * transaction client as `tx`. TypeScript does not enforce this boundary; it is
 * a caller contract.
 *
 * @param tx Prisma transaction client (must be from `prisma.$transaction()`)
 * @param circleId ID of the Circle
 * @param targetUserId ID of the member to remove
 * @param requestingUserId ID of the requesting member (must be ELDER/ADMIN)
 * @param idempotencyKey Globally unique idempotency key
 */
export async function removeMemberNoChannel(
  tx: Prisma.TransactionClient,
  circleId: string,
  targetUserId: string,
  requestingUserId: string,
  idempotencyKey: string,
): Promise<NoChannelRemovalResult> {
  // Step 1: Validate inputs.
  if (!circleId || typeof circleId !== 'string') {
    return { ok: false, reason: 'invalid_input' }
  }

  if (!targetUserId || typeof targetUserId !== 'string') {
    return { ok: false, reason: 'invalid_input' }
  }

  if (!requestingUserId || typeof requestingUserId !== 'string') {
    return { ok: false, reason: 'invalid_input' }
  }

  if (
    !idempotencyKey ||
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.trim().length === 0
  ) {
    return { ok: false, reason: 'invalid_input' }
  }

  // Step 2: Lock Circle row.
  const circleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Circle" WHERE id = $1 FOR UPDATE`,
    circleId
  )

  // Step 3: Return circle_not_found if missing.
  if (circleRows.length === 0) {
    return { ok: false, reason: 'circle_not_found' }
  }

  // Step 4: Read requester's CircleMember row under the Circle lock.
  const requesterRows = await tx.$queryRawUnsafe<Array<{
    userId: string
    circleId: string
    role: string
  }>>(
    `SELECT "userId", "circleId", "role"
     FROM "CircleMember"
     WHERE "userId" = $1 AND "circleId" = $2`,
    requestingUserId, circleId
  )

  // Step 5: Verify current database role is ELDER or ADMIN.
  if (requesterRows.length === 0) {
    return { ok: false, reason: 'requester_not_member' }
  }

  const requesterRole = requesterRows[0].role
  if (requesterRole !== MemberRole.ELDER && requesterRole !== MemberRole.ADMIN) {
    return { ok: false, reason: 'requester_insufficient_role' }
  }

  // Step 6: Look up the global idempotency key.
  const idempotencyRows = await tx.$queryRawUnsafe<Array<{
    id: string
    circleId: string | null
    targetUserId: string | null
    requestingUserId: string | null
    status: string
  }>>(
    `SELECT "id", "circleId", "targetUserId", "requestingUserId", "status"
     FROM "NexconnRemovalRecord"
     WHERE "idempotencyKey" = $1`,
    idempotencyKey
  )

  // Step 7-9: Apply replay identity checks using circleId, targetUserId,
  // and requestingUserId.
  if (idempotencyRows.length === 1) {
    const existing = idempotencyRows[0]

    if (
      existing.circleId !== circleId ||
      existing.targetUserId !== targetUserId ||
      existing.requestingUserId !== requestingUserId
    ) {
      // Same key, different identity → collision.
      return { ok: false, reason: 'idempotency_key_collision' }
    }

    // Same identity → replay semantics by status.
    if (existing.status === 'PENDING') {
      return {
        ok: false,
        reason: 'existing_operation_pending',
        removalRecordId: existing.id,
        status: existing.status,
      }
    }

    if (existing.status === 'UNKNOWN') {
      return {
        ok: false,
        reason: 'existing_operation_unknown',
        removalRecordId: existing.id,
        status: existing.status,
      }
    }

    if (existing.status === 'REMOVED') {
      // Successful replay — no mutation.
      return {
        ok: true,
        status: 'REMOVED',
        removalRecordId: existing.id,
        circleId,
        targetUserId,
        requestingUserId,
        replayed: true,
      }
    }

    if (existing.status === 'FAILED') {
      return {
        ok: false,
        reason: 'existing_operation_failed',
        removalRecordId: existing.id,
        status: existing.status,
      }
    }

    // Defensive: unknown status should not occur.
    return { ok: false, reason: 'invalid_input' }
  }

  if (idempotencyRows.length > 1) {
    throw new Error('Unexpected: multiple removal records matched idempotency key')
  }

  // Step 10: Re-read CircleNexconnChannel under Circle lock.
  const channelRows = await tx.$queryRawUnsafe<Array<{
    circleId: string
    groupId: string
  }>>(
    `SELECT "circleId", "groupId"
     FROM "CircleNexconnChannel"
     WHERE "circleId" = $1`,
    circleId
  )

  // Step 11: If channel exists, return channel_appeared_use_channel_flow.
  if (channelRows.length > 0) {
    return { ok: false, reason: 'channel_appeared_use_channel_flow' }
  }

  // Step 12-13: Check for existing PENDING/UNKNOWN record for same Circle+target.
  const activeRows = await tx.$queryRawUnsafe<Array<{
    id: string
    status: string
  }>>(
    `SELECT "id", "status"
     FROM "NexconnRemovalRecord"
     WHERE "circleId" = $1
       AND "targetUserId" = $2
       AND "status" IN ('PENDING', 'UNKNOWN')`,
    circleId, targetUserId
  )

  if (activeRows.length === 1) {
    return {
      ok: false,
      reason: activeRows[0].status === 'PENDING'
        ? 'existing_operation_pending'
        : 'existing_operation_unknown',
      removalRecordId: activeRows[0].id,
      status: activeRows[0].status,
    }
  }

  if (activeRows.length > 1) {
    throw new Error('Unexpected: multiple active removal records for same circle and target')
  }

  // Step 14: Read target CircleMember.
  const targetRows = await tx.$queryRawUnsafe<Array<{
    userId: string
    circleId: string
    role: string
  }>>(
    `SELECT "userId", "circleId", "role"
     FROM "CircleMember"
     WHERE "userId" = $1 AND "circleId" = $2`,
    targetUserId, circleId
  )

  if (targetRows.length === 0) {
    return { ok: false, reason: 'target_not_member' }
  }

  // Step 15: Apply last-leader protection using current database state.
  const targetRole = targetRows[0].role
  if (targetRole === MemberRole.ELDER || targetRole === MemberRole.ADMIN) {
    const leaderCountRows = await tx.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count
       FROM "CircleMember"
       WHERE "circleId" = $1
         AND ("role" = $2 OR "role" = $3)`,
      circleId, MemberRole.ELDER, MemberRole.ADMIN
    )

    const leaderCount = parseInt(leaderCountRows[0].count, 10)
    if (leaderCount <= 1) {
      return { ok: false, reason: 'last_leader_protection' }
    }
  }

  // Step 16: Create a uniquely named savepoint BEFORE both writes.
  const savepointName = `remove_member_no_channel_savepoint_${crypto.randomUUID().replace(/-/g, '')}`

  await tx.$executeRawUnsafe(`SAVEPOINT "${savepointName}"`)

  try {
    // Step 17: Delete target CircleMember.
    const deleteResult = await tx.$executeRawUnsafe<number>(
      `DELETE FROM "CircleMember"
       WHERE "userId" = $1 AND "circleId" = $2`,
      targetUserId, circleId
    )

    if (deleteResult !== 1) {
      throw new Error('CircleMember deletion did not affect exactly one row')
    }

    // Step 18: Insert terminal REMOVED NexconnRemovalRecord.
    const nexconnUserId = toNexconnUserId(targetUserId)
    const insertRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "NexconnRemovalRecord"
       ("id", "circleId", "targetUserId", "requestingUserId", "nexconnUserId",
        "groupId", "status", "claimedBy", "claimExpiresAt", "retrySourceId",
        "idempotencyKey", "nexconnError", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9, NULL, clock_timestamp(), clock_timestamp())
       RETURNING "id"`,
      crypto.randomUUID(),
      circleId,
      targetUserId,
      requestingUserId,
      nexconnUserId,
      null,
      'REMOVED',
      null,
      idempotencyKey
    )

    if (insertRows.length !== 1) {
      throw new Error('Failed to insert removal record')
    }

    // Step 19: Release savepoint and return success.
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT "${savepointName}"`)

    return {
      ok: true,
      status: 'REMOVED',
      removalRecordId: insertRows[0].id,
      circleId,
      targetUserId,
      requestingUserId,
      replayed: false,
    }
  } catch (err) {
    // Roll back both writes on any error.
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT "${savepointName}"`)
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT "${savepointName}"`)

    // Classify idempotencyKey P2002 using the same approach as
    // createNexconnRemovalRetryChild.
    const isIdempotencyKeyViolation =
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      (
        (Array.isArray(err.meta?.target) &&
          err.meta.target.includes('idempotencyKey')) ||
        (typeof err.message === 'string' &&
          err.message.includes('NexconnRemovalRecord_idempotencyKey_key'))
      )

    if (isIdempotencyKeyViolation) {
      return { ok: false, reason: 'idempotency_key_collision' }
    }

    throw err
  }
}

export type FinalizeRemovalRecordResult =
  | {
      ok: true
      status: 'REMOVED' | 'FAILED' | 'UNKNOWN'
      id: string
      claimedByCleared: boolean
    }
  | {
      ok: false
      reason:
        | 'not_found'
        | 'already_terminal'
        | 'lease_expired'
        | 'claim_expired'
        | 'invalid_input'
      existingStatus?: 'PENDING' | 'UNKNOWN' | 'REMOVED' | 'FAILED'
    }

/**
 * Finalize a NexconnRemovalRecord by transitioning it from PENDING or UNKNOWN
 * to REMOVED, FAILED, or UNKNOWN under full lease and claim fencing.
 *
 * Lock order: Circle row → CircleNexconnChannel row → NexconnRemovalRecord row.
 * All expiry checks use PostgreSQL clock_timestamp(); JavaScript time is never
 * used for lease or claim validity.
 *
 * Callers MUST invoke this helper inside `prisma.$transaction()` and pass the
 * transaction client as `tx`. TypeScript does not enforce this boundary; it is
 * a caller contract.
 *
 * @param tx Prisma transaction client (must be from `prisma.$transaction()`)
 * @param removalRecordId ID of the removal record to finalize
 * @param ownerToken Sync lease owner token that claimed this record
 * @param newStatus Target status: 'REMOVED', 'FAILED', or 'UNKNOWN'
 * @param nexconnError Optional Nexconn error message
 */
export async function finalizeNexconnRemovalRecord(
  tx: Prisma.TransactionClient,
  removalRecordId: string,
  ownerToken: string,
  newStatus: 'REMOVED' | 'FAILED' | 'UNKNOWN',
  nexconnError: string | null,
): Promise<FinalizeRemovalRecordResult> {
  // Validate inputs.
  if (!removalRecordId || typeof removalRecordId !== 'string') {
    return { ok: false, reason: 'invalid_input' }
  }

  if (
    !ownerToken ||
    typeof ownerToken !== 'string' ||
    ownerToken.trim().length === 0
  ) {
    return { ok: false, reason: 'invalid_input' }
  }

  if (newStatus !== 'REMOVED' && newStatus !== 'FAILED' && newStatus !== 'UNKNOWN') {
    return { ok: false, reason: 'invalid_input' }
  }

  // Validate nexconnError consistency per target status.
  if (newStatus === 'REMOVED' && nexconnError !== null) {
    return { ok: false, reason: 'invalid_input' }
  }
  if ((newStatus === 'FAILED' || newStatus === 'UNKNOWN') &&
      (!nexconnError || typeof nexconnError !== 'string' || nexconnError.trim().length === 0)) {
    return { ok: false, reason: 'invalid_input' }
  }

  // Step 1: Read the removal record without taking a record lock, solely to
  // discover its Circle ID.
  const recordRows = await tx.$queryRawUnsafe<Array<{
    id: string
    circleId: string | null
    status: string
    claimedBy: string | null
    claimExpiresAt: Date | null
  }>>(
    `SELECT "id", "circleId", "status", "claimedBy", "claimExpiresAt"
     FROM "NexconnRemovalRecord"
     WHERE "id" = $1`,
    removalRecordId
  )

  if (recordRows.length === 0) {
    return { ok: false, reason: 'not_found' }
  }

  const record = recordRows[0]

  // Already-terminal records return an idempotent result without modification.
  if (record.status === 'REMOVED' || record.status === 'FAILED') {
    return {
      ok: false,
      reason: 'already_terminal',
      existingStatus: record.status as 'REMOVED' | 'FAILED',
    }
  }

  // Only PENDING or UNKNOWN can be finalized.
  if (record.status !== 'PENDING' && record.status !== 'UNKNOWN') {
    return { ok: false, reason: 'invalid_input', existingStatus: record.status as 'PENDING' | 'UNKNOWN' | 'REMOVED' | 'FAILED' }
  }

  if (!record.circleId) {
    return { ok: false, reason: 'not_found' }
  }

  const circleId = record.circleId

  // Step 2: Lock Circle row.
  const circleRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Circle" WHERE id = $1 FOR UPDATE`,
    circleId
  )

  if (circleRows.length === 0) {
    return { ok: false, reason: 'not_found' }
  }

  // Step 3: Lock CircleNexconnChannel row.
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
    return { ok: false, reason: 'not_found' }
  }

  const channel = channelRows[0]

  // Step 4: Verify matching lease owner and unexpired lease using clock_timestamp().
  const timeRows = await tx.$queryRawUnsafe<{ now: Date }[]>(
    `SELECT clock_timestamp() AS now`
  )
  const dbNow = timeRows[0].now

  if (
    channel.syncLockOwner !== ownerToken ||
    channel.syncLockExpiresAt === null ||
    channel.syncLockExpiresAt <= dbNow
  ) {
    return { ok: false, reason: 'lease_expired' }
  }

  // Step 5: Lock NexconnRemovalRecord row.
  const lockedRecordRows = await tx.$queryRawUnsafe<Array<{
    id: string
    circleId: string | null
    status: string
    claimedBy: string | null
    claimExpiresAt: Date | null
  }>>(
    `SELECT "id", "circleId", "status", "claimedBy", "claimExpiresAt"
     FROM "NexconnRemovalRecord"
     WHERE "id" = $1
     FOR UPDATE`,
    removalRecordId
  )

  if (lockedRecordRows.length === 0) {
    return { ok: false, reason: 'not_found' }
  }

  const lockedRecord = lockedRecordRows[0]

  // Step 6: Verify record belongs to expected Circle, status is claimable,
  // claimedBy matches owner, and claim has not expired.
  if (lockedRecord.circleId !== circleId) {
    return { ok: false, reason: 'not_found' }
  }

  if (lockedRecord.status !== 'PENDING' && lockedRecord.status !== 'UNKNOWN') {
    return { ok: false, reason: 'already_terminal', existingStatus: lockedRecord.status as 'REMOVED' | 'FAILED' }
  }

  if (
    lockedRecord.claimedBy !== ownerToken ||
    lockedRecord.claimExpiresAt === null ||
    lockedRecord.claimExpiresAt <= dbNow
  ) {
    return { ok: false, reason: 'claim_expired' }
  }

  // Step 7: Conditional UPDATE — repeats all ownership and expiry predicates
  // at execution time inside PostgreSQL. Uses RETURNING so the exact number of
  // updated rows is observable rather than relying on $executeRawUnsafe row
  // count semantics.
  const updatedRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `UPDATE "NexconnRemovalRecord" r
     SET "status" = $1,
         "nexconnError" = $2,
         "claimedBy" = NULL,
         "claimExpiresAt" = NULL,
         "updatedAt" = clock_timestamp()
     FROM "CircleNexconnChannel" c
     WHERE r."id" = $3
       AND r."circleId" = c."circleId"
       AND c."circleId" = $4
       AND c."syncLockOwner" = $5
       AND c."syncLockExpiresAt" > clock_timestamp()
       AND r."claimedBy" = $6
       AND r."claimExpiresAt" > clock_timestamp()
       AND r."status" IN ('PENDING', 'UNKNOWN')
     RETURNING "id"`,
    newStatus, nexconnError, removalRecordId, circleId, ownerToken, ownerToken
  )

  // Step 8: Require exactly one updated row; otherwise throw.
  if (updatedRows.length === 0) {
    throw new Error(
      'Lease or claim expired before removal record finalization; no rows updated'
    )
  }

  if (updatedRows.length > 1) {
    throw new Error(
      'Unexpected: multiple removal records matched finalization predicate'
    )
  }

  return {
    ok: true,
    status: newStatus,
    id: updatedRows[0].id,
    claimedByCleared: true,
  }
}
