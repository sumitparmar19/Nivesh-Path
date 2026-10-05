// Login: email or mobile + password. Saves the session (shared with legacy pages) and returns to ?redirect.
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard, { Field } from "../components/AuthCard";
import { Button } from "../components/ui";
import { api } from "../lib/api";
import { safeRedirect } from "../lib/redirect";
import { useStore } from "../store/useStore";

export default function Login() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get("redirect") || params.get("next"));
  const { isAuthenticated, setAuth } = useStore();
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to={redirect} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!login.trim() || !password) {
      setError("Enter your email or mobile number and your password.");
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await api.auth.login(login.trim(), password);
      setAuth(token, user);
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to track your portfolio and get AI insights."
      footer={<>Don&apos;t have an account? <Link className="font-semibold text-brand-600" to={`/register${params.get("redirect") ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}>Sign up</Link></>}
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label="Email or mobile number">
          <input name="login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="you@example.com or mobile" />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
        </Field>
        {error && <p role="alert" className="text-sm text-down">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">{loading ? "Logging in…" : "Log in"}</Button>
      </form>
    </AuthCard>
  );
}
