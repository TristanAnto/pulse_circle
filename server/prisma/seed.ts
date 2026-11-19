import { PrismaClient, MemberRole, CheckInStatus } from '@prisma/client'

// Development seed script: POPULATES THE DATABASE WITH FICTIONAL DEMO DATA
// ONLY. Never use real personal information. Safe to re-run (uses upsert
// and skipDuplicates so it is idempotent).
//
// Requires:
//   DATABASE_URL pointing at a running PostgreSQL database
//   `npx prisma generate` run at least once
//
//   npx prisma db seed

const prisma = new PrismaClient()

const DEMO_USERS = [
  {
    fullName: 'Lakshmi Raman',
    email: 'lakshmi@example.invalid',
    phoneNumber: '+91-98765-43210',
    role: MemberRole.ELDER as const,
  },
  {
    fullName: 'Ravi Kumar',
    email: 'ravi@example.invalid',
    phoneNumber: '+91-98765-43211',
    role: MemberRole.NEIGHBOR as const,
  },
  {
    fullName: 'Meena Sundar',
    email: 'meena@example.invalid',
    phoneNumber: '+91-98765-43212',
    role: MemberRole.NEIGHBOR as const,
  },
  {
    fullName: 'Priya Raman',
    email: 'priya@example.invalid',
    phoneNumber: '+91-98765-43213',
    role: MemberRole.FAMILY as const,
  },
] as const

async function main() {
  console.log('Seeding Pulse Circle demonstration data...')

  const users: Record<string, typeof DEMO_USERS[number] & { id: string }> = {}

  for (const demoUser of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {},
      create: {
        fullName: demoUser.fullName,
        email: demoUser.email,
        phoneNumber: demoUser.phoneNumber,
        // passwordHash is intentionally null in this foundation stage —
        // authentication is not implemented yet.
        passwordHash: null,
      },
    })
    users[demoUser.email] = { ...demoUser, id: user.id }
    console.log(`Created/updated user ${user.fullName} (${user.id})`)
  }

  const lakshmi = users['lakshmi@example.invalid']

  const circle = await prisma.circle.upsert({
    where: { id: 'circle-lakshmi-demo' },
    update: {},
    create: {
      id: 'circle-lakshmi-demo',
      name: "Lakshmi's Circle",
      description:
        'Demonstration circle for the Pulse Circle backend foundation. ' +
        'Neighbours and family looking out for Lakshmi.',
    },
  })
  console.log(`Created/updated circle ${circle.name} (${circle.id})`)

  const memberships = [
    { user: lakshmi, role: MemberRole.ELDER },
    { user: users['ravi@example.invalid'], role: MemberRole.NEIGHBOR },
    { user: users['meena@example.invalid'], role: MemberRole.NEIGHBOR },
    { user: users['priya@example.invalid'], role: MemberRole.FAMILY },
  ]

  for (const membership of memberships) {
    await prisma.circleMember.upsert({
      where: { userId_circleId: { userId: membership.user.id, circleId: circle.id } },
      update: {},
      create: {
        userId: membership.user.id,
        circleId: circle.id,
        role: membership.role,
      },
    })
    console.log(
      `Membership ${membership.user.fullName} → ${membership.role} in ${circle.name}`,
    )
  }

  await prisma.checkInSchedule.upsert({
    where: { id: 'schedule-lakshmi-daily-0900' },
    update: {},
    create: {
      id: 'schedule-lakshmi-daily-0900',
      circleId: circle.id,
      scheduledTime: '09:00',
      timezone: 'Asia/Kolkata',
      isActive: true,
    },
  })
  console.log('Created/updated daily check-in schedule (09:00 Asia/Kolkata)')

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(8, 12, 0, 0)

  await prisma.checkIn.create({
    data: {
      userId: lakshmi.id,
      circleId: circle.id,
      status: CheckInStatus.COMPLETED,
      checkedInAt: yesterday,
    },
  })
  console.log('Created demonstration completed check-in for Lakshmi')

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
