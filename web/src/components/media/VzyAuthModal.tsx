import { useState } from "react";
import { Check, KeyRound, LogOut, Phone, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  clearVzyAuth,
  getStoredVzyAuth,
  requestVzyOtp,
  storeVzyAuth,
  verifyVzyOtp,
  type VzyAuthData,
} from "@/lib/vzy";

interface VzyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (auth: VzyAuthData) => void;
}

export function VzyAuthModal({ isOpen, onClose, onSuccess }: VzyAuthModalProps) {
  const [auth, setAuth] = useState<VzyAuthData | null>(getStoredVzyAuth());
  const [mode, setMode] = useState<"otp" | "token">("otp");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [rawToken, setRawToken] = useState("");
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
      const res = await requestVzyOtp(cleanPhone);
      setOtpSent(true);
      setSuccessMsg(res.message || "OTP sent successfully! Enter the code below.");
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
      setError("Please enter the OTP.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const verifiedAuth = await verifyVzyOtp(phone.trim().replace(/\D/g, ""), cleanOtp);
      setAuth(verifiedAuth);
      setSuccessMsg("Account connected! Premium channels unlocked.");
      onSuccess?.(verifiedAuth);
      setTimeout(onClose, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to verify OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualTokenSave = (e: React.FormEvent) => {
    e.preventDefault();
    const token = rawToken.trim();
    if (!token) {
      setError("Please paste a valid token string.");
      return;
    }
    const newAuth: VzyAuthData = {
      token,
      userId: "Subscriber",
    };
    storeVzyAuth(newAuth);
    setAuth(newAuth);
    setSuccessMsg("Token saved! Premium channels unlocked.");
    onSuccess?.(newAuth);
    setTimeout(onClose, 1200);
  };

  const handleLogout = () => {
    clearVzyAuth();
    setAuth(null);
    setOtpSent(false);
    setOtp("");
    setSuccessMsg("Signed out from VZY.");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="nuvio-card relative w-full max-w-md rounded-2xl border border-white/10 bg-[rgb(var(--nuvio-surface))] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--nuvio-accent)/0.18)] text-[rgb(var(--nuvio-accent))]">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-text-primary">VZY Premium Access</h2>
              <p className="text-xs text-text-secondary">
                Connect your account to unlock JioHotstar & SonyLIV
              </p>
            </div>
          </div>
          <IconButton label="Close" onClick={onClose} variant="ghost">
            <X size={18} />
          </IconButton>
        </div>

        {auth ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <Check size={18} /> Connected
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {auth.phoneNumber
                  ? `Active subscriber session for +91 ${auth.phoneNumber}.`
                  : "Custom VZY subscriber token active."}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="danger" icon={<LogOut size={15} />} onClick={handleLogout}>
                Disconnect
              </Button>
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="flex rounded-lg border border-white/10 bg-black/20 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("otp");
                  setError(null);
                }}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  mode === "otp"
                    ? "bg-[rgb(var(--nuvio-accent))] text-black"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Mobile OTP Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("token");
                  setError(null);
                }}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  mode === "token"
                    ? "bg-[rgb(var(--nuvio-accent))] text-black"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Paste Token / Key
              </button>
            </div>

            {mode === "otp" ? (
              !otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-3.5">
                  <div>
                    <label className="block pb-1.5 text-xs font-medium text-text-secondary">
                      Indian Mobile Number (+91)
                    </label>
                    <div className="relative">
                      <Phone
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                      />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        maxLength={10}
                        required
                        className="h-10 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))] focus:outline-none"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={loading}
                    className="w-full"
                    icon={<Smartphone size={16} />}
                  >
                    {loading ? "Sending OTP…" : "Get Verification OTP"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-3.5">
                  <div>
                    <label className="block pb-1.5 text-xs font-medium text-text-secondary">
                      Enter OTP sent to +91 {phone}
                    </label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter 4 or 6-digit OTP"
                      required
                      autoFocus
                      className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-center text-base tracking-widest text-text-primary placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))] focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOtpSent(false)}
                      disabled={loading}
                    >
                      Change Number
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading}
                      className="flex-1"
                      icon={<Check size={16} />}
                    >
                      {loading ? "Verifying…" : "Verify & Unlock"}
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handleManualTokenSave} className="space-y-3.5">
                <div>
                  <label className="block pb-1.5 text-xs font-medium text-text-secondary">
                    VZY / Watcho Subscriber Token (hzToken)
                  </label>
                  <textarea
                    rows={3}
                    value={rawToken}
                    onChange={(e) => setRawToken(e.target.value)}
                    placeholder="Paste hzToken or Bearer token string here…"
                    required
                    className="w-full rounded-xl border border-white/10 bg-black/30 p-2.5 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))] focus:outline-none"
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  icon={<KeyRound size={16} />}
                >
                  Save Token & Unlock
                </Button>
              </form>
            )}

            {error && (
              <p className="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-400">
                {error}
              </p>
            )}
            {successMsg && (
              <p className="rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-400">
                {successMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

