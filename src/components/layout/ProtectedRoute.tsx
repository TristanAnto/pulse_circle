import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/context/auth'
import { paths } from '@/routes/paths'

/**
 * Protects routes so they are only accessible to authenticated users.
 *
 * While AuthContext is initializing (loading === true), a loading state is
 * shown so redirects do not happen before authentication is determined.
 * If the user is unauthenticated after initialization, they are redirected to
 * /sign-in with the originally requested URL preserved in state.
 */
export function ProtectedRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-svh bg-canvas flex items-center justify-center">
        <p className="text-lg text-ink-muted">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Navigate
        to={paths.signIn}
        replace
        state={{ from: location }}
      />
    )
  }

  return <>{children}</>
}
