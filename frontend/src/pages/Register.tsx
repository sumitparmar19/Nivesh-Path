// Sign-up: creates the account (starts with $100,000 virtual cash), signs in and opens Portfolio.
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard, { Field } from "../components/AuthCard";
import { Button } from "../components/ui";
import { api } from "../lib/api";
import { safeRedirect } from "../lib/redirect";
import { useStore } from "../store/useStore";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const { isAuthenticated, setAuth, toast } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to={redirect} replace />;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.mobile.trim() || !form.password) return setError("Please fill in every field.");
    if (!EMAIL_RE.test(form.email.trim())) return setError("Enter a valid email address.");
    if (form.password.length < 6) return setError("Use a password with at least 6 characters.");
    setLoading(true);
    try {
      const { token, user } = await api.auth.register({ ...form, name: form.name.trim(), email: form.email.trim(), mobile: form.mobile.trim() });
      setAuth(token, user);
      toast("You have $100,000 in virtual cash to start investing.", "success", "Welcome to Nivesh-Path!");
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start with $100,000 of virtual cash. Free, no card needed."
      footer={<>Already have an account? <Link className="font-semibold text-brand-600" to="/login">Log in</Link></>}
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label="Full name"><input name="name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" /></Field>
        <Field label="Email"><input name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" /></Field>
        <Field label="Mobile number"><input name="mobile" type="tel" autoComplete="tel" value={form.mobile} onChange={set("mobile")} placeholder="Mobile number" /></Field>
        <Field label="Password"><input name="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} placeholder="At least 6 characters" /></Field>
        {error && <p role="alert" className="text-sm text-down">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating account…" : "Create account"}</Button>
      </form>
    </AuthCard>
  );
}
