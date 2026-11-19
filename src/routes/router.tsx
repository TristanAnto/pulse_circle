import { createBrowserRouter } from 'react-router-dom'

import { RoutePlaceholder } from '@/components/feedback/RoutePlaceholder'
import { paths } from '@/routes/paths'

export const router = createBrowserRouter([
  { path: paths.landing, element: <RoutePlaceholder title="Welcome" /> },
  { path: paths.signIn, element: <RoutePlaceholder title="Sign in" /> },
  { path: paths.dashboard, element: <RoutePlaceholder title="Dashboard" /> },
  { path: paths.checkIn, element: <RoutePlaceholder title="Daily check-in" /> },
  { path: paths.messages, element: <RoutePlaceholder title="Messages" /> },
  { path: paths.notFound, element: <RoutePlaceholder title="Page not found" /> },
])
