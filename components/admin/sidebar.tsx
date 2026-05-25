"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Disc3,
  LayoutDashboard,
  ListMusic,
  Mic2,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";
import { useEffect } from "react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/playlists", label: "Playlists", icon: ListMusic },
  { href: "/admin/songs", label: "Canciones", icon: Disc3 },
  { href: "/admin/schedule", label: "Programación", icon: Calendar },
  { href: "/admin/live", label: "Live DJ", icon: Mic2 },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { connected, connect, stream } = useRadioStore();

  useEffect(() => {
    const unsubscribe = connect();
    return unsubscribe;
  }, [connect]);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent glow-accent">
          <Radio className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">LogsFM</h1>
          <p className="text-xs text-muted">Radio Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-card-hover hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-background p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Stream</span>
            <span
              className={cn(
                "flex items-center gap-1 font-medium capitalize",
                stream.status === "online" ? "text-success" : "text-muted",
              )}
            >
              {stream.status === "online" ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {stream.status}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted">MatuDB Realtime</span>
            <span className={connected ? "text-success" : "text-danger"}>
              {connected ? "Conectado" : "Desconectado"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted">Oyentes</span>
            <span className="font-medium">{stream.listeners}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
