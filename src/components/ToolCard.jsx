import { Link } from 'react-router-dom'
import './ToolCard.css'

export default function ToolCard({ to, icon, title, description, color, badge }) {
  return (
    <Link to={to} className="tool-card" style={{ '--card-color': color }}>
      {badge && <span className="tool-badge">{badge}</span>}
      <div className="tool-card-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="tool-card-arrow">&rarr;</span>
    </Link>
  )
}
