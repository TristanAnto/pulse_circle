import { createBrowserRouter } from 'react-router-dom'

import { CheckInPage } from '@/pages/CheckInPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { LandingPage } from '@/pages/LandingPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SignInPage } from '@/pages/SignInPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { paths, notFoundPath } from '@/routes/paths'

export const router = createBrowserRouter([
  { path: paths.landing, element: <LandingPage /> },
  { path: paths.signIn, element: <SignInPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: paths.dashboard, element: <DashboardPage /> },
      { path: paths.checkIn, element: <CheckInPage /> },
      { path: paths.messages, element: <MessagesPage /> },
    ],
  },
  { path: notFoundPath, element: <NotFoundPage /> },
])
