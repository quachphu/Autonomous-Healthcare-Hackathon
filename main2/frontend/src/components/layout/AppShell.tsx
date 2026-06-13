import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppShell() {
  return (
    <div className="flex h-full bg-nn-pale-sky">
      <Sidebar />
      {/* flex-1 + overflow-y-auto: pages decide whether they scroll */}
      <main className="flex flex-1 flex-col overflow-y-auto lg:ml-64">
        <Outlet />
      </main>
    </div>
  )
}
