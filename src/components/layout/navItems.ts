import type { LucideIcon } from 'lucide-react'
import { ClipboardCheck, LayoutDashboard, MessageSquareText } from 'lucide-react'

import { paths } from '@/routes/paths'

export type NavItem = {
  to: string
  label: string
  shortLabel: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  {
    to: paths.dashboard,
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: LayoutDashboard,
  },
  {
    to: paths.checkIn,
    label: 'Daily check-in',
    shortLabel: 'Check-in',
    icon: ClipboardCheck,
  },
  {
    to: paths.messages,
    label: 'Messages',
    shortLabel: 'Messages',
    icon: MessageSquareText,
  },
]

export const pageTitles: Record<string, string> = {
  [paths.dashboard]: 'Dashboard',
  [paths.checkIn]: 'Daily check-in',
  [paths.messages]: 'Messages',
}
