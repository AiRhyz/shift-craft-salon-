import { APP_VERSION } from "@/lib/version";
import Link from "next/link";

export function Nav({ current }: { current: "home" | "plan" | "submit" }) {
  const tab = (href: string, key: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        current === key
          ? "bg-brand text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="no-print mb-6 flex items-center gap-2 border-b border-slate-200 pb-3">
      <span className="mr-2 text-sm font-bold text-slate-800">
        shift-craft-salon
        <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
          v{APP_VERSION}
        </span>
      </span>
      {tab("/", "home", "シフト表")}
      {tab("/plan", "plan", "シフト作成")}
      {tab("/submit", "submit", "希望提出")}
    </nav>
  );
}
