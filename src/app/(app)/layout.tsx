// TASK: Auth gate + app chrome. Server component that redirects unauthenticated
// users to /login (replaces Express requireAuth middleware) and wraps every
// protected page in the sidebar + topbar.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const email = session.user.email ?? "farmer@smartagri.ai";
  const profile = session.user.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, userName: true } })
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <AppShell email={profile?.email ?? email} userName={profile?.userName ?? null}>
        {children}
      </AppShell>
    </div>
  );
}
