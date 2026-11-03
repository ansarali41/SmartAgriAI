"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { GardenDashboard } from "@/components/GardenDashboard";
import { Card, PageHeader } from "@/components/ui";
import { getSelectedGardenId, setSelectedGardenId } from "@/lib/selected-garden";

interface Garden {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const { data: gardens } = useSWR<Garden[]>("/api/gardens");
  const [selectedGardenId, setSelectedGardenIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!gardens) return;

    const savedGardenId = getSelectedGardenId();
    const gardenId = gardens.some((garden) => garden.id === savedGardenId)
      ? savedGardenId
      : gardens[0]?.id ?? null;

    setSelectedGardenIdState(gardenId);
    if (gardenId) setSelectedGardenId(gardenId);
  }, [gardens]);

  if (!gardens) {
    return <p className="text-sm text-slate-400">Loading dashboard...</p>;
  }

  if (!selectedGardenId) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Select a garden to see its live dashboard." />
        <Card>
          <p className="text-sm text-slate-400">Create a garden first, then select it from Gardens.</p>
        </Card>
      </div>
    );
  }

  return (
    <GardenDashboard
      gardenId={selectedGardenId}
      backHref="/gardens"
      backLabel="Manage gardens"
      headerTitle="Dashboard"
      headerAction={
        <label className="min-w-0 sm:min-w-56">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Garden
          </span>
          <select
            aria-label="Select garden for dashboard"
            value={selectedGardenId}
            onChange={(event) => {
              const nextGardenId = event.target.value;
              setSelectedGardenIdState(nextGardenId);
              setSelectedGardenId(nextGardenId);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {gardens.map((garden) => (
              <option key={garden.id} value={garden.id}>
                {garden.name}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}
