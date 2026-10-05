// Contact: form saved to MongoDB and emailed to the owner (POST /api/contact); pre-filled when logged in.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CircleHelp, Send } from "lucide-react";
import { GithubIcon as Github, LinkedinIcon as Linkedin } from "../components/BrandIcons";
import { Button, Card, PageHeader } from "../components/ui";
import { OWNER } from "../config/site";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

const TOPICS = ["Feedback", "Bug report", "Question", "Hiring / collaboration"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Contact() {
  const user = useStore((s) => s.user);
  const [form, setForm] = useState({ name: user?.name || "", email: user?.email || "", subject: TOPICS[0], message: "" });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return setStatus({ ok: false, text: "Please add your name, email and a message." });
    if (!EMAIL_RE.test(form.email.trim())) return setStatus({ ok: false, text: "Enter a valid email address." });
    setSending(true);
    try {
      await api.contact.send({ ...form, name: form.name.trim(), email: form.email.trim(), message: form.message.trim() });
      setForm({ ...form, message: "" });
      setStatus({ ok: true, text: "Message received! Sumit will get back to you by email." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Your message couldn't be sent." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageHeader eyebrow="Contact" title="Get in touch" lede="Feedback, a bug, or a question about the project? Your message goes straight to the project owner." />
      <div className="grid items-start gap-6 md:grid-cols-[1.4fr_1fr]">
        <Card as="div">
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-ink-2">Your name<input name="name" autoComplete="name" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="grid gap-1.5 text-sm font-semibold text-ink-2">Your email<input name="email" type="email" autoComplete="email" maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            </div>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">Topic
              <select name="subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">Message
              <textarea name="message" rows={6} maxLength={5000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What's on your mind?" />
            </label>
            {status && <p role={status.ok ? "status" : "alert"} className={status.ok ? "text-sm text-up" : "text-sm text-down"}>{status.text}</p>}
            <Button type="submit" className="justify-self-start" disabled={sending}><Send size={16} /> {sending ? "Sending…" : "Send message"}</Button>
          </form>
        </Card>
        <Card as="aside">
          <h2 className="font-display text-lg font-bold text-ink">Other ways to reach me</h2>
          <ul className="mt-3 grid gap-3 text-sm">
            <li><a className="inline-flex items-center gap-2 font-semibold text-brand-600" href={OWNER.github} target="_blank" rel="noopener noreferrer"><Github size={16} /> GitHub</a></li>
            <li><a className="inline-flex items-center gap-2 font-semibold text-brand-600" href={OWNER.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin size={16} /> LinkedIn</a></li>
            <li><Link className="inline-flex items-center gap-2 font-semibold text-brand-600" to="/about#faq"><CircleHelp size={16} /> FAQ</Link></li>
          </ul>
          <p className="mt-4 text-sm text-muted">The contact form sends directly to the project owner. Messages are stored securely.</p>
        </Card>
      </div>
    </div>
  );
}
