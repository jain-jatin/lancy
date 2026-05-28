import { useState } from "react";
import { Lock, Zap, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Room, Housekeeper, CHECKOUT_ROOMS } from "@/simulation/data";
import { timeToMinutes, minutesToTime, getHkColor } from "@/simulation/engine";
import { lancyService } from "@/Backend/services/lancy-service";
import { toast } from "sonner";

interface Props {
  roomsList: Room[];
  housekeepers: Housekeeper[];
  simTime: string;
  onUpdateRoomStatus: (number: string, status: Room["status"], updates?: Partial<Room>) => void;
  onRefreshState: () => Promise<void>;
}

export function TasksView({ roomsList, housekeepers, simTime, onUpdateRoomStatus, onRefreshState }: Props) {
  const [selectedHk, setSelectedHk] = useState<string>("Ana");
  const [reassigningRoom, setReassigningRoom] = useState<Room | null>(null);
  const [tempHk, setTempHk] = useState<string | null>(null);

  // Helper: Format t (e.g. "10:35") to "10:35 AM"
  function formatTimeStr(t: string | null | undefined): string {
    if (!t) return "10:00 AM";
    const [h, m] = t.split(":").map(Number);
    const hour = h % 12 || 12;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
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

  // Handle reassigning housekeeper
  const handleReassignSelect = async (targetHkName: string) => {
    if (!reassigningRoom) return;
    const rNum = reassigningRoom.number;
    const sourceHkName = reassigningRoom.attendant;

    // Find target housekeeper's current queue from database
    const targetHk = housekeepers.find((h) => h.name === targetHkName);
    if (!targetHk) return;

    // Remove from original housekeeper queue
    let nextRooms: string[] = [];
    if (sourceHkName) {
      const sourceHk = housekeepers.find((h) => h.name === sourceHkName);
      if (sourceHk) {
        nextRooms = (sourceHk.rooms || []).filter((num) => num !== rNum);
        await lancyService.updateHousekeeper(sourceHkName, { rooms: nextRooms });
      }
    }

    // Insert room into target housekeeper queue based on priority: Suite first, Deluxe second, Standard third. Placed at the end of that type group.
    const filtered = (targetHk.rooms || []).filter((num) => num !== rNum);
    const suites: string[] = [];
    const deluxe: string[] = [];
    const standard: string[] = [];

    filtered.forEach((num) => {
      const rm = roomsList.find((r) => r.number === num);
      if (rm?.type === "STE") suites.push(num);
      else if (rm?.type === "DLX") deluxe.push(num);
      else standard.push(num);
    });

    if (reassigningRoom.type === "STE") {
      suites.push(rNum);
    } else if (reassigningRoom.type === "DLX") {
      deluxe.push(rNum);
    } else {
      standard.push(rNum);
    }

    const updatedRooms = [...suites, ...deluxe, ...standard];

    // Update target housekeeper rooms
    await lancyService.updateHousekeeper(targetHkName, { rooms: updatedRooms });

    // Recalculate timings for source housekeeper's remaining queue
    if (sourceHkName) {
      let currentMins = 600; // 10:00 AM start
      for (const num of nextRooms) {
        const rm = roomsList.find((r) => r.number === num);
        const rType = rm ? rm.type : "STD";
        const duration = rType === "STE" ? 45 : rType === "DLX" ? 35 : 25;
        const start = currentMins;
        const end = currentMins + duration;

        await lancyService.updateRoomStatus(num, "dirty", {
          attendant: sourceHkName,
          scheduled_start_time: minutesToTime(start),
          scheduled_end_time: minutesToTime(end),
        });

        currentMins = end;
      }
    }

    // Calculate new timings for target housekeeper's entire queue
    let currentMins = 600; // 10:00 AM start
    for (const num of updatedRooms) {
      const rm = roomsList.find((r) => r.number === num);
      const rType = rm ? rm.type : "STD";
      const duration = rType === "STE" ? 45 : rType === "DLX" ? 35 : 25;
      const start = currentMins;
      const end = currentMins + duration;

      await lancyService.updateRoomStatus(num, "dirty", {
        attendant: targetHkName,
        scheduled_start_time: minutesToTime(start),
        scheduled_end_time: minutesToTime(end),
      });

      currentMins = end;
    }

    toast.success(`Room ${rNum} reassigned to ${targetHkName}`);
    setReassigningRoom(null);
    setTempHk(null);
    onUpdateRoomStatus(rNum, "dirty", { attendant: targetHkName });
    await onRefreshState();
  };

  // Compile tasks
  const checkoutRooms = roomsList.filter((r) => r.attendant && CHECKOUT_ROOMS.includes(r.number));

  const filteredTasks = checkoutRooms.filter((t) => {
    return t.attendant === selectedHk;
  });

  // Group task lists by status
  const currentTasks = filteredTasks.filter((t) => t.status === "cleaning");
  const pastTasks = filteredTasks.filter((t) => t.status === "ready");

  // Sort upcoming tasks by priority: Suite -> Deluxe -> Standard, then by start time
  const upcomingTasks = filteredTasks
    .filter((t) => t.status === "dirty" || t.status === "occupied")
    .sort((a, b) => {
      const order: Record<string, number> = { STE: 0, DLX: 1, STD: 2 };
      const diff = order[a.type] - order[b.type];
      if (diff !== 0) return diff;
      return timeToMinutes(a.scheduled_start_time || "10:00") - timeToMinutes(b.scheduled_start_time || "10:00");
    });

  // Count variables
  const countCurrent = currentTasks.length;
  const countUpcoming = upcomingTasks.length;
  const countPast = pastTasks.length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#EFEDE8] flex flex-col">
      {/* Header Selector */}
      <div className="px-4 py-2.5 bg-white border-b border-border shadow-sm shrink-0 sticky top-0 z-20 flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar scroll-smooth">
        {housekeepers.map((h) => {
          const isSelected = selectedHk === h.name;
          return (
            <button
              key={h.name}
              onClick={() => setSelectedHk(h.name)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-all active:scale-[0.96] whitespace-nowrap shrink-0 ${
                isSelected
                  ? "bg-[#E8F5E9] border-[#C8E6C9] text-[#2E7D32]"
                  : "bg-[#F3F2EF] border-[#E8E5DF] text-muted-foreground hover:bg-[#E8E5DF]"
              }`}
            >
              {h.name}
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-4 pb-24 space-y-6 flex-1 overflow-y-auto">
        {/* CURRENT SECTOR */}
        {countCurrent > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 px-1 mb-1.5">
              <span className="text-[9.5px] font-extrabold text-[#3730A3] uppercase tracking-widest leading-none">Current</span>
              <span className="bg-[#E0E7FF] text-[#3730A3] text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">{countCurrent}</span>
            </div>
            <div className="space-y-2.5">
              {currentTasks.map((t) => {
                const duration = t.type === "STE" ? 45 : t.type === "DLX" ? 35 : 25;
                const eta = t.actual_start_time ? minutesToTime(timeToMinutes(t.actual_start_time) + duration) : t.scheduled_end_time || "10:25";
                const rem = getRemainingInfo(simTime, eta);

                return (
                  <div key={t.number} className="rounded-2xl bg-white border border-[#E8E5DF] shadow-sm p-4.5 space-y-3 relative overflow-hidden">
                    {/* Simplified Merged Header */}
                    <div className="flex justify-between items-center pb-2 border-b border-[#F3F2EF]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14.5px] font-extrabold text-foreground">Room {t.number}</span>
                        <span className="text-[9.5px] font-extrabold bg-[#EFEDE8] text-muted-foreground px-1.5 py-0.5 rounded uppercase tracking-wider leading-none">{t.type}</span>
                        <span className="text-[11.5px] text-muted-foreground font-semibold">Floor {t.floor}</span>
                        <span className="text-muted-foreground/30 text-[10px]">|</span>
                        <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100/60 flex items-center gap-1 leading-none">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {t.attendant}
                        </span>
                      </div>
                      <Lock size={13} className="text-muted-foreground/60 mr-0.5 shrink-0" />
                    </div>

                    {/* Timing grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1 text-left">
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Started</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">{formatTimeStr(t.actual_start_time)}</div>
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* UPCOMING SECTOR */}
        {countUpcoming > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 px-1 mb-1.5">
              <span className="text-[9.5px] font-extrabold text-[#991B1B] uppercase tracking-widest leading-none">Upcoming</span>
              <span className="bg-[#FEE2E2] text-[#991B1B] text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">{countUpcoming}</span>
            </div>
            <div className="space-y-2.5">
              {upcomingTasks.map((t) => {
                const duration = t.type === "STE" ? 45 : t.type === "DLX" ? 35 : 25;
                const upcomingHkRooms = upcomingTasks.filter((r) => r.attendant === t.attendant);
                const qPos = upcomingHkRooms.findIndex((r) => r.number === t.number) + 1;

                return (
                  <div key={t.number} className="rounded-2xl bg-white border border-[#E8E5DF] shadow-sm p-4.5 space-y-3 relative overflow-hidden">
                    {/* Simplified Merged Header */}
                    <div className="flex justify-between items-center pb-2 border-b border-[#F3F2EF]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14.5px] font-extrabold text-foreground">Room {t.number}</span>
                        <span className="text-[9.5px] font-extrabold bg-[#EFEDE8] text-muted-foreground px-1.5 py-0.5 rounded uppercase tracking-wider leading-none">{t.type}</span>
                        <span className="text-[11.5px] text-muted-foreground font-semibold">Floor {t.floor}</span>
                        <span className="text-muted-foreground/30 text-[10px]">|</span>
                        <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100/60 flex items-center gap-1 leading-none">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {t.attendant}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setReassigningRoom(t);
                          setTempHk(null);
                        }}
                        className="h-6.5 px-2.5 rounded-lg border border-[#E8E5DF] hover:border-emerald-500 hover:text-emerald-700 bg-white text-[10.5px] font-extrabold text-muted-foreground active:scale-95 transition-all shadow-sm"
                      >
                        Reassign
                      </button>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1 text-left">
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Scheduled</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">{formatTimeStr(t.scheduled_start_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Duration</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">{duration} mins</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Queue Rank</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">#{qPos} in queue</div>
                      </div>
                    </div>

                    {/* Inline Reassign pill selection panel */}
                    {reassigningRoom?.number === t.number && (
                      <div className="mt-3 pt-3 border-t border-[#F3F2EF] space-y-2.5 animate-fade-in bg-[#F8F7F4] p-3 rounded-2xl border border-[#E8E5DF]">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-extrabold text-[#7C7C8A] uppercase tracking-widest pl-0.5">Select Attendant</span>
                          <button
                            onClick={() => {
                              setReassigningRoom(null);
                              setTempHk(null);
                            }}
                            className="text-[10px] font-extrabold text-rose-400 hover:text-rose-500 uppercase tracking-wider"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {housekeepers
                            .filter((h) => h.name !== t.attendant) // Exclude current housekeeper
                            .map((h) => {
                              const isSel = tempHk === h.name;
                              return (
                                <button
                                  key={h.name}
                                  onClick={() => setTempHk(h.name)}
                                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all active:scale-[0.96] ${
                                    isSel
                                      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                                      : "bg-white border-[#E8E5DF] text-muted-foreground hover:bg-[#F8F7F4]"
                                  }`}
                                >
                                  {h.name}
                                </button>
                              );
                            })}
                        </div>
                        {tempHk && (
                          <button
                            onClick={() => handleReassignSelect(tempHk)}
                            className="w-full h-8.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-extrabold active:scale-[0.97] transition-all shadow-sm flex items-center justify-center gap-1 mt-1 animate-fade-in"
                          >
                            Confirm
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PAST SECTOR */}
        {countPast > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 px-1 mb-1.5">
              <span className="text-[9.5px] font-extrabold text-[#065F46] uppercase tracking-widest leading-none">Past</span>
              <span className="bg-[#D1FAE5] text-[#065F46] text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">{countPast}</span>
            </div>
            <div className="space-y-2.5 opacity-[0.75]">
              {pastTasks.map((t) => {
                const duration = t.type === "STE" ? 45 : t.type === "DLX" ? 35 : 25;
                return (
                  <div key={t.number} className="rounded-2xl bg-white border border-[#E8E5DF] shadow-sm p-4.5 space-y-3 relative overflow-hidden">
                    {/* Simplified Merged Header */}
                    <div className="flex justify-between items-center pb-2 border-b border-[#F3F2EF]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14.5px] font-extrabold text-[#4B5563]">Room {t.number}</span>
                        <span className="text-[9.5px] font-extrabold bg-[#EFEDE8] text-muted-foreground px-1.5 py-0.5 rounded uppercase tracking-wider leading-none">{t.type}</span>
                        <span className="text-[11.5px] text-muted-foreground font-semibold">Floor {t.floor}</span>
                        <span className="text-muted-foreground/30 text-[10px]">|</span>
                        <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100/60 flex items-center gap-1 leading-none">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {t.attendant}
                        </span>
                      </div>
                      <CheckCircle2 size={14} className="text-emerald-600 mr-0.5 shrink-0" />
                    </div>

                    {/* Timings */}
                    <div className="grid grid-cols-3 gap-2 pt-1 text-left">
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Started</div>
                        <div className="text-[12px] font-extrabold text-[#4B5563] mt-0.5">{formatTimeStr(t.actual_start_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Completed</div>
                        <div className="text-[12px] font-extrabold text-[#4B5563] mt-0.5">{formatTimeStr(t.actual_end_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Duration</div>
                        <div className="text-[12px] font-extrabold text-[#4B5563] mt-0.5">{duration} mins</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {checkoutRooms.length === 0 && (
          <div className="text-center py-20 text-muted-foreground text-[13px] font-medium bg-white rounded-2xl border border-[#E8E5DF] p-6">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
