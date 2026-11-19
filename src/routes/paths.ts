export const paths = {
  landing: '/',
  signIn: '/sign-in',
  dashboard: '/dashboard',
  checkIn: '/check-in',
  messages: '/messages',
  notFound: '*',
} as const

export type AppPath = (typeof paths)[keyof typeof paths]
