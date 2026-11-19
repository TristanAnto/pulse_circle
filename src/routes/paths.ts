export const paths = {
  landing: '/',
  signIn: '/sign-in',
  register: '/register',
  dashboard: '/dashboard',
  checkIn: '/check-in',
  messages: '/messages',
} as const

export type AppPath = (typeof paths)[keyof typeof paths]

export const notFoundPath = '*'
