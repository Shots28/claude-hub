"use client";
// ---------------------------------------------------------------------------
// Login / Setup Page
// ---------------------------------------------------------------------------
// On first visit (no user row), shows "Set up your password" form.
// Otherwise shows a standard login form.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "loading" | "setup" | "login";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if any user exists to decide setup vs login
  useEffect(() => {
    (async () => {
      try {
        // Try the setup endpoint with GET to check if users exist
        const res = await fetch("/api/auth/setup", { method: "GET" });
        if (res.status === 404 || res.status === 405) {
          // No GET handler or no users — check with a different approach
          // Default to login, the setup POST will return 409 if user exists
          setMode("setup");
        } else if (res.ok) {
          const data = await res.json();
          setMode(data.needsSetup ? "setup" : "login");
        } else {
          setMode("login");
        }
      } catch {
        setMode("login");
      }
    })();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const usernameVal = username.trim() || "admin";

      if (!password.trim()) {
        setError("Password is required");
        return;
      }

      if (mode === "setup") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          return;
        }
      }

      setLoading(true);

      try {
        if (mode === "setup") {
          // Create account first
          const setupRes = await fetch("/api/auth/setup", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: usernameVal,
              password,
            }),
          });

          if (!setupRes.ok) {
            const data = await setupRes.json();
            if (data.error === "Already configured") {
              // User already exists, switch to login mode
              setMode("login");
              setError("An account already exists. Please sign in.");
              setLoading(false);
              return;
            }
            setError(data.error || "Setup failed");
            setLoading(false);
            return;
          }

          // After setup, fall through to login
        }

        // Login
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: usernameVal,
            password,
          }),
        });

        if (!loginRes.ok) {
          const data = await loginRes.json();
          setError(data.error || "Invalid credentials");
          setLoading(false);
          return;
        }

        router.push("/");
      } catch {
        setError("Network error. Please try again.");
        setLoading(false);
      }
    },
    [mode, username, password, confirmPassword, router],
  );

  if (mode === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-hub-bg">
        <div className="w-6 h-6 border-2 border-hub-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-hub-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-hub-accent/10 border border-hub-accent/20 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-hub-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-hub-text">Claude Hub</h1>
          <p className="text-sm text-hub-text-muted mt-1">
            {mode === "setup"
              ? "Set up your account to get started"
              : "Sign in to your hub"}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-hub-surface border border-hub-border rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-medium text-hub-text-muted mb-1.5"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
                className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2.5 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-hub-text-muted mb-1.5"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "setup" ? "Min 8 characters" : "Enter password"
                }
                required
                autoComplete={
                  mode === "setup" ? "new-password" : "current-password"
                }
                className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2.5 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
              />
            </div>

            {/* Confirm password (setup only) */}
            {mode === "setup" && (
              <div>
                <label
                  htmlFor="login-confirm"
                  className="block text-xs font-medium text-hub-text-muted mb-1.5"
                >
                  Confirm password
                </label>
                <input
                  id="login-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                  autoComplete="new-password"
                  className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2.5 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium bg-hub-accent hover:bg-hub-accent-hover active:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50"
            >
              {loading
                ? mode === "setup"
                  ? "Setting up..."
                  : "Signing in..."
                : mode === "setup"
                  ? "Create Account"
                  : "Sign In"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-hub-text-muted/50 mt-6">
          Claude Hub -- Local-first AI instance manager
        </p>
      </div>
    </div>
  );
}
