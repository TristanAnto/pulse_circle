import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import { BrandMark } from '@/components/ui/BrandMark'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/context/auth'
import { paths } from '@/routes/paths'

import { navItems } from './navItems'

export function Header() {
  const navigate = useNavigate()
  const { user, logout, loading } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 pt-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={paths.dashboard}>
              <BrandMark />
            </Link>
          </div>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
            <ul className="flex items-center gap-1">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'min-h-10 px-3 py-2 rounded-lg text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-pulse-700 text-white'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            {user && (
              <div className="flex items-center gap-2">
                <Avatar name={user.fullName} size="sm" />
                <span className="hidden text-sm font-semibold md:inline">
                  {user.fullName}
                </span>
                <Button
                  onClick={handleLogout}
                  size="sm"
                  disabled={isLoggingOut || loading}
                  className="hidden md:flex"
                >
                  {isLoggingOut ? 'Signing out…' : 'Sign out'}
                  <LogOut aria-hidden="true" className="ml-2 size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
