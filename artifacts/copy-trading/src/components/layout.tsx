import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Zap,
  Briefcase,
  ListOrdered,
  LineChart,
  Users,
  Webhook,
  ScrollText,
  Settings,
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/trade", label: "Trade Terminal", icon: Zap },
    { href: "/positions", label: "Positions", icon: Briefcase },
    { href: "/orders", label: "Orders", icon: ListOrdered },
    { href: "/pnl", label: "PnL Tracker", icon: LineChart },
    { href: "/accounts", label: "Accounts", icon: Users },
    // { href: "/select-accounts", label: "Select Accounts", icon: Users },
    { href: "/webhooks", label: "Webhooks", icon: Webhook },
    { href: "/logs", label: "Logs", icon: ScrollText },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <div
        className="w-52 flex flex-col shrink-0"
        style={{
          background: "hsl(var(--sidebar))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* Brand */}
        <div
          className="h-14 flex items-center px-4 gap-2.5 shrink-0"
          style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "hsl(var(--primary))", boxShadow: "0 0 12px hsl(var(--primary) / 0.4)" }}
          >
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <span
            className="font-bold text-sm tracking-wide"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "hsl(var(--sidebar-foreground))" }}
          >
            Copy<span style={{ color: "hsl(var(--primary))" }}>Trader</span>
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href === "/trade" && location === "/tpsl");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                style={
                  isActive
                    ? {
                        background: "hsl(258 82% 64% / 0.15)",
                        color: "hsl(var(--primary))",
                        boxShadow: "inset 2px 0 0 hsl(var(--primary))",
                      }
                    : { color: "hsl(var(--sidebar-foreground))" }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background =
                      "hsl(var(--sidebar-accent))";
                    (e.currentTarget as HTMLElement).style.color = "hsl(210 38% 94%)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color =
                      "hsl(var(--sidebar-foreground))";
                  }
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div
          className="px-2 pb-3 pt-3"
          style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{ color: "hsl(345 88% 62%)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "hsl(345 88% 58% / 0.1)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
            onClick={() => {
              localStorage.removeItem("ct_token");
              window.location.href = "/login";
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  );
}
