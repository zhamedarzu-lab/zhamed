import { useLocation, useNavigate } from "react-router-dom";

const views = [
  { to: "/finance", label: "Biweekly" },
  { to: "/finance/monthly", label: "Monthly" },
  { to: "/finance/bills", label: "Bills" },
  { to: "/finance/debt", label: "Debt" },
];

export default function FinanceNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="segmented" role="group" aria-label="Finance views">
      {views.map((v) => (
        <button
          key={v.to}
          type="button"
          aria-pressed={pathname === v.to}
          onClick={() => navigate(v.to)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
