// Client-side deterrents. NOT real security — bypassable by anyone with intent.
// Real security = backend proxy for API keys. These block ~95% of casual users.

const BLOCK_PAGE_HTML = `
  <div style="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:#0b0b10;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px;">
    <div>
      <div style="font-size:48px;margin-bottom:16px;">🔒</div>
      <h1 style="font-size:20px;margin:0 0 8px;">Access Restricted</h1>
      <p style="color:#999;font-size:14px;margin:0;">Developer tools detected. Please close them to continue.</p>
    </div>
  </div>
`

let blockOverlay = null

const showBlock = () => {
  if (blockOverlay) return
  blockOverlay = document.createElement('div')
  blockOverlay.innerHTML = BLOCK_PAGE_HTML
  document.body.appendChild(blockOverlay)
}

const hideBlock = () => {
  if (!blockOverlay) return
  blockOverlay.remove()
  blockOverlay = null
}

export const initSecurity = () => {
  if (!import.meta.env.PROD) return

  // 1. Disable right-click
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    return false
  }, { capture: true })

  // 2. Block common DevTools/view-source shortcuts
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toUpperCase()
    if (
      k === 'F12' ||
      (e.ctrlKey && e.shiftKey && (k === 'I' || k === 'J' || k === 'C')) ||
      (e.ctrlKey && k === 'U') ||
      (e.ctrlKey && k === 'S')
    ) {
      e.preventDefault()
      e.stopPropagation()
      return false
    }
  }, { capture: true })

  // 3. Disable text selection (prevents easy copy of content)
  //    Keep inputs/textareas selectable.
  const noSelectStyle = document.createElement('style')
  noSelectStyle.textContent = `
    body { -webkit-user-select: none; -ms-user-select: none; user-select: none; }
    input, textarea, [contenteditable="true"] { -webkit-user-select: text; user-select: text; }
  `
  document.head.appendChild(noSelectStyle)

  // 4. Block drag (prevents image drag-to-save)
  document.addEventListener('dragstart', (e) => {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault()
  })

  // 5. Neutralize console (production)
  const noop = () => {}
  const methods = [
    'log', 'debug', 'info', 'warn', 'error', 'trace',
    'table', 'dir', 'dirxml', 'group', 'groupCollapsed',
    'groupEnd', 'time', 'timeEnd', 'timeLog', 'count',
    'assert', 'profile', 'profileEnd'
  ]
  try {
    methods.forEach((m) => { window.console[m] = noop })
  } catch { /* ignore */ }

  // 6. DevTools-open detector (window inner/outer size heuristic)
  //    When docked DevTools is open, there's a gap > ~160px.
  const THRESHOLD = 170
  const checkDevTools = () => {
    const widthGap = window.outerWidth - window.innerWidth
    const heightGap = window.outerHeight - window.innerHeight
    const isOpen = widthGap > THRESHOLD || heightGap > THRESHOLD
    if (isOpen) showBlock(); else hideBlock()
  }
  setInterval(checkDevTools, 1000)

  // 7. Debugger trap — DevTools open + "pause on exceptions" frustrates inspection.
  //    Using Function() so esbuild drop: ['debugger'] doesn't remove it at build time.
  const trap = new Function('debugger')
  setInterval(() => {
    const before = performance.now()
    try { trap() } catch { /* ignore */ }
    const after = performance.now()
    if (after - before > 100) showBlock()
  }, 2000)
}
