import ToolCard from '../components/ToolCard'
import './Home.css'

const tools = [
  {
    to: '/background-remover',
    title: 'Background Remover',
    description: 'Remove image backgrounds instantly. Auto-detect & manual refinement with edge smoothing.',
    color: '#e94560',
    badge: 'Popular',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 5h14v14H5z"/><path d="M9 9l6 6m0-6l-6 6"/>
      </svg>
    ),
  },
  // {
  //   to: '/transparency-editor',
  //   title: 'Transparency Editor',
  //   description: 'Magic wand, eraser & restore brush. Make any color transparent with adjustable tolerance.',
  //   color: '#7c3aed',
  //   icon: (
  //     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  //       <path d="M15 4V2m0 2v2m0-2h-4.5M5 8v12a2 2 0 002 2h10a2 2 0 002-2V8H5z"/>
  //       <path d="M9 4h6l1 4H8L9 4z"/>
  //     </svg>
  //   ),
  // },
  {
    to: '/image-resizer',
    title: 'Image Resizer',
    description: 'Resize to any dimension. Social media presets for Instagram, Facebook, Twitter, YouTube & more.',
    color: '#06b6d4',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
        <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
      </svg>
    ),
  },
  {
    to: '/image-compressor',
    title: 'Image Compressor',
    description: 'Reduce file size up to 90% without visible quality loss. See before & after comparison.',
    color: '#10b981',
    badge: 'Trending',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    to: '/image-cropper',
    title: 'Image Cropper',
    description: 'Free crop or use aspect ratio presets. Perfect for profile pictures, banners & thumbnails.',
    color: '#f59e0b',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.13 1L6 16a2 2 0 002 2h15"/><path d="M1 6.13L16 6a2 2 0 012 2v15"/>
      </svg>
    ),
  },
  {
    to: '/format-converter',
    title: 'Format Converter',
    description: 'Convert between PNG, JPG, WebP & SVG. Batch-ready with quality controls.',
    color: '#ec4899',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
        <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
        <line x1="4" y1="4" x2="9" y2="9"/>
      </svg>
    ),
  },
  {
    to: '/base64-converter',
    title: 'Base64 Converter',
    description: 'Convert files to Base64 and decode Base64 back to files. Supports images, PDF, Excel, CSV & more.',
    color: '#14b8a6',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  // {
  //   to: '/face-match',
  //   title: 'Face Match Finder',
  //   description: 'Upload a ZIP of images + a reference face. AI finds all matching faces and creates a downloadable ZIP.',
  //   color: '#8b5cf6',
  //   badge: 'AI',
  //   icon: (
  //     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  //       <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
  //     </svg>
  //   ),
  // },
  {
    to: '/ai-image-generator',
    title: 'AI Image Generator',
    description: 'Create stunning images from text prompts. Multiple styles — realistic, anime, 3D, watercolor & more.',
    color: '#a855f7',
    badge: 'AI',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  },
  {
    to: '/multi-view',
    title: '3D Multi-View Generator',
    description: 'Upload one front photo, get left, right, back & 3/4 views — like a 3D turnaround. Identity preserved.',
    color: '#f97316',
    badge: 'New',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
  {
    to: '/image-to-gif',
    title: 'Image to GIF',
    description: 'Combine 3+ images into an animated GIF. 6 animation styles — Normal, Bounce, Fade, Zoom, Slide. Set speed & loop.',
    color: '#84cc16',
    badge: 'New',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
        <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
        <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/>
        <line x1="17" y1="7" x2="22" y2="7"/>
      </svg>
    ),
  },
  {
    to: '/rotate-360',
    title: '360° Rotate Generator',
    description: 'Upload one image, AI creates a full 360° turnaround. Interactive viewer with drag & auto-play. Export all frames.',
    color: '#0ea5e9',
    badge: 'New',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        <path d="M12 3a15 15 0 010 18M12 3a15 15 0 000 18M3 12h18"/>
      </svg>
    ),
  },
]

const stats = [
  { value: '100%', label: 'Free Forever' },
  { value: '0', label: 'Signup Required' },
  { value: '0', label: 'Watermarks' },
  { value: '100%', label: 'Private & Secure' },
]

export default function Home() {
  return (
    <div className="home fade-in">
      {/* Hero */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">Free Online Photo Tools</div>
          <h1>
            Edit Images Like a Pro.<br />
            <span className="gradient-text">No Signup. No Watermark.</span>
          </h1>
          <p className="hero-desc">
            Professional image editing tools that run entirely in your browser.
            Remove backgrounds, resize, compress, crop & convert — all for free.
            Your images never leave your device.
          </p>
          <div className="hero-stats">
            {stats.map((s, i) => (
              <div key={i} className="stat-item">
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="tools-section">
        <h2>All Tools</h2>
        <p className="section-desc">Everything you need to edit images, completely free.</p>
        <div className="tools-grid">
          {tools.map(t => (
            <ToolCard key={t.to} {...t} />
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <h2>Why DRC PhotoTools Pro?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(233,69,96,0.1)', color: '#e94560' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h3>100% Private</h3>
            <p>All processing happens locally in your browser. Your images are never uploaded to any server.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3>Instant Results</h3>
            <p>No waiting for server processing. Get results in milliseconds with client-side algorithms.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <h3>No Limits</h3>
            <p>No file size limits, no daily usage caps, no watermarks. Use as much as you want, forever free.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </div>
            <h3>Mobile Friendly</h3>
            <p>Works perfectly on phones and tablets. Edit images on the go without installing any app.</p>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="comparison-section">
        <h2>How We Compare</h2>
        <p className="section-desc">See how DRC PhotoTools Pro stacks up against other popular tools.</p>
        <div className="table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="highlight-col">DRC PhotoTools Pro</th>
                <th>Remove.bg</th>
                <th>Canva</th>
                <th>Photoroom</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Background Removal</td><td className="highlight-col">&#10003;</td><td>&#10003;</td><td>&#10003;</td><td>&#10003;</td></tr>
              <tr><td>Image Resize</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10003;</td><td>&#10007;</td></tr>
              <tr><td>Image Compress</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10007;</td><td>&#10007;</td></tr>
              <tr><td>Format Convert</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10007;</td><td>&#10007;</td></tr>
              <tr><td>Transparency Edit</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10007;</td><td>&#10007;</td></tr>
              <tr><td>Crop Tool</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10003;</td><td>&#10003;</td></tr>
              <tr><td>Base64 Converter</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10007;</td><td>&#10007;</td></tr>
              <tr><td>No Signup</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10007;</td><td>&#10007;</td></tr>
              <tr><td>No Watermark</td><td className="highlight-col">&#10003;</td><td>Limited</td><td>&#10003;</td><td>Limited</td></tr>
              <tr><td>100% Free</td><td className="highlight-col">&#10003;</td><td>Limited</td><td>Limited</td><td>Limited</td></tr>
              <tr><td>Privacy (Local)</td><td className="highlight-col">&#10003;</td><td>&#10007;</td><td>&#10007;</td><td>&#10007;</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
