import { Link, Route, Routes, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Biweekly from "./pages/finance/Biweekly";
import PaycheckEditor from "./pages/finance/PaycheckEditor";
import Bills from "./pages/finance/Bills";
import Subscriptions from "./pages/finance/Subscriptions";
import Debt from "./pages/finance/Debt";
import Cash from "./pages/finance/Cash";
import MonthlySummary from "./pages/finance/MonthlySummary";
import Journal from "./pages/journal/Journal";
import JournalSearch from "./pages/journal/JournalSearch";
import JournalLooseEnds from "./pages/journal/JournalLooseEnds";
import Fitness from "./pages/fitness/Fitness";
import Home from "./pages/Home";
import Login from "./pages/Login";
import PaydayCountdown from "./components/PaydayCountdown";

function WordmarkNav() {
  const { pathname } = useLocation();
  const section =
    pathname.startsWith("/journal") ? "Journal"
    : pathname.startsWith("/fitness") ? "Fitness"
    : "Finance";

  return (
    <Link to="/" className="wordmark-wrap" aria-label="Back to home">
      <span className="wordmark">
        <span className="wordmark-rule" aria-hidden="true" />
        {section}
      </span>
    </Link>
  );
}

type AuthState = "loading" | "authed" | "unauthed";

export default function App() {
  const [auth, setAuth] = useState<AuthState>("loading");

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => setAuth(r.ok ? "authed" : "unauthed"))
      .catch(() => setAuth("unauthed"));
  }, []);

  if (auth === "loading") return <div className="login-shell" />;
  if (auth === "unauthed") return <Login onLogin={() => setAuth("authed")} />;

  return <AuthedApp />;
}

function AuthedApp() {
  // Home carries its own monogram, clock, and progress bars — the masthead
  // (and the fixed top bar PaydayCountdown renders) would double all of it.
  const isHome = useLocation().pathname === "/";
  return (
    <div className="shell">
      {!isHome && (
        <header className="masthead">
          <div className="masthead-inner">
            <WordmarkNav />
            <PaydayCountdown />
          </div>
        </header>
      )}

      <main>
        <Routes>
          <Route path="/"                        element={<Home />} />
          <Route path="/finance"                 element={<Biweekly />} />
          <Route path="/finance/new"             element={<PaycheckEditor />} />
          <Route path="/finance/paycheck/:id"    element={<PaycheckEditor />} />
          <Route path="/finance/bills"           element={<Bills />} />
          <Route path="/finance/subscriptions"   element={<Subscriptions />} />
          <Route path="/finance/debt"            element={<Debt />} />
          <Route path="/finance/cash"            element={<Cash />} />
          <Route path="/finance/monthly"         element={<MonthlySummary />} />
          <Route path="/journal"                 element={<Journal />} />
          <Route path="/journal/search"          element={<JournalSearch />} />
          <Route path="/journal/loose-ends"      element={<JournalLooseEnds />} />
          <Route path="/fitness"                 element={<Fitness />} />
          <Route path="*"                        element={<NotFound />} />
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
