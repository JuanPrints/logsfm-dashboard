"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface Show {
  id: string;
  name: string;
  dj_name: string | null;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  playlist_id: string | null;
  is_active: boolean;
}

export default function SchedulePage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [form, setForm] = useState({
    name: "",
    dj_name: "",
    day_of_week: 1,
    start_time: "08:00",
    duration_minutes: 60,
  });

  const fetchShows = async () => {
    const res = await fetch("/api/admin/schedule");
    const json = await res.json();
    if (json.success) setShows(json.data);
  };

  useEffect(() => {
    fetchShows();
  }, []);

  const createShow = async () => {
    if (!form.name.trim()) return;
    await fetch("/api/admin/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...form, is_active: true }),
    });
    setForm({ name: "", dj_name: "", day_of_week: 1, start_time: "08:00", duration_minutes: 60 });
    fetchShows();
  };

  const removeShow = async (id: string) => {
    await fetch("/api/admin/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchShows();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Programación</h1>
        <p className="text-sm text-muted">Programa shows automáticos por día y hora</p>
      </div>

      <div className="glass grid gap-4 rounded-xl p-5 md:grid-cols-2 lg:grid-cols-3">
        <input
          type="text"
          placeholder="Nombre del show"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="DJ"
          value={form.dj_name}
          onChange={(e) => setForm({ ...form, dj_name: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={form.day_of_week}
          onChange={(e) => setForm({ ...form, day_of_week: parseInt(e.target.value) })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i}>{d}</option>
          ))}
        </select>
        <input
          type="time"
          value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="number"
          placeholder="Duración (min)"
          value={form.duration_minutes}
          onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={createShow}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" />
          Agregar show
        </button>
      </div>

      <div className="grid gap-3">
        {shows.map((show) => (
          <div key={show.id} className="glass flex items-center gap-4 rounded-xl p-4">
            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-accent/15 text-accent">
              <span className="text-xs font-bold">{DAYS[show.day_of_week]}</span>
              <span className="text-[10px]">{show.start_time.slice(0, 5)}</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{show.name}</h3>
              <p className="text-sm text-muted">
                {show.dj_name ?? "AutoDJ"} · {show.duration_minutes} min
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeShow(show.id)}
              className="rounded-lg p-2 text-muted hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
