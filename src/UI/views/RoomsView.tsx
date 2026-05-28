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

      {/* Premium Legends Panel */}
      <div className="px-4 py-3 bg-white border-b border-[#E8E5DF] flex flex-col gap-2.5 shrink-0 text-[11px] font-semibold text-muted-foreground shadow-sm">
        {/* State Legends */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#7C7C8A] mr-1">States</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
            <span className="text-[11.5px] font-bold text-foreground">Dirty</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#6366F1]" />
            <span className="text-[11.5px] font-bold text-foreground">Cleaning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
            <span className="text-[11.5px] font-bold text-foreground">Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
            <span className="text-[11.5px] font-bold text-foreground">Occupied</span>
          </div>
        </div>

        {/* Room Type Legends */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center border-t border-[#F3F2EF] pt-2">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#7C7C8A] mr-1">Types</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-extrabold bg-[#EFEDE8] px-1.5 py-0.5 rounded uppercase tracking-wider text-foreground">STD</span>
            <span className="text-[11.5px] font-bold text-foreground">Standard</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-extrabold bg-[#EFEDE8] px-1.5 py-0.5 rounded uppercase tracking-wider text-foreground">DLX</span>
            <span className="text-[11.5px] font-bold text-foreground">Deluxe</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-extrabold bg-[#EFEDE8] px-1.5 py-0.5 rounded uppercase tracking-wider text-foreground">STE</span>
            <span className="text-[11.5px] font-bold text-foreground">Suite</span>
          </div>
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
