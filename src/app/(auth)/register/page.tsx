import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
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
            Create your farm account
          </p>
        </div>
        <RegisterForm />
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-emerald-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
