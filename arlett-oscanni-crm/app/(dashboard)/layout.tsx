import { Protected } from "@/lib/auth/Protected";
import { AppShell } from "@/components/layout/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Protected>
      <AppShell>{children}</AppShell>
    </Protected>
  );
}
