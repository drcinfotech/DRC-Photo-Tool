import { Link } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span>Photo<strong>Tools</strong> Pro</span>
          <p>Free online image editing tools. No signup, no watermark, no limits.</p>
        </div>
        <div className="footer-links">
          <h4>Tools</h4>
          <Link to="/background-remover">Background Remover</Link>
          <Link to="/transparency-editor">Transparency Editor</Link>
          <Link to="/image-resizer">Image Resizer</Link>
          <Link to="/image-compressor">Image Compressor</Link>
          <Link to="/image-cropper">Image Cropper</Link>
          <Link to="/format-converter">Format Converter</Link>
          <Link to="/base64-converter">Base64 Converter</Link>
          <Link to="/face-match">Face Match Finder</Link>
          <Link to="/ai-image-generator">AI Image Generator</Link>
        </div>
        <div className="footer-links">
          <h4>Features</h4>
          <span>100% Free</span>
          <span>No Signup Required</span>
          <span>No Watermarks</span>
          <span>Privacy First - Local Processing</span>
          <span>Works on Mobile</span>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; 2026 DRC PhotoTools Pro. All processing happens in your browser. Your images never leave your device.</p>
      </div>
    </footer>
  )
}
