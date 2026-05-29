import { Link } from "react-router-dom";

interface SummaryCardProps {
  count: number;
  label: string;
  href: string;
}

export default function SummaryCard({ count, label, href }: SummaryCardProps) {
  const isActive = count > 0;

  return (
    <Link
      to={href}
      className={`summary-card${isActive ? " active" : ""}`}
    >
      <div className="summary-card-count">{count}</div>
      <div className="summary-card-label">{label}</div>
    </Link>
  );
}
