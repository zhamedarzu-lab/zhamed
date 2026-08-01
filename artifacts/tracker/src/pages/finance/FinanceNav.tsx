import { useLocation, useNavigate } from "react-router-dom";

const views = [
  { to: "/finance", label: "Paychecks", short: "Pay" },
  { to: "/finance/monthly", label: "Monthly", short: "Mo." },
  { to: "/finance/bills", label: "Bills", short: "Bills" },
  { to: "/finance/subscriptions", label: "Subscriptions", short: "Subs" },
  { to: "/finance/debt", label: "Debt", short: "Debt" },
  { to: "/finance/cash", label: "Cash", short: "Cash" },
];

export default function FinanceNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="segmented nav-scroll" role="group" aria-label="Finance views">
      {views.map((v) => (
        <button
          key={v.to}
          type="button"
          aria-pressed={pathname === v.to}
          onClick={() => navigate(v.to)}
        >
          <span className="nav-label-full">{v.label}</span>
          <span className="nav-label-short">{v.short}</span>
        </button>
      ))}
    </div>
  );
}
