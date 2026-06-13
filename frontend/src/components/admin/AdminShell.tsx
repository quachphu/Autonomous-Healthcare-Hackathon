import { NavLink, Outlet } from 'react-router-dom'

function IconUsers() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-5 w-5"
    >
      <circle cx="7" cy="6" r="3" />
      <path d="M2 17a5 5 0 0110 0M15 6a3 3 0 100-6M18 17a5 5 0 00-6-4.9" strokeLinecap="round" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-5 w-5"
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 5v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconList() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-5 w-5"
    >
      <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
    </svg>
  )
}

function IconBack() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-5 w-5"
    >
      <path d="M8 4l-6 6 6 6M2 10h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ADMIN_NAV_ITEMS = [
  { to: '/admin/users', label: 'Users', Icon: IconUsers },
  { to: '/admin/actions', label: 'Pending Actions', Icon: IconClock },
  { to: '/admin/audit', label: 'Audit Logs', Icon: IconList },
]

export default function AdminShell() {
  return (
    <div className="flex h-screen bg-nn-pale-sky">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-nn-muted/20 bg-white lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-nn-muted/10 px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nn-deep-blue text-white">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10 2L3 5v5c0 4.4 3 8.1 7 9 4-0.9 7-4.6 7-9V5L10 2Z" />
                <path d="M7 10l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-nn-deep-blue">Admin Panel</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {ADMIN_NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-nn-periwinkle/10 text-nn-deep-blue'
                    : 'text-nn-muted hover:bg-nn-periwinkle/5 hover:text-nn-deep-blue'
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-nn-muted/10 p-4">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-nn-muted transition-colors hover:bg-nn-periwinkle/5 hover:text-nn-deep-blue"
          >
            <IconBack />
            Back to Dashboard
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
