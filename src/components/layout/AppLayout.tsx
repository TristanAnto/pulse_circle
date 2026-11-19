import { Outlet } from 'react-router-dom'

import { Header } from './Header'
import { MobileNavigation } from './MobileNavigation'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="min-h-svh bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-pulse-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <Sidebar />

      <div className="lg:pl-72">
        <Header />
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12"
        >
          <Outlet />
        </main>
      </div>

      <MobileNavigation />
    </div>
  )
}
