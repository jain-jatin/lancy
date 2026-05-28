import { useState, useEffect } from "react";
import { X, Lock, CheckCircle2, User, AlertTriangle } from "lucide-react";
import { Room, statusTag, statusLabel, Housekeeper } from "@/simulation/data";
import { lancyService } from "@/Backend/services/lancy-service";
import { timeToMinutes, minutesToTime, getHkColor } from "@/simulation/engine";
import { toast } from "sonner";

interface Props {
  room: Room;
  onClose: () => void;
  onUpdateLancy: (msg: string) => void;
  onUpdateRoomStatus: (number: string, status: Room["status"], updates?: Partial<Room>) => void;
  simTime: string;
  onReassignRoom: (roomNum: string, fromHkName: string, toHkName: string) => Promise<any>;
}

export function RoomDetail({ room, onClose, onUpdateLancy, onUpdateRoomStatus, simTime, onReassignRoom }: Props) {
  const [hkList, setHkList] = useState<Housekeeper[]>([]);
  const [roomsList, setRoomsList] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLiveState = async () => {
    setLoading(true);
    const hks = await lancyService.getHousekeepers();
    const rms = await lancyService.getRooms();
    setHkList(hks);
    setRoomsList(rms);
    setLoading(false);
  };

  useEffect(() => {
    fetchLiveState();
  }, [room.number, room.attendant]);

  const hkName = room.attendant;
  const hk = hkList.find((h) => h.name === hkName);

  // Helper: Format time (e.g. "10:35") to "10:35 AM"
  function formatTimeStr(t: string | null | undefined): string {
    if (!t) return "10:00 AM";
    let timeStr = t;
    if (t.includes("T")) {
      const parts = t.split("T");
      if (parts.length > 1) {
        timeStr = parts[1];
      }
    }
    const [h, m] = timeStr.split(":").map(Number);
    const hour = (isNaN(h) ? 10 : h) % 12 || 12;
    const minutes = isNaN(m) ? 0 : m;
    const ampm = (isNaN(h) ? 10 : h) >= 12 ? "PM" : "AM";
    return `${hour}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  }

  // Helper: Calculate remaining minutes or "Overdue"
  function getRemainingInfo(simTime: string, etaStr: string) {
    const simMins = timeToMinutes(simTime);
    const etaMins = timeToMinutes(etaStr);
    const diff = etaMins - simMins;
    if (diff <= 0) {
      return { text: "Overdue", isOverdue: true };
    }
    return { text: `${diff} mins`, isOverdue: false };
  }

  // Helper: Calculate Progress Bar Percent
  function getProgressPct(simTime: string, startStr: string | null | undefined, duration: number) {
    if (!startStr) return 0;
    const simMins = timeToMinutes(simTime);
    const startMins = timeToMinutes(startStr);
    const elapsed = simMins - startMins;
    if (elapsed <= 0) return 0;
    return Math.min(Math.round((elapsed / duration) * 100), 100);
  }

  const handleReassign = async (newHkName: string) => {
    try {
      const rNum = room.number;
      const sourceHkName = room.attendant || "Ana";

      await onReassignRoom(rNum, sourceHkName, newHkName);

      toast.success(`Room ${rNum} reassigned to ${newHkName}`);
      onUpdateRoomStatus(rNum, "dirty", { attendant: newHkName });
      await fetchLiveState();
      onClose();
    } catch (err: any) {
      console.error("[RoomDetail] Reassignment error:", err);
      toast.error(`Reassignment failed: ${err?.message || err}`);
    }
  };

  const duration = room.type === "STE" ? 45 : room.type === "DLX" ? 35 : 25;
  const eta = room.actual_start_time ? minutesToTime(timeToMinutes(room.actual_start_time) + duration) : room.scheduled_end_time || "10:25";
  const rem = getRemainingInfo(simTime, eta);
  const pct = getProgressPct(simTime, room.actual_start_time, duration);

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30 animate-fade-in" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 z-50 bg-[#EFEDE8] rounded-t-[24px] animate-slide-up max-h-[85%] flex flex-col shadow-2xl border-t border-border/30 overflow-hidden">
        {/* Header Block */}
        <div className="px-5 pt-5 pb-4 bg-white border-b border-[#E8E5DF] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest">
              <span>Room {room.type}</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/35" />
              <span>Floor {room.floor}</span>
            </div>
            <h1 className="text-[28px] font-extrabold text-[#1A1A2E] tracking-tight mt-0.5 leading-none">{room.number}</h1>
            <span className={`mt-2.5 inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold ${statusTag[room.status]} shadow-sm`}>
              {statusLabel[room.status]}
            </span>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-[#EFEDE8] hover:bg-secondary flex items-center justify-center transition-all active:scale-95 shadow-sm">
            <X size={18} className="text-[#1A1A2E]" />
          </button>
        </div>

        {/* Content Block */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-[13px] font-medium">Loading live room data...</div>
          ) : (
            <>
              {/* DIRTY (UPCOMING, NOT STARTED) */}
              {room.status === "dirty" && (
                <div className="space-y-4">
                  {/* Reassignment Dropdown Panel */}
                  <div className="rounded-[18px] bg-white border border-[#E8E5DF] p-4 shadow-sm space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider pl-0.5">Assigned Attendant</label>
                      <div className="relative">
                        <select
                          value={hkName || ""}
                          onChange={(e) => handleReassign(e.target.value)}
                          className="w-full h-11 px-3.5 rounded-xl border border-[#E8E5DF] bg-[#F8F7F4] text-[13px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                        >
                          <option value="" disabled>Select Housekeeper</option>
                          {hkList.map((h) => (
                            <option key={h.name} value={h.name}>{h.name}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground font-bold">▼</div>
                      </div>
                    </div>

                    {hkName && (
                      <div className="pt-3 border-t border-[#F3F2EF] space-y-2.5">
                        <div className="flex justify-between items-center text-[12.5px]">
                          <span className="text-muted-foreground font-semibold flex items-center gap-1">🕒 Scheduled Start:</span>
                          <span className="font-extrabold text-[#1A1A2E]">{formatTimeStr(room.scheduled_start_time)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[12.5px]">
                          <span className="text-muted-foreground font-semibold flex items-center gap-1">⏱️ Expected Duration:</span>
                          <span className="font-extrabold text-[#1A1A2E]">{duration} mins</span>
                        </div>
                        <div className="flex justify-between items-center text-[12.5px]">
                          <span className="text-muted-foreground font-semibold flex items-center gap-1">⏱️ Expected Completion:</span>
                          <span className="font-extrabold text-[#1A1A2E]">{formatTimeStr(room.scheduled_end_time)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CLEANING (IN PROGRESS) */}
              {room.status === "cleaning" && (
                <div className="space-y-4">
                  <div className="rounded-[18px] bg-white border border-[#E8E5DF] p-5 shadow-sm space-y-4">
                    {/* Header line */}
                    <div className="flex justify-between items-center pb-3 border-b border-[#F3F2EF]">
                      <div className="flex items-center gap-2 bg-[#F8F7F4] rounded-xl px-3 py-1.5 border border-[#E8E5DF]/50">
                        <span className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white" style={{ backgroundColor: getHkColor(hkName || "Ana") }}>
                          {(hkName || "A")[0]}
                        </span>
                        <span className="text-[12px] font-bold text-foreground">{hkName}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-extrabold text-muted-foreground uppercase">
                        <Lock size={12} />
                        Locked
                      </div>
                    </div>

                    {/* Timings */}
                    <div className="grid grid-cols-3 gap-2 text-left pt-1">
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Started</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">{formatTimeStr(room.actual_start_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">ETA</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">{formatTimeStr(eta)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Remaining</div>
                        <div className={`text-[12px] font-extrabold mt-0.5 ${rem.isOverdue ? "text-amber-600 flex items-center gap-0.5" : "text-[#1A1A2E]"}`}>
                          {rem.isOverdue && <AlertTriangle size={11} />}
                          {rem.text}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="pt-2 space-y-1">
                      <div className="h-2.5 w-full rounded-full bg-[#EFEDE8] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${rem.isOverdue ? "bg-amber-500" : "bg-[#6366F1]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-right text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">{pct}% Complete</div>
                    </div>
                  </div>
                </div>
              )}

              {/* READY */}
              {room.status === "ready" && (
                <div className="rounded-[18px] bg-white border border-[#E8E5DF] p-5 shadow-sm flex flex-col items-center text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 className="text-[#10B981]" size={28} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-extrabold text-[#1A1A2E]">Room Cleaned &amp; Ready</h3>
                    <p className="text-[12px] text-muted-foreground mt-1 max-w-[80%] mx-auto">This room is cleared and fully sanitized for upcoming guest arrival.</p>
                  </div>
                  <div className="w-full pt-3 border-t border-[#F3F2EF] grid grid-cols-3 gap-4 text-left">
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Attendant</div>
                      <div className="text-[12px] font-bold text-[#1A1A2E] mt-0.5">{room.cleaned_by_name || room.attendant || "Ana"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Completed</div>
                      <div className="text-[12px] font-bold text-[#1A1A2E] mt-0.5">{formatTimeStr(room.actual_end_time)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Duration</div>
                      <div className="text-[12px] font-bold text-[#1A1A2E] mt-0.5">{duration} mins</div>
                    </div>
                  </div>
                </div>
              )}

              {/* OCCUPIED */}
              {room.status === "occupied" && (
                <div className="rounded-[18px] bg-white border border-[#E8E5DF] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <User className="text-[#3B82F6]" size={20} />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-[#1A1A2E]">Stayover Guest</h3>
                      <p className="text-[11px] text-muted-foreground">Guest currently registered in room.</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-[#F3F2EF] space-y-2">
                    <div className="flex justify-between items-center text-[12.5px]">
                      <span className="text-muted-foreground font-medium">Checkout Schedule:</span>
                      <span className="font-bold text-[#1A1A2E]">10:00 AM standard</span>
                    </div>
                    <div className="flex justify-between items-center text-[12.5px]">
                      <span className="text-muted-foreground font-medium">Housekeeper:</span>
                      <span className="font-bold text-[#1A1A2E]">{room.attendant || "None assigned"}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
