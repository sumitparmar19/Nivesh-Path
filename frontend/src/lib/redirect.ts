// Only same-site paths are allowed as a post-login destination (prevents open redirects).
export function safeRedirect(value: string | null, fallback = "/portfolio"): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
