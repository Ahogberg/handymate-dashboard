import './portal.css'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bp-page-bg">
      <div className="bp-mobile-shell">{children}</div>
    </div>
  )
}
