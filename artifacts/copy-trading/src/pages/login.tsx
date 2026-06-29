import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Step = "phone" | "otp" | "password";

async function apiFetch(path: string, body: object) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

const TICKERS = [
  { pair: "BTC/USDT", price: "67,842.50", change: "+2.14%" },
  { pair: "ETH/USDT", price: "3,541.20", change: "+1.87%" },
  { pair: "BNB/USDT", price: "412.80", change: "-0.43%" },
  { pair: "SOL/USDT", price: "182.35", change: "+5.21%" },
  { pair: "XRP/USDT", price: "0.6182", change: "+0.92%" },
  { pair: "DOGE/USDT", price: "0.1724", change: "-1.20%" },
  { pair: "ADA/USDT", price: "0.4891", change: "+3.07%" },
  { pair: "AVAX/USDT", price: "38.42", change: "+2.55%" },
  { pair: "MATIC/USDT", price: "0.8813", change: "-0.78%" },
  { pair: "LINK/USDT", price: "18.24", change: "+1.33%" },
  { pair: "DOT/USDT", price: "7.62", change: "+0.61%" },
  { pair: "UNI/USDT", price: "10.47", change: "-2.01%" },
];

function TickerRow({ reverse = false }: { reverse?: boolean }) {
  const items = reverse ? [...TICKERS].reverse() : TICKERS;
  const doubled = [...items, ...items];
  return (
    <div
      className="flex gap-6 whitespace-nowrap"
      style={{
        animation: `ticker-scroll${reverse ? "-rev" : ""} 40s linear infinite`,
        willChange: "transform",
      }}
    >
      {doubled.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-2 text-xs font-mono">
          <span style={{ color: "#4A5266" }}>{t.pair}</span>
          <span style={{ color: "#6B7280" }}>{t.price}</span>
          <span style={{ color: t.change.startsWith("+") ? "#00D4AA" : "#F87171" }}>
            {t.change}
          </span>
        </span>
      ))}
    </div>
  );
}

export function LoginPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const saveAndRedirect = (token: string) => {
    localStorage.setItem("ct_token", token);
    setLocation("/dashboard");
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone)) {
      toast({ title: "Invalid phone", description: "Enter a 10-digit mobile number", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiFetch("/auth/send-otp", { phone });
      toast({ title: "OTP sent", description: `Code sent to +91 ${phone}` });
      setStep("otp");
    } catch (err: any) {
      toast({ title: "Failed to send OTP", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4) {
      toast({ title: "Invalid OTP", description: "Enter the 4-digit OTP", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const data = await apiFetch("/auth/verify-otp", { phone, otp });
      saveAndRedirect(data.token);
    } catch (err: any) {
      toast({ title: "OTP failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsLoading(true);
    try {
      const data = await apiFetch("/auth/login", { phone, password });
      saveAndRedirect(data.token);
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const goToPassword = () => {
    if (!/^\d{10}$/.test(phone)) {
      toast({ title: "Enter phone first", description: "Enter your 10-digit phone number first", variant: "destructive" });
      return;
    }
    setOtp("");
    setPassword("");
    setStep("password");
  };

  return (
    <>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes ticker-scroll-rev {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-row { animation: none !important; }
        }
        .login-input {
          background: #0F1218 !important;
          border-color: #1E2433 !important;
          color: #E2E8F0 !important;
          font-family: monospace;
          letter-spacing: 0.04em;
          transition: border-color 0.15s;
        }
        .login-input:focus {
          border-color: #00D4AA !important;
          box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.1) !important;
          outline: none !important;
        }
        .login-input::placeholder { color: #3A4155 !important; }
        .login-btn {
          background: #00D4AA !important;
          color: #0A0C0F !important;
          font-weight: 700 !important;
          letter-spacing: 0.03em;
          transition: opacity 0.15s, transform 0.1s;
        }
        .login-btn:hover:not(:disabled) { opacity: 0.88 !important; transform: translateY(-1px); }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.4 !important; }
        .text-link {
          color: #00D4AA;
          text-decoration: none;
          font-size: 0.8rem;
          transition: opacity 0.15s;
        }
        .text-link:hover { opacity: 0.7; }
        .step-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #1E2433;
          transition: background 0.25s;
        }
        .step-dot.active { background: #00D4AA; }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "#0A0C0F",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ticker tape background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "28px",
            opacity: 0.6,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ overflow: "hidden" }}>
              <TickerRow reverse={i % 2 === 1} />
            </div>
          ))}
        </div>

        {/* Dark gradient overlay to focus attention on center */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 70% at 50% 50%, rgba(10,12,15,0.55) 0%, rgba(10,12,15,0.92) 70%, #0A0C0F 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Main content */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div style={{ width: "100%", maxWidth: "380px" }}>

            {/* Logo / Brand */}
            <div style={{ textAlign: "center", marginBottom: "36px" }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px", height: "48px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #00D4AA22, #00D4AA44)",
                border: "1px solid #00D4AA55",
                marginBottom: "16px",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <polyline points="2,17 7,12 11,16 17,8 22,12" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="22" cy="12" r="2" fill="#00D4AA"/>
                </svg>
              </div>
              <div style={{ color: "#E2E8F0", fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
                WealthFunds CopyTrader
              </div>
              <div style={{ color: "#4A5266", fontSize: "0.75rem", marginTop: "4px", fontFamily: "monospace", letterSpacing: "0.08em" }}>
                ADMIN TERMINAL
              </div>
            </div>

            {/* Card */}
            <div style={{
              background: "#111318",
              border: "1px solid #1A1F2E",
              borderRadius: "16px",
              padding: "32px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset",
            }}>

              {/* Step indicators */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "28px" }}>
                <div className={`step-dot ${step === "phone" || step === "otp" || step === "password" ? "active" : ""}`} />
                <div className={`step-dot ${step === "otp" || step === "password" ? "active" : ""}`} />
                <div className={`step-dot ${step === "password" ? "active" : ""}`} />
              </div>

              {/* Step title */}
              <div style={{ marginBottom: "24px" }}>
                <h1 style={{ color: "#E2E8F0", fontSize: "1.25rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                  {step === "phone" && "Sign in"}
                  {step === "otp" && "Verify identity"}
                  {step === "password" && "Enter password"}
                </h1>
                <p style={{ color: "#4A5266", fontSize: "0.8rem", margin: "6px 0 0", lineHeight: 1.5 }}>
                  {step === "phone" && "Enter your registered mobile number"}
                  {step === "otp" && `Code sent to +91 ${phone}`}
                  {step === "password" && `Signing in as +91 ${phone}`}
                </p>
              </div>

              {/* ── Step 1: Phone ── */}
              {step === "phone" && (
                <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div>
                    <label style={{ color: "#8B92A5", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                      Mobile Number
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{
                        position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                        color: "#3A4155", fontFamily: "monospace", fontSize: "0.875rem", pointerEvents: "none",
                      }}>
                        +91
                      </span>
                      <input
                        className="login-input"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="0000000000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                        autoFocus
                        style={{
                          width: "100%", paddingLeft: "44px", paddingRight: "12px",
                          paddingTop: "10px", paddingBottom: "10px",
                          borderRadius: "8px", border: "1px solid #1E2433",
                          fontSize: "0.9rem", boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                  <button type="submit" className="login-btn" disabled={isLoading} style={{
                    width: "100%", padding: "11px", borderRadius: "8px",
                    border: "none", cursor: isLoading ? "not-allowed" : "pointer", fontSize: "0.875rem",
                  }}>
                    {isLoading ? "Sending…" : "Send OTP →"}
                  </button>
                  <p style={{ textAlign: "center", margin: 0 }}>
                    <button type="button" className="text-link" onClick={goToPassword} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Use password instead
                    </button>
                  </p>
                </form>
              )}

              {/* ── Step 2a: OTP ── */}
              {step === "otp" && (
                <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div>
                    <label style={{ color: "#8B92A5", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                      One-Time Password
                    </label>
                    <input
                      className="login-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="· · · ·"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      autoFocus
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: "8px",
                        border: "1px solid #1E2433", fontSize: "1.4rem", textAlign: "center",
                        letterSpacing: "0.5em", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <button type="submit" className="login-btn" disabled={isLoading} style={{
                    width: "100%", padding: "11px", borderRadius: "8px",
                    border: "none", cursor: isLoading ? "not-allowed" : "pointer", fontSize: "0.875rem",
                  }}>
                    {isLoading ? "Verifying…" : "Verify OTP →"}
                  </button>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <button type="button" className="text-link" onClick={() => { setStep("phone"); setOtp(""); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      ← Change number
                    </button>
                    <button type="button" className="text-link" onClick={handleSendOtp} disabled={isLoading} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Resend OTP
                    </button>
                  </div>
                  <p style={{ textAlign: "center", margin: 0 }}>
                    <button type="button" className="text-link" onClick={goToPassword} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Use password instead
                    </button>
                  </p>
                </form>
              )}

              {/* ── Step 2b: Password ── */}
              {step === "password" && (
                <form onSubmit={handlePasswordLogin} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div>
                    <label style={{ color: "#8B92A5", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                      Password
                    </label>
                    <input
                      className="login-input"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                      placeholder="••••••••"
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: "8px",
                        border: "1px solid #1E2433", fontSize: "0.9rem", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <button type="submit" className="login-btn" disabled={isLoading} style={{
                    width: "100%", padding: "11px", borderRadius: "8px",
                    border: "none", cursor: isLoading ? "not-allowed" : "pointer", fontSize: "0.875rem",
                  }}>
                    {isLoading ? "Signing in…" : "Sign In →"}
                  </button>
                  <p style={{ textAlign: "center", margin: 0 }}>
                    <button type="button" className="text-link" onClick={() => { setStep("otp"); setPassword(""); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      ← Use OTP instead
                    </button>
                  </p>
                </form>
              )}
            </div>

            {/* Footer */}
            <p style={{ textAlign: "center", color: "#2A2F3E", fontSize: "0.7rem", marginTop: "24px", fontFamily: "monospace", letterSpacing: "0.05em" }}>
              SECURED · ENCRYPTED · ADMIN ONLY
            </p>
          </div>
        </div>
      </div>
    </>
  );
}








// import { useState } from "react";
// import { useLocation } from "wouter";
// import { useLogin } from "@workspace/api-client-react";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { useToast } from "@/hooks/use-toast";

// export function LoginPage() {
//   const [password, setPassword] = useState("");
//   const [, setLocation] = useLocation();
//   const { toast } = useToast();
//   const loginMutation = useLogin();

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!password) return;

//     loginMutation.mutate({ data: { password } }, {
//       onSuccess: (data) => {
//         localStorage.setItem("ct_token", data.token);
//         setLocation("/dashboard");
//       },
//       onError: (err: any) => {
//         toast({
//           title: "Login Failed",
//           description: err.message || "Invalid credentials",
//           variant: "destructive",
//         });
//       }
//     });
//   };

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-background p-4">
//       <Card className="w-full max-w-sm">
//         <CardHeader className="space-y-1">
//           <CardTitle className="text-2xl font-bold">Admin Login</CardTitle>
//           <CardDescription>Enter the master password to access the trading panel.</CardDescription>
//         </CardHeader>
//         <CardContent>
//           <form onSubmit={handleSubmit} className="space-y-4">
//             <div className="space-y-2">
//               <Label htmlFor="password">Password</Label>
//               <Input 
//                 id="password" 
//                 type="password" 
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 autoFocus
//               />
//             </div>
//             <Button 
//               type="submit" 
//               className="w-full" 
//               disabled={loginMutation.isPending}
//             >
//               {loginMutation.isPending ? "Authenticating..." : "Sign In"}
//             </Button>
//           </form>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
