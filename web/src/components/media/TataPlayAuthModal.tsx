import { useState } from "react";
import { Check, KeyRound, LogOut, Phone, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  clearTataPlayAuth,
  getStoredTataPlayAuth,
  requestTataPlayOtp,
  verifyTataPlayOtp,
  type TataPlayAuthData,
} from "@/lib/tataplay";

interface TataPlayAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (auth: TataPlayAuthData) => void;
}

export function TataPlayAuthModal({ isOpen, onClose, onSuccess }: TataPlayAuthModalProps) {
  const [auth, setAuth] = useState<TataPlayAuthData | null>(getStoredTataPlayAuth());
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim().replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await requestTataPlayOtp(cleanPhone);
      setOtpSent(true);
      setSuccessMsg(res.message || "OTP sent successfully! Enter the 4-digit code below.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setError("Please enter the 4-digit OTP.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const verifiedAuth = await verifyTataPlayOtp(phone.trim().replace(/\D/g, ""), cleanOtp);
      setAuth(verifiedAuth);
      setSuccessMsg("Tata Play account connected! Colors HD and premium channels unlocked.");
      onSuccess?.(verifiedAuth);
      setTimeout(onClose, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to verify OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearTataPlayAuth();
    setAuth(null);
    setOtpSent(false);
    setOtp("");
    setSuccessMsg("Signed out from Tata Play.");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tataplay-auth-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-panel border border-white/10 bg-[rgb(var(--nuvio-surface))] p-6 shadow-lift text-text-primary animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-soft">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 id="tataplay-auth-title" className="text-lg font-bold">
                Tata Play Subscriber Login
              </h2>
              <p className="text-xs text-text-tertiary">
                Unlock Colors HD & 580+ premium live channels
              </p>
            </div>
          </div>
          <IconButton label="Close" aria-label="Close" size="sm" variant="ghost" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        {auth?.loggedIn ? (
          <div className="py-6 space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <ShieldCheck size={32} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Tata Play Connected
              </h3>
              <p className="text-xs text-text-tertiary mt-1">
                Subscriber ID: <span className="font-mono text-indigo-400">{auth.subscriberId}</span>
              </p>
              {auth.mobileNumber && (
                <p className="text-xs text-text-tertiary">
                  Mobile: <span className="font-mono text-text-secondary">{auth.mobileNumber}</span>
                </p>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs space-y-1 text-text-secondary">
              <p className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check size={14} /> Full access to Colors HD, Star Plus HD, Zee TV & Sports
              </p>
              <p className="flex items-center gap-2">
                <Check size={14} className="text-indigo-400" /> Direct MPEG-DASH manifest streaming enabled
              </p>
            </div>
            <div className="pt-2 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Done
              </Button>
              <Button
                variant="danger"
                icon={<LogOut size={16} />}
                onClick={handleLogout}
              >
                Sign Out
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-4 space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Premium channels like <strong>Colors HD</strong> and <strong>Star Plus HD</strong> are protected by Tata Play Akamai authorization. Enter your Tata Play registered mobile number to receive a 4-digit OTP.
            </p>

            <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                  Mobile Number
                </label>
                <div className="relative">
                  <Phone
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="tel"
                    disabled={otpSent || loading}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit Tata Play mobile number"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))] focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {otpSent && (
                <div className="animate-fade-in space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Enter OTP
                  </label>
                  <div className="relative">
                    <Smartphone
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
                    />
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      disabled={loading}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter 4-digit code"
                      className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] pl-10 pr-4 text-sm font-mono tracking-widest text-text-primary placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-[rgb(var(--nuvio-error))] rounded-lg bg-[rgb(var(--nuvio-error)/0.1)] p-2.5">
                  {error}
                </p>
              )}

              {successMsg && (
                <p className="text-xs text-emerald-400 rounded-lg bg-emerald-500/10 p-2.5">
                  {successMsg}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                {otpSent && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                      setError(null);
                    }}
                  >
                    Change Number
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  disabled={loading}
                >
                  {loading
                    ? "Please wait…"
                    : otpSent
                      ? "Verify & Watch"
                      : "Send OTP"}
                </Button>
              </div>
            </form>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-text-tertiary space-y-1">
              <p className="font-semibold text-text-secondary">Note:</p>
              <p>• 106 Direct Playable channels (Shirdi Sai Baba, News Nation, Toons+, etc.) play immediately without any login.</p>
              <p>• Logging in authenticates your Akamai session for Colors HD, Star Plus HD, Zee TV, Sony, Sports, etc.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
