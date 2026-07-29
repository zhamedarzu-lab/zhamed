import { NavLink, Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Fitness from "./pages/Fitness";
import Journal from "./pages/Journal";
import JournalDay from "./pages/JournalDay";
import Biweekly from "./pages/finance/Biweekly";
import PaycheckEditor from "./pages/finance/PaycheckEditor";
import Bills from "./pages/finance/Bills";
import Debt from "./pages/finance/Debt";
import MonthlySummary from "./pages/finance/MonthlySummary";

export default function App() {
  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-inner">
          <Link to="/" className="wordmark">
            <span className="wordmark-rule" aria-hidden="true" />
            Tracker
          </Link>
          <nav className="tabs">
            <NavLink to="/finance">Finance</NavLink>
            <NavLink to="/fitness">Fitness</NavLink>
            <NavLink to="/journal">Journal</NavLink>
          </nav>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/finance" element={<Biweekly />} />
          <Route path="/finance/new" element={<PaycheckEditor />} />
          <Route path="/finance/paycheck/:id" element={<PaycheckEditor />} />
          <Route path="/finance/bills" element={<Bills />} />
          <Route path="/finance/debt" element={<Debt />} />
          <Route path="/finance/monthly" element={<MonthlySummary />} />
          <Route path="/fitness" element={<Fitness />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/journal/:date" element={<JournalDay />} />
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
      <Link to="/">Back to the dashboard</Link>
    </div>
  );
}
