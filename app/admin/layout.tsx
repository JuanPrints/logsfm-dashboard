import type { Metadata } from "next";
import { AdminSidebar } from "@/components/admin/sidebar";

export const metadata: Metadata = {
  title: "LogsFM — Radio Console",
  description: "Panel administrativo de radio online",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <main className="ml-64 min-h-screen p-6">{children}</main>
    </div>
  );
}
