"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, KeyRound, Mail, User, X } from "lucide-react";
import { apiPost } from "@/lib/api-client";
import { AuthError, AuthField, AuthSubmit } from "@/components/AuthFields";

const RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "A letter and a number", test: (p) => /[a-z]/i.test(p) && /\d/.test(p) },
];


export function RegisterForm() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const rulesMet = RULES.every((rule) => rule.test(password));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rulesMet) return;
    setError("");
    setLoading(true);
    try {
      await apiPost("/api/auth/register", { email: email.trim(), password, userName: userName.trim() });
      const res = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (res?.error) throw new Error("Your account was created, but signing in failed. Try signing in.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the account.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <AuthError message={error} />
      <AuthField label="Your name" icon={User} value={userName} onChange={setUserName} placeholder="e.g. Sanzida Zinia" autoComplete="name" autoFocus />
      <AuthField label="Email" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
      <AuthField
        label="Password"
        icon={KeyRound}
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Create a password"
        autoComplete="new-password"
        hint={
          <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <span key={rule.label} className={`inline-flex items-center gap-1 text-xs ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                  {ok ? <Check size={12} /> : <X size={12} />}
                  {rule.label}
                </span>
              );
            })}
          </span>
        }
      />
      <AuthSubmit loading={loading} label="Create account" loadingLabel="Creating your account…" disabled={!rulesMet} />
    </form>
  );
}
