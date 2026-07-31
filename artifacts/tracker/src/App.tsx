import { Link, Route, Routes, useLocation } from "react-router-dom";
import Biweekly from "./pages/finance/Biweekly";
import PaycheckEditor from "./pages/finance/PaycheckEditor";
import Bills from "./pages/finance/Bills";
import Subscriptions from "./pages/finance/Subscriptions";
import Debt from "./pages/finance/Debt";
import Cash from "./pages/finance/Cash";
import MonthlySummary from "./pages/finance/MonthlySummary";
import Journal from "./pages/journal/Journal";
import Fitness from "./pages/fitness/Fitness";
import PaydayCountdown from "./components/PaydayCountdown";

function WordmarkNav() {
  const { pathname } = useLocation();
  const section =
    pathname.startsWith("/journal") ? "Journal"
    : pathname.startsWith("/fitness") ? "Fitness"
    : "Finance";

  return (
    <div className="wordmark-wrap">
      <span className="wordmark">
        <span className="wordmark-rule" aria-hidden="true" />
        {section}
      </span>
      <nav className="wordmark-nav" aria-label="Sections">
        <Link to="/" className={section === "Finance" ? "active" : ""}>Finance</Link>
        <Link to="/journal" className={section === "Journal" ? "active" : ""}>Journal</Link>
        <Link to="/fitness" className={section === "Fitness" ? "active" : ""}>Fitness</Link>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-inner">
          <WordmarkNav />
          <PaydayCountdown />
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Biweekly />} />
          <Route path="/finance/new" element={<PaycheckEditor />} />
          <Route path="/finance/paycheck/:id" element={<PaycheckEditor />} />
          <Route path="/finance/bills" element={<Bills />} />
          <Route path="/finance/subscriptions" element={<Subscriptions />} />
          <Route path="/finance/debt" element={<Debt />} />
          <Route path="/finance/cash" element={<Cash />} />
          <Route path="/finance/monthly" element={<MonthlySummary />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/fitness" element={<Fitness />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="empty">
      <strong>That page isn't here</strong>
      <Link to="/">Back home</Link>
    </div>
  );
}
