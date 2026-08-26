import { Link, useLocation } from "wouter";
import logo from "@/assets/mts-logo.png";
import {
  LayoutDashboard,
  Zap,
  Briefcase,
  Users,
  Webhook,
  Settings,
  LogOut,
  Bell,
  ScrollText,
  History,
} from "lucide-react";
import { PriceTicker } from "@/components/PriceTicker"; // ← adjust path if you placed it elsewhere

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/trade", label: "Trade Terminal", icon: Zap },
    { href: "/positions", label: "Positions", icon: Briefcase },
    { href: "/accounts", label: "Accounts", icon: Users },
    { href: "/webhooks", label: "Webhooks", icon: Webhook },
    { href: "/logs", label: "Logs", icon: ScrollText },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/history", label: "History", icon: History }, // ← add this
    { href: "/notifications", label: "Notifications", icon: Bell }, // ← add this
  ];

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div
        className="w-14 h-screen flex flex-col items-center shrink-0"
        style={{
          background: "hsl(var(--sidebar))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* Brand */}
        {/* Brand */}
<div
  className="h-14 w-full flex items-center justify-center shrink-0"
  style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
>
  <img src={logo} alt="My Trade Study" className="w-9 h-9 object-contain rounded-lg" />
</div>

        {/* Nav items */}
        <nav className="flex-1 w-full px-2 py-3 space-y-1 overflow-y-auto flex flex-col items-center">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href === "/trade" && location === "/tpsl");
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150"
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
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div
          className="w-full px-2 pb-3 pt-3 flex justify-center"
          style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
        >
          <button
            title="Sign Out"
            className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
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
              window.location.href = "/copytrading/login";
            }}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main content: ticker bar pinned at top, page content scrolls below it */}
      <main className="flex-1 h-screen flex flex-col overflow-hidden bg-background">
  <PriceTicker />
  <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
</main>
    </div>
  );
}