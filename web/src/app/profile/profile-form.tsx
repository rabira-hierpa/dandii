"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/actions/saved-routes";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = name.trim() !== initialName && name.trim().length > 0;

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateProfile({ name: name.trim() });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error ?? "Could not save. Try again.");
      }
    });
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-3 text-[13px] font-semibold text-[#202124]">
        Display name
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          maxLength={80}
          aria-label="Display name"
          className="flex-1 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-[14px] text-[#202124] focus:border-[#1A73E8] focus:outline-2 focus:outline-[#1A73E833]"
        />
        <button
          onClick={save}
          disabled={!dirty || isPending}
          className="cursor-pointer rounded-full bg-[#1A73E8] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#1765CC] disabled:cursor-default disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <div className="mt-2 text-[12.5px] text-[#B91C1C]">{error}</div>}
      {saved && !dirty && (
        <div className="mt-2 text-[12.5px] font-medium text-[#166534]">
          Saved ✓
        </div>
      )}
    </div>
  );
}
