import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/cn'
import { useAuth } from '@/context/auth'
import { paths } from '@/routes/paths'

import { navItems } from './navItems'

export function MobileNavigation() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
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
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch">
        {navItems.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-pulse-50 text-pulse-800'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )
              }
            >
              <item.icon aria-hidden="true" className="size-6" />
              <span>{item.shortLabel}</span>
            </NavLink>
          </li>
        ))}
        {user && (
          <li className="flex-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LogOut aria-hidden="true" className="size-6" />
              <span className="text-[10px]">
                {isLoggingOut ? 'Signing out…' : 'Sign out'}
              </span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  )
}
