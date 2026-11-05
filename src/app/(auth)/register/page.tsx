import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start looking after your plants."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
