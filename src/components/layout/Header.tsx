import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useState } from 'react'

import { Avatar } from '@/components/ui/Avatar'
import { BrandMark } from '@/components/ui/BrandMark'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/auth'
import { paths } from '@/routes/paths'

import { pageTitles } from './navItems'

export function Header() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout, loading } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const title = pageTitles[pathname] ?? 'Pulse Circle'

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      setIsLoggingOut(false)
    }
    navigate(paths.signIn)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={paths.dashboard} className="lg:hidden">
            <BrandMark compact />
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge tone="attention" className="hidden sm:inline-flex">
            Demo data
          </StatusBadge>
          {user && (
            <div className="flex items-center gap-2">
              <Avatar name={user.fullName} size="sm" />
              <span className="hidden text-sm font-semibold sm:inline">
                {user.fullName}
              </span>
              <Button
                onClick={handleLogout}
                size="sm"
                disabled={isLoggingOut || loading}
                className="hidden sm:flex"
              >
                {isLoggingOut ? 'Signing out…' : 'Sign out'}
                <LogOut aria-hidden="true" className="ml-2 size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
