import { useState } from "react";
import { statusDot, statusLabel, housekeepers } from "@/simulation/data";
import { RoomChip } from "./RoomChip";
import { AppSelect } from "@/UI/components/AppSelect";
import type { Room } from "@/simulation/data";

const statusOptions = [
  { value: "all", label: "All" },
  { value: "dirty", label: "Dirty" },
  { value: "cleaning", label: "Cleaning" },
  { value: "inspection", label: "Inspection" },
  { value: "review", label: "Review" },
  { value: "ready", label: "Ready" },
];

const hkOptions = [
  { value: "all", label: "All" },
  { value: "Marcus", label: "Marcus" },
  ...housekeepers.map((h) => ({ value: h.name, label: h.name })),
];

export function RoomsView({ onSelectRoom, roomsList }: { onSelectRoom: (r: Room) => void; roomsList: Room[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [hkFilter, setHkFilter] = useState<string>("all");

  const filtered = roomsList.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (hkFilter === "Marcus") return r.status === "inspection" || r.status === "review";
    if (hkFilter !== "all" && r.attendant !== hkFilter) return false;
    return true;
  });

  const byFloor = filtered.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {/* Both dropdowns on one line, separated from grid by border */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border bg-white">
        <AppSelect value={filter} onChange={setFilter} options={statusOptions} placeholder="Room Status" />
        <AppSelect value={hkFilter} onChange={setHkFilter} options={hkOptions} placeholder="Housekeeper" />
      </div>

      <div className="px-4 pt-4 pb-4 space-y-5">
        {Object.keys(byFloor).sort().map((floor) => (
          <div key={floor}>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-1">Floor {floor}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {byFloor[Number(floor)].map((r) => (
                <RoomChip key={r.number} room={r} onClick={() => onSelectRoom(r)} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground text-[13px] py-12">No rooms match this filter.</div>
        )}

        {/* Legend: wrapping, no scroll */}
        <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {(Object.keys(statusDot) as (keyof typeof statusDot)[])
            .filter((s) => s !== "blocked" && s !== "empty")
            .map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot[s]}`} />
                {statusLabel[s]}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
