"use client";

// "Add pot & plant" button for pages that list several gardens: adds to the
// filtered garden directly, or asks which garden first.
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { ChevronDown, Plus } from "lucide-react";
import { AddPlantingPanel } from "@/components/GardenSetupPanels";
import { useDismiss } from "@/components/HeaderMenus";
import { useFeedback } from "@/components/Feedback";
import { GardenSearchList, type PickerGarden } from "@/components/GardenSearchList";

export function PlantingLauncher({
  gardens,
  gardenId,
  onCreated,
}: {
  gardens: PickerGarden[];
  /** The garden being viewed, or "all". */
  gardenId: string;
  onCreated: () => void;
}) {
  const { toast } = useFeedback();
  const [target, setTarget] = useState<PickerGarden | null>(null);
  const [picking, setPicking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setPicking(false), []);
  useDismiss(picking, close, rootRef, triggerRef);

  const { data: pots } = useSWR<{ label: string }[]>(target ? `/api/pots?gardenId=${target.id}` : null);

  const fixed = gardenId !== "all" ? gardens.find((garden) => garden.id === gardenId) : gardens.length === 1 ? gardens[0] : undefined;

  function start() {
    if (!gardens.length) {
      toast.info("Create a garden first, then add pots to it.");
      return;
    }
    if (fixed) setTarget(fixed);
    else setPicking((value) => !value);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={start}
        aria-haspopup={fixed ? undefined : "listbox"}
        aria-expanded={fixed ? undefined : picking}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
      >
        <Plus size={16} />
        Add pot & plant
        {fixed ? null : <ChevronDown size={15} className="-mr-1 opacity-80" />}
      </button>
      {picking ? (
        <div className="animate-fade-in absolute left-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] sm:left-auto sm:right-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
          <GardenSearchList
            gardens={gardens}
            heading="Add to which garden?"
            onChoose={(garden) => {
              setPicking(false);
              setTarget(garden);
            }}
          />
        </div>
      ) : null}
      <AddPlantingPanel
        open={target !== null}
        onClose={() => setTarget(null)}
        gardenId={target?.id ?? ""}
        gardenName={target?.name ?? ""}
        existingPotLabels={(pots ?? []).map((pot) => pot.label)}
        onCreated={() => {
          toast.success("Pot and plant added");
          onCreated();
        }}
      />
    </div>
  );
}
