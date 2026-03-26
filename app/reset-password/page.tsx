"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
            <p className="text-sm text-slate-700">Loading reset page...</p>
          </div>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        if (!cancelled) {
          setValidating(false);
          setTokenValid(false);
          setError("Reset link is invalid or expired.");
        }
        return;
      }

      setValidating(true);
      setError("");

      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { error?: string };

        if (!cancelled) {
          setTokenValid(res.ok);
          if (!res.ok) {
            setError(data.error || "Reset link is invalid or expired.");
          }
        }
      } catch {
        if (!cancelled) {
          setTokenValid(false);
          setError("Unable to validate reset link.");
        }
      } finally {
        if (!cancelled) {
          setValidating(false);
        }
      }
    }

    void validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError("Reset link is invalid or expired.");
      return;
    }

    if (password.length < 8 || password.length > 128) {
      setError("Password must be 8-128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccessMessage("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to reset password.");
        return;
      }

      setSuccessMessage("Password reset successful. You can now return to login.");
      setPassword("");
      setConfirmPassword("");
      setTokenValid(false);
    } catch {
      setError("Unable to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
        <p className="mt-2 text-sm text-slate-600">Set a new password for your account.</p>

        {validating ? (
          <p className="mt-6 text-sm text-slate-700">Validating reset link...</p>
        ) : tokenValid ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 p-3"
                autoComplete="new-password"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {successMessage ? <p className="text-sm text-green-700">{successMessage}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Updating..." : "Update Password"}
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-3">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Link
              href="/"
              className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to Login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
