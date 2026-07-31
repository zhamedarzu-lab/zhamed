import { Link, Route, Routes } from "react-router-dom";
import Biweekly from "./pages/finance/Biweekly";
import PaycheckEditor from "./pages/finance/PaycheckEditor";
import Bills from "./pages/finance/Bills";
import Subscriptions from "./pages/finance/Subscriptions";
import Debt from "./pages/finance/Debt";
import Cash from "./pages/finance/Cash";
import MonthlySummary from "./pages/finance/MonthlySummary";
import PaydayCountdown from "./components/PaydayCountdown";
export default function App() {
  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-inner">
          <Link to="/" className="wordmark">
            <span className="wordmark-rule" aria-hidden="true" />
            Finance
          </Link>
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
