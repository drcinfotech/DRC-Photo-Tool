import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Navbar.css'

const tools = [
  { path: '/background-remover', label: 'BG Remover' },
  { path: '/ai-image-generator', label: 'AI Generate' },
  { path: '/multi-view', label: '3D Views' },
  { path: '/rotate-360', label: '360° Rotate' },
  { path: '/image-to-gif', label: 'Image to GIF' },
  // { path: '/face-match', label: 'Face Match' },
  { path: '/image-resizer', label: 'Resizer' },
  { path: '/image-compressor', label: 'Compressor' },
  // { path: '/transparency-editor', label: 'Transparency' },
  { path: '/image-cropper', label: 'Cropper' },
  { path: '/format-converter', label: 'Converter' },
  { path: '/base64-converter', label: 'Base64' },
  { path: '/pricing', label: 'Pricing' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link to="/" className="nav-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>DRC Photo<strong>Tools</strong> <small>Pro</small></span>
        </Link>

        <div className={`nav-links ${open ? 'open' : ''}`}>
          {tools.map(t => (
            <Link
              key={t.path}
              to={t.path}
              className={`nav-link ${location.pathname === t.path ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Menu">
          <span className={open ? 'open' : ''}></span>
        </button>
      </div>
    </nav>
  )
}
