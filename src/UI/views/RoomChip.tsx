import { Room, statusDot, statusBorder } from "@/simulation/data";
import { Zap, AlertTriangle, Wrench } from "lucide-react";

export function RoomChip({ room, onClick }: { room: Room & { damageReported?: boolean; tvIssue?: boolean; isBlocked?: boolean }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-[64px] w-full rounded-[10px] bg-white border ${statusBorder[room.status]} flex flex-col items-center justify-between py-2 px-1 active:scale-[0.97] transition-all duration-150 relative shadow-sm`}
    >
      <div className="w-full flex items-center justify-between px-1 shrink-0">
        <span className="text-[8px] font-bold text-muted-foreground tracking-wider uppercase">{room.type}</span>
        {room.earlyCheckIn && (
          <Zap size={10} className="text-[#F59E0B] fill-[#F59E0B]" />
        )}
      </div>

      <span className="text-[17px] font-bold text-[#1A1A2E] leading-none my-1">{room.number}</span>

      <div className="w-full flex items-center justify-between px-1 shrink-0">
        <div className="flex gap-1">
          {room.damageReported && (
            <AlertTriangle size={10} className="text-red-500 fill-red-500 animate-pulse" />
          )}
          {(room.tvIssue || room.isBlocked) && (
            <Wrench size={10} className="text-[#6B7280]" />
          )}
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${statusDot[room.status]} shadow-sm`} />
      </div>
    </button>
  );
}
