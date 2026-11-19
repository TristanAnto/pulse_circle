import { createBrowserRouter } from 'react-router-dom'

import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { CheckInPage } from '@/pages/CheckInPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { LandingPage } from '@/pages/LandingPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SignInPage } from '@/pages/SignInPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { paths, notFoundPath } from '@/routes/paths'

export const router = createBrowserRouter([
  { path: paths.landing, element: <LandingPage /> },
  { path: paths.signIn, element: <SignInPage /> },
  { path: paths.register, element: <RegisterPage /> },
  {
    element: <AppLayout />,
    children: [
      {
        path: paths.dashboard,
        element: (
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: paths.checkIn,
        element: (
          <ProtectedRoute>
            <CheckInPage />
          </ProtectedRoute>
        ),
      },
      {
        path: paths.messages,
        element: (
          <ProtectedRoute>
            <MessagesPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: notFoundPath, element: <NotFoundPage /> },
])
