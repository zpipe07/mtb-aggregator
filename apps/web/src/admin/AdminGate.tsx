"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { adminAuth, setStoredAdminToken } from "./api";

type Props = { onSuccess: () => void };

export function AdminGate({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const ok = await adminAuth(password);
      if (ok) {
        setStoredAdminToken(password);
        onSuccess();
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="" className="h-12 w-auto" />
        </div>
        <h1 className="text-lg font-semibold text-stone-800 mb-4 text-center">Admin login</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-password" className="sr-only">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
              autoFocus
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-stone-800 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center">
          <Link href="/deals" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to deals
          </Link>
        </p>
      </div>
    </div>
  );
}
