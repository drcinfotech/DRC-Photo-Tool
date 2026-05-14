import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ToolPage.css'
import './Pricing.css'

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'Perfect for occasional use',
    color: 'var(--text2)',
    features: [
      { text: 'Background Remover (Color-based)', included: true },
      { text: 'Transparency Editor', included: true },
      { text: 'Image Resizer', included: true },
      { text: 'Image Cropper', included: true },
      { text: 'Format Converter', included: true },
      { text: 'Base64 Converter', included: true },
      { text: 'AI Background Removal — 3/day', included: true },
      { text: 'AI Image Generator — 5/day', included: true },
      { text: 'Face Match — 1 ZIP/day (max 50 images)', included: true },
      { text: 'Image Compressor — max 5MB', included: true },
      { text: 'Batch Processing', included: false },
      { text: 'Priority Processing', included: false },
      { text: 'No Watermark on AI Images', included: false },
      { text: 'API Access', included: false },
    ],
    cta: 'Current Plan',
    ctaDisabled: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9',
    period: '/month',
    desc: 'For creators & small businesses',
    color: 'var(--accent)',
    popular: true,
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'AI Background Removal — Unlimited', included: true },
      { text: 'AI Image Generator — 100/day', included: true },
      { text: 'Face Match — Unlimited ZIPs (max 500 images)', included: true },
      { text: 'Image Compressor — max 50MB', included: true },
      { text: 'Batch Processing (up to 50 images)', included: true },
      { text: 'Priority Processing Speed', included: true },
      { text: 'No Watermark on AI Images', included: true },
      { text: 'HD AI Generations (up to 2048px)', included: true },
      { text: 'API Access', included: false },
      { text: 'Custom Branding', included: false },
      { text: 'Team Management', included: false },
    ],
    cta: 'Start Pro Trial',
    ctaDisabled: false,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$29',
    period: '/month',
    desc: 'For teams & enterprises',
    color: 'var(--accent2)',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'AI Background Removal — Unlimited', included: true },
      { text: 'AI Image Generator — Unlimited', included: true },
      { text: 'Face Match — Unlimited (max 5000 images)', included: true },
      { text: 'Image Compressor — No size limit', included: true },
      { text: 'Batch Processing (up to 500 images)', included: true },
      { text: 'API Access with Key', included: true },
      { text: 'Custom Branding / White Label', included: true },
      { text: 'Team Management (up to 10 seats)', included: true },
      { text: 'Priority Email Support', included: true },
      { text: '4K AI Generations', included: true },
      { text: 'Custom Model Training', included: false },
    ],
    cta: 'Contact Sales',
    ctaDisabled: false,
  },
]

const faqs = [
  {
    q: 'Is the free plan really free?',
    a: 'Yes! Basic tools (resize, crop, compress, convert, transparency editor, base64) are completely free with no limits. AI features have daily limits on the free plan.',
  },
  {
    q: 'Do my images get uploaded to a server?',
    a: 'Basic tools run 100% in your browser — your images never leave your device. AI features (background removal, image generation) use secure APIs for processing.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, you can cancel your subscription at any time. No questions asked, no hidden fees.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'Yes, we offer a 7-day money-back guarantee on all paid plans.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit cards, debit cards, UPI, and PayPal through our secure payment partner Stripe.',
  },
]

export default function Pricing() {
  const [annual, setAnnual] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  const getPrice = (plan) => {
    if (plan.id === 'free') return '$0'
    const monthlyPrice = parseInt(plan.price.replace('$', ''))
    if (annual) return `$${Math.round(monthlyPrice * 0.8)}`
    return plan.price
  }

  return (
    <div className="tool-page fade-in">
      <div className="tool-header">
        <h1>Simple, Transparent Pricing</h1>
        <p>Start free. Upgrade when you need more power.</p>
      </div>

      {/* Billing Toggle */}
      <div className="pricing-toggle">
        <span className={!annual ? 'active' : ''}>Monthly</span>
        <button className="toggle-switch" onClick={() => setAnnual(!annual)}>
          <div className={`toggle-knob ${annual ? 'on' : ''}`}></div>
        </button>
        <span className={annual ? 'active' : ''}>Annual <small className="save-badge">Save 20%</small></span>
      </div>

      {/* Plans */}
      <div className="pricing-grid">
        {plans.map(plan => (
          <div key={plan.id} className={`pricing-card ${plan.popular ? 'popular' : ''}`}
            style={{ '--plan-color': plan.color }}>
            {plan.popular && <div className="popular-badge">Most Popular</div>}
            <div className="plan-header">
              <h3>{plan.name}</h3>
              <div className="plan-price">
                <strong>{getPrice(plan)}</strong>
                <span>{plan.id !== 'free' ? (annual ? '/month (billed annually)' : plan.period) : plan.period}</span>
              </div>
              <p>{plan.desc}</p>
            </div>
            <ul className="plan-features">
              {plan.features.map((f, i) => (
                <li key={i} className={f.included ? '' : 'disabled'}>
                  <span className="feature-check">{f.included ? '✓' : '✕'}</span>
                  {f.text}
                </li>
              ))}
            </ul>
            <button className={`plan-cta ${plan.popular ? 'primary' : ''}`}
              disabled={plan.ctaDisabled}>
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="pricing-faq">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-list">
          {faqs.map((faq, i) => (
            <div key={i} className={`faq-item ${openFaq === i ? 'open' : ''}`}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div className="faq-q">
                <span>{faq.q}</span>
                <span className="faq-arrow">{openFaq === i ? '−' : '+'}</span>
              </div>
              {openFaq === i && <div className="faq-a">{faq.a}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="pricing-cta-section">
        <h2>Ready to Get Started?</h2>
        <p>Join thousands of creators using DRC PhotoTools Pro every day.</p>
        <Link to="/" className="primary-btn ai-btn" style={{ display: 'inline-block', padding: '12px 32px', fontSize: '1rem' }}>
          Try Free Tools Now
        </Link>
      </div>
    </div>
  )
}
