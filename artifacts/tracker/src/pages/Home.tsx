import { useNavigate } from "react-router-dom";

const SECTIONS = [
  {
    key: "finance",
    label: "Finance",
    path: "/finance",
    icon: "💰",
    description: "Paychecks, bills, subscriptions, debt & cash",
    accent: "#e0b04e",
  },
  {
    key: "journal",
    label: "Journal",
    path: "/journal",
    icon: "📓",
    description: "Daily log, week view & punch clock",
    accent: "#6b9fd4",
  },
  {
    key: "fitness",
    label: "Fitness",
    path: "/fitness",
    icon: "🏃",
    description: "Workouts & progress tracking",
    accent: "#4ecb71",
  },
];

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="home-shell">
      <h1 className="home-title">zh</h1>
      <p className="home-sub">What are we looking at today?</p>
      <div className="home-cards">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            className="home-card"
            style={{ "--card-accent": s.accent } as React.CSSProperties}
            onClick={() => navigate(s.path)}
          >
            <span className="home-card-icon">{s.icon}</span>
            <span className="home-card-label">{s.label}</span>
            <span className="home-card-desc">{s.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
