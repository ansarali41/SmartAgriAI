import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 text-2xl font-black text-slate-950 dark:text-white">
            <span className="rounded-xl bg-emerald-600 p-2 text-white">🌱</span>
            SmartAgri
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Sign in to your precision farming workspace
          </p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No account?{" "}
          <Link href="/register" className="font-bold text-emerald-600">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
