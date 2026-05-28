import { useState } from "react";
import { statusDot, statusLabel, housekeepers } from "@/simulation/data";
import { RoomChip } from "./RoomChip";
import type { Room } from "@/simulation/data";

const statusFilters = [
  { value: "all", label: "All", color: "bg-emerald-600 border-emerald-600 text-white" },
  { value: "dirty", label: "Dirty", color: "bg-[#EF4444] border-[#EF4444] text-white" },
  { value: "cleaning", label: "Cleaning", color: "bg-[#6366F1] border-[#6366F1] text-white" },
  { value: "ready", label: "Ready", color: "bg-[#10B981] border-[#10B981] text-white" },
  { value: "occupied", label: "Occupied", color: "bg-[#3B82F6] border-[#3B82F6] text-white" },
];

export function RoomsView({ onSelectRoom, roomsList }: { onSelectRoom: (r: Room) => void; roomsList: Room[] }) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = roomsList.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    return true;
  });

  const byFloor = filtered.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto bg-[#EFEDE8]">
      {/* Sticky Pill Filters Row */}
      <div className="px-4 py-3 flex flex-col gap-2.5 border-b border-border bg-white shadow-sm shrink-0 sticky top-0 z-20">
        {/* Row 1: Status Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar scroll-smooth">
          {statusFilters.map((f) => {
            const isActive = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-all active:scale-[0.96] whitespace-nowrap shrink-0 ${
                  isActive
                    ? f.color
                    : "bg-[#F3F2EF] border-[#E8E5DF] text-muted-foreground hover:bg-[#E8E5DF]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-4 pb-20 space-y-5">
        {Object.keys(byFloor).sort().map((floor) => (
          <div key={floor}>
            <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mb-2 pl-1">Floor {floor}</div>
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
      </div>
    </div>
  );
}
