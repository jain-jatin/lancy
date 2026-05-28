import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Phone, Wrench, Mic } from "lucide-react";
import { Toaster, toast } from "sonner";
import { LancyBubble, MarcusBubble, LancyCard } from "@/UI/components/Bubble";
import { ActionButton } from "@/UI/components/ActionButton";
import { RoomDetail } from "@/UI/views/RoomDetail";
import { HandoffScreen } from "@/UI/views/HandoffScreen";
import { InputBar } from "@/UI/components/InputBar";
import { BottomNav, Tab } from "@/UI/components/BottomNav";
import { RoomsView } from "@/UI/views/RoomsView";
import { TasksView } from "@/UI/views/TasksView";
import { AssignmentPlanCard } from "@/UI/components/AssignmentPlanCard";
import { Room, housekeepers, Housekeeper, CHECKOUT_ROOMS, RoomStatus } from "@/simulation/data";
import { lancyService } from "@/Backend/services/lancy-service";
import { compileSimulation, timeToMinutes, minutesToTime } from "@/simulation/engine";
import { AppSelect } from "@/UI/components/AppSelect";
import { supabase, isRealSupabaseConfigured } from "@/Backend/db/supabase";

const TIME_STEPS: Record<number, [number, number]> = {
  0: [9, 0],
  1: [10, 0],
  2: [10, 30],
  3: [11, 0],
  4: [11, 30],
  5: [12, 0],
  6: [12, 30]
};

const getSimDateTime = (step: number) => {
  const [h, m] = TIME_STEPS[step] || [9, 0];
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setSeconds(0, 0);
  d.setMilliseconds(0);
  return d;
};

const formatStepTime = (step: number) => {
  const [h, m] = TIME_STEPS[step] || [9, 0];
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export const Route = createFileRoute("/")({ component: LancyApp });

type Step =
  | "intro" | "priority" | "priority-done"
  | "issue" | "issue-sent"
  | "frontdesk" | "frontdesk-done"
  | "sofia" | "sofia-done"
  | "maintenance" | "maintenance-done";

interface ChatItem { id: string; render: () => React.ReactNode }

const timePills = [
  { value: "07:00", label: "7:00 AM" },
  { value: "07:30", label: "7:30 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "08:30", label: "8:30 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "13:30", label: "1:30 PM" },
  { value: "14:00", label: "2:00 PM" },
];

function LancyApp() {
  const [tab, setTab] = useState<Tab>("chat");
  const [step, setStep] = useState<Step>("intro");
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const isStatusUpcoming = (statusStr: string | null | undefined): boolean => {
    const s = (statusStr || "").toLowerCase();
    return s === "dirty" || s === "occupied";
  };

  const isStatusCleaning = (statusStr: string | null | undefined): boolean => {
    return (statusStr || "").toLowerCase() === "cleaning";
  };

  const isStatusReady = (statusStr: string | null | undefined): boolean => {
    return (statusStr || "").toLowerCase() === "ready";
  };

  const formatTaskTime = (tStr: string | null | undefined): string => {
    if (!tStr) return "10:00 AM";
    let working = tStr.trim();
    if (working.startsWith('T') || working.startsWith('t')) {
      working = working.substring(1);
    }
    if (working.includes('T')) {
      working = working.split('T')[1];
    }
    const parts = working.split(':');
    if (parts.length < 2) return "10:00 AM";
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return "10:00 AM";
    const displayHour = h % 12 || 12;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const sortHkRooms = (rooms: Room[]): Room[] => {
    return [...rooms].sort((a, b) => {
      const order: Record<string, number> = { STE: 0, Suite: 0, DLX: 1, Deluxe: 1, STD: 2, Standard: 2 };
      const diff = (order[a.type] ?? 2) - (order[b.type] ?? 2);
      if (diff !== 0) return diff;
      return timeToMinutes(a.scheduled_start_time || "10:00") - timeToMinutes(b.scheduled_start_time || "10:00");
    });
  };
  const [extra, setExtra] = useState<ChatItem[]>(() => [
    {
      id: "greeting",
      render: () => (
        <LancyBubble>
          Good morning Marcus. Here is today at Maplewood Suites.
          <br /><br />
          15 rooms checking out at 10:00 AM.
          <br />
          17 guests arriving by 12:00 PM.
          <br />
          5 housekeepers ready.
          <br /><br />
          Shall I generate the room cleaning tasks?
        </LancyBubble>
      )
    },
    {
      id: "greeting-btn",
      render: () => (
        <div className="flex flex-wrap gap-2 mt-1 pl-1">
          <button
            onClick={() => onSendRef.current("Yes, generate tasks")}
            className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm"
          >
            Yes, generate tasks
          </button>
        </div>
      )
    }
  ]);
  const [ticketFlow, setTicketFlow] = useState({ active: false, step: 0, room: "", issue: "" });
  const [flow, setFlow] = useState<{
    step: 'IDLE' | 'AWAITING_HK_SELECT' | 'AWAITING_ACTION' | 'AWAITING_REORDER_ROOM' | 'AWAITING_REORDER_POSITION' | 'AWAITING_REASSIGN_TASK' | 'AWAITING_REASSIGN_PERSON';
    selectedHK: string | null;
    selectedRoom: string | null;
    action: 'reorder' | 'reassign' | null;
  }>({
    step: 'IDLE',
    selectedHK: null,
    selectedRoom: null,
    action: null
  });

  const [latestNudgeMsg, setLatestNudgeMsg] = useState<{ id: string; content: React.ReactNode } | null>(null);

  const clearLatestNudges = () => {
    if (latestNudgeMsg) {
      const targetId = latestNudgeMsg.id;
      const content = latestNudgeMsg.content;
      setExtra((p) =>
        p.map((item) => {
          if (item.id === targetId) {
            return {
              ...item,
              render: () => <LancyBubble>{content}</LancyBubble>,
            };
          }
          return item;
        })
      );
      setLatestNudgeMsg(null);
    }
  };

  const pushMsgWithNudges = (content: React.ReactNode, nudges: string[]) => {
    clearLatestNudges();
    const id = "nudge-" + crypto.randomUUID();
    const item = {
      id,
      render: () => (
        <LancyBubble>
          {content}
          {nudges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-[#F3F2EF]">
              {nudges.map((lbl) => (
                <button
                  key={lbl}
                  onClick={() => {
                    setExtra((p) =>
                      p.map((x) => {
                        if (x.id === id) {
                          return {
                            ...x,
                            render: () => <LancyBubble>{content}</LancyBubble>,
                          };
                        }
                        return x;
                      })
                    );
                    setLatestNudgeMsg(null);
                    onSend(lbl);
                  }}
                  className="h-8 px-3.5 rounded-full border border-emerald-600 bg-white text-[12px] font-bold text-emerald-700 active:scale-[0.96] hover:bg-[#E8F5E9]/30 transition-all shadow-sm shrink-0 whitespace-nowrap cursor-pointer"
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </LancyBubble>
      ),
    };
    setLatestNudgeMsg({ id, content });
    setExtra((prev) => [...prev, item]);
  };

  const [activeHkName, setActiveHkName] = useState<string>(housekeepers[0].name);
  const [hkChatMap, setHkChatMap] = useState<Record<string, Array<{ id: string; from: "lancy" | "hk"; text: string }>>>(() =>
    Object.fromEntries(housekeepers.map((h) => [h.name, [
      { id: "init-" + h.name, from: "lancy", text: `Good morning, ${h.name}. You are assigned to Floors 2 & 5 today. Your active task queue has 4 rooms.` }
    ]]))
  );

  const [selectedTime, setSelectedTime] = useState("07:00");
  const [currentStep, setCurrentStep] = useState(0);
  const [assignmentsConfirmed, setAssignmentsConfirmed] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const [h, m] = TIME_STEPS[currentStep] || [9, 0];
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    setSelectedTime(`${hh}:${mm}`);
  }, [currentStep]);

  const [simState, setSimState] = useState(() => compileSimulation("07:00"));
  const [dbHksList, setDbHksList] = useState<Housekeeper[]>([]);
  const roomsList = Object.values(simState.rooms);

  // Proactive greeting on selection change
  useEffect(() => {
    const triggerProactiveGreeting = async () => {
      const currentMins = timeToMinutes(selectedTime);
      const arrivalTimeStr = "07:00";

      const dbHks = await lancyService.getHousekeepers();
      const hk = dbHks.find((h) => h.name === activeHkName);
      const hasCheckedIn = hk && hk.status && hk.status !== "Not Arrived" && hk.status !== "ABSENT";
      const hasArrived = currentMins >= timeToMinutes(arrivalTimeStr) || hasCheckedIn;

      if (!hasArrived) {
        setHkChatMap((prev) => ({
          ...prev,
          [activeHkName]: [
            {
              id: "init-" + activeHkName,
              from: "lancy",
              text: `Good morning, ${activeHkName}. Your shift is scheduled to start at ${arrivalTimeStr}. Do you want to start your shift now?`
            }
          ]
        }));
        return;
      }

      // Check if already absent
      if (hk && hk.status === "ABSENT") {
        setHkChatMap((prev) => ({
          ...prev,
          [activeHkName]: [
            {
              id: "init-" + activeHkName,
              from: "lancy",
              text: `${activeHkName} is ABSENT today.`
            }
          ]
        }));
        return;
      }

      // Rebuild greeting using current simulation state
      const dbRooms = await lancyService.getRooms();
      if (hk) {
        const greeting = await lancyService.generateHousekeeperGreeting(hk, dbRooms, selectedTime);
        setHkChatMap((prev) => {
          const currentMsgs = prev[activeHkName] || [];
          const hasUserSpoken = currentMsgs.some((m) => m.from === "hk");
          if (hasUserSpoken) {
            return prev;
          }
          return {
            ...prev,
            [activeHkName]: [
              {
                id: "init-" + activeHkName,
                from: "lancy",
                text: greeting,
              }
            ]
          };
        });
      }
    };

    triggerProactiveGreeting();
  }, [activeHkName, selectedTime]);

  // Keep React state 100% synchronized with persistent database and subscribe to realtime updates
  useEffect(() => {
    const syncFromDb = async () => {
      const dbRooms = await lancyService.getRooms();
      const dbHks = await lancyService.getHousekeepers();

      // Fetch working assignments state
      let dbAssignments: any[] = [];
      if (isRealSupabaseConfigured && supabase) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const { data } = await supabase
            .from('room_assignments')
            .select('*')
            .eq('shift_date', today)
            .order('housekeeper_name')
            .order('queue_position');
          if (data) {
            dbAssignments = data;
            setRooms(data);
          }

          // Fetch shifts simulation config
          const { data: config } = await supabase
            .from('shifts')
            .select('*')
            .eq('id', 1)
            .single();
          if (config) {
            setCurrentStep(config.current_step || 0);
            setAssignmentsConfirmed(config.assignments_confirmed || false);
          }
        } catch (e) {
          console.warn("Real-time sync error:", e);
        }
      }

      const isoToLocalTimeStr = (isoStr: string | null | undefined): string | null => {
        if (!isoStr) return null;
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) {
          // If it is already a time string like "10:00"
          if (typeof isoStr === 'string' && isoStr.includes(':')) {
            return isoStr.substring(0, 5);
          }
          return null;
        }
        const h = d.getHours().toString().padStart(2, "0");
        const m = d.getMinutes().toString().padStart(2, "0");
        return `${h}:${m}`;
      };

      setDbHksList(dbHks);
      setSimState((prev) => {
        const updatedRooms = { ...prev.rooms };

        if (dbAssignments.length > 0) {
          // Sync from working room_assignments table
          dbAssignments.forEach((r) => {
            const num = r.room_number;
            if (updatedRooms[num]) {
              let displayStatus: RoomStatus = (r.status || 'dirty').toLowerCase() as RoomStatus;
              if (currentStep === 0 && displayStatus !== 'ready') {
                displayStatus = 'occupied';
              }
              updatedRooms[num] = {
                ...updatedRooms[num],
                status: displayStatus,
                label: displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1),
                attendant: r.housekeeper_name,
                scheduled_start_time: isoToLocalTimeStr(r.scheduled_start),
                scheduled_end_time: isoToLocalTimeStr(r.scheduled_end),
                actual_start_time: isoToLocalTimeStr(r.actual_start),
                actual_end_time: isoToLocalTimeStr(r.actual_end),
              };
            }
          });
        } else {
          // Sync from master inventory rooms table
          dbRooms.forEach((r) => {
            if (updatedRooms[r.number]) {
              let displayStatus: RoomStatus = (r.status || 'occupied').toLowerCase() as RoomStatus;
              if (currentStep === 0 && displayStatus !== 'ready') {
                displayStatus = 'occupied';
              }
              updatedRooms[r.number] = {
                ...updatedRooms[r.number],
                ...r,
                status: displayStatus,
                label: displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1),
              };
            }
          });
        }

        const updatedHks = { ...prev.housekeepers };
        dbHks.forEach((h) => {
          if (updatedHks[h.name]) {
            updatedHks[h.name] = {
              ...updatedHks[h.name],
              status: h.status === "ABSENT" ? "ABSENT" : (h.current_activity === "INSPECTION" ? "Inspecting" : h.current_activity === "CLEANING" ? "Cleaning" : "Available"),
              currentRoom: h.current_room || undefined,
              completed: h.rooms_completed || [],
              nextInQueue: h.next_room || "None",
            };
          }
        });

        return {
          ...prev,
          rooms: updatedRooms,
          housekeepers: updatedHks,
        };
      });
    };

    syncFromDb();

    // Listen to real-time events to sync state reactively
    window.addEventListener("lancy-refetch-rooms", syncFromDb);

    const handleLocalUpdate = (e: any) => {
      syncFromDb();
    };
    window.addEventListener("lancy-mock-db-update", handleLocalUpdate);

    let channel: any = null;
    if (isRealSupabaseConfigured && supabase) {
      channel = supabase
        .channel('room-updates')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'room_assignments' },
          () => {
            syncFromDb();
          }
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'shifts' },
          () => {
            syncFromDb();
          }
        )
        .subscribe();
    }

    return () => {
      window.removeEventListener("lancy-refetch-rooms", syncFromDb);
      window.removeEventListener("lancy-mock-db-update", handleLocalUpdate);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [selectedTime, tab]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const onSendRef = useRef<(text: string) => Promise<void>>(async () => { });

  const pushMsg = (node: React.ReactNode, id: string = crypto.randomUUID()) =>
    setExtra((p) => [...p, { id, render: () => node }]);

  const handleAutoReassign = async (absentHkName: string, roomsToReassign: string[]) => {
    const dbHks = await lancyService.getHousekeepers();
    const dbRooms = await lancyService.getRooms();

    const presentHks = dbHks.filter((h) => h.name !== absentHkName && h.status !== "ABSENT");
    const assignmentsMade: Array<{ room: string; hk: string }> = [];

    for (const roomNum of roomsToReassign) {
      const roomObj = dbRooms.find((r) => r.number === roomNum);
      if (!roomObj) continue;

      const candidateHks = presentHks.filter((h) => {
        const assignedCount = dbRooms.filter((r) => r.attendant === h.name).length;
        return assignedCount < 4;
      });

      if (candidateHks.length === 0) {
        presentHks.sort((a, b) => {
          const aCount = dbRooms.filter((r) => r.attendant === a.name).length;
          const bCount = dbRooms.filter((r) => r.attendant === b.name).length;
          return aCount - bCount;
        });
        const bestHk = presentHks[0];
        if (bestHk) {
          await lancyService.updateRoomStatus(roomNum, "dirty", { attendant: bestHk.name });
          assignmentsMade.push({ room: roomNum, hk: bestHk.name });
        }
      } else {
        candidateHks.sort((a, b) => {
          const aRooms = dbRooms.filter((r) => r.attendant === a.name);
          const bRooms = dbRooms.filter((r) => r.attendant === b.name);
          const aFloor = aRooms.length > 0 ? aRooms[0].floor : 1;
          const bFloor = bRooms.length > 0 ? bRooms[0].floor : 1;
          return Math.abs(aFloor - roomObj.floor) - Math.abs(bFloor - roomObj.floor);
        });

        const bestHk = candidateHks[0];
        await lancyService.updateRoomStatus(roomNum, "dirty", { attendant: bestHk.name });
        assignmentsMade.push({ room: roomNum, hk: bestHk.name });
      }
    }

    pushMsg(
      <LancyBubble>
        <div className="flex items-start gap-2">
          <div className="text-[14px]">📋</div>
          <div className="text-[13px] leading-relaxed">
            <span className="font-bold text-emerald-800">Rooms Reassigned (Floors-Proximity)</span>
            <div className="mt-1.5 space-y-1">
              {assignmentsMade.length > 0 ? (
                assignmentsMade.map((asg) => (
                  <div key={asg.room}>Room {asg.room} reassigned to <span className="font-semibold text-emerald-700">{asg.hk}</span></div>
                ))
              ) : (
                <div className="text-muted-foreground">No rooms needed reassignment.</div>
              )}
            </div>
          </div>
        </div>
      </LancyBubble>
    );

    // Sync up state
    const freshRooms = await lancyService.getRooms();
    const freshHks = await lancyService.getHousekeepers();
    setSimState((prev) => {
      const updatedRooms = { ...prev.rooms };
      freshRooms.forEach((r) => {
        if (updatedRooms[r.number]) {
          updatedRooms[r.number] = { ...updatedRooms[r.number], ...r };
        }
      });
      const updatedHks = { ...prev.housekeepers };
      freshHks.forEach((h) => {
        if (updatedHks[h.name]) {
          updatedHks[h.name] = {
            ...updatedHks[h.name],
            status: h.status === "ABSENT" ? "ABSENT" : (h.current_activity === "INSPECTION" ? "Inspecting" : h.current_activity === "CLEANING" ? "Cleaning" : "Available"),
            currentRoom: h.current_room || undefined,
            completed: h.rooms_completed || [],
            nextInQueue: h.next_room || "None",
          };
        }
      });
      return {
        ...prev,
        rooms: updatedRooms,
        housekeepers: updatedHks,
      };
    });
  };

  const handleHousekeeperChat = async (hkName: string, text: string) => {
    const msgId = crypto.randomUUID();
    setHkChatMap((prev) => ({
      ...prev,
      [hkName]: [...(prev[hkName] ?? []), { id: msgId, from: "hk", text }],
    }));

    const reply = await lancyService.housekeeperChat(hkName, text);

    const replyId = crypto.randomUUID();
    setHkChatMap((prev) => ({
      ...prev,
      [hkName]: [...(prev[hkName] ?? []), { id: replyId, from: "lancy", text: reply }],
    }));

    const dbRooms = await lancyService.getRooms();
    const dbHks = await lancyService.getHousekeepers();
    setSimState((prev) => {
      const updatedRooms = { ...prev.rooms };
      dbRooms.forEach((r) => {
        if (updatedRooms[r.number]) {
          updatedRooms[r.number] = { ...updatedRooms[r.number], ...r };
        }
      });
      const updatedHks = { ...prev.housekeepers };
      dbHks.forEach((h) => {
        if (updatedHks[h.name]) {
          updatedHks[h.name] = {
            ...updatedHks[h.name],
            status: h.status === "ABSENT" ? "ABSENT" : (h.current_activity === "INSPECTION" ? "Inspecting" : h.current_activity === "CLEANING" ? "Cleaning" : "Available"),
            currentRoom: h.current_room || undefined,
            completed: h.rooms_completed || [],
            nextInQueue: h.next_room || "None",
          };
        }
      });
      return {
        ...prev,
        rooms: updatedRooms,
        housekeepers: updatedHks,
      };
    });

    const cleanText = text.toLowerCase();
    const isSickReport = cleanText.includes("sick") || cleanText.includes("cannot come") || cleanText.includes("not feeling well") || cleanText.includes("cannot make it") || cleanText.includes("won't be able") || cleanText.includes("can't make");
    const isLateReport = cleanText.includes("late") || cleanText.includes("running late");

    if (isSickReport) {
      const unfinishedRooms = dbRooms
        .filter((r) => r.attendant === hkName && r.status !== "ready")
        .map((r) => r.number);

      const cardId = crypto.randomUUID();
      pushMsg(
        <div className="max-w-[88%] rounded-[14px] bg-white border border-red-200 shadow-card p-3.5 mt-1 animate-fade-in" key={cardId}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-600 mb-1.5">
            🚨 DECISION REQUIRED
          </div>
          <div className="text-[13px] font-bold text-foreground mb-1">{hkName} reported absent</div>
          <div className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
            <strong>{hkName} says:</strong> "{text}". They have {unfinishedRooms.length} remaining rooms in their queue: {unfinishedRooms.join(', ') || 'none'}. How would you like to reassign?
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                await handleAutoReassign(hkName, unfinishedRooms);
                toast.success(`Reassigned remaining rooms for ${hkName}!`);
              }}
              className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold active:scale-95 transition-all shadow-sm"
            >
              Reassign to Available HK
            </button>
            <button
              onClick={() => {
                toast.info("Absence acknowledged. You can reassign rooms manually in the Rooms tab.");
              }}
              className="h-8 px-3 rounded-lg border border-border hover:bg-secondary text-foreground text-[11px] font-bold active:scale-95 transition-all"
            >
              I will handle manually
            </button>
          </div>
        </div>,
        cardId
      );
    }

    if (isLateReport) {
      pushMsg(
        <LancyBubble>
          <div className="flex items-start gap-2">
            <div className="text-[14px]">⏳</div>
            <div className="text-[13px] leading-relaxed">
              <span className="font-bold text-amber-700">Lancy Attendant Update</span>
              <div className="mt-1 text-foreground">
                <strong>{hkName}</strong> reported that they will be late. Their rooms are unassigned until they arrive. Lancy will auto-assign their first room as soon as they check in.
              </div>
            </div>
          </div>
        </LancyBubble>
      );
    }

    let alertMsg = "";
    if (cleanText.includes("damage") || cleanText.includes("broken") || cleanText.includes("mirror")) {
      alertMsg = `⚠️ **Damage Alert from ${hkName}:** Reported a broken item/mirror ("${text}"). Reception has been notified.`;
    } else if (cleanText.includes("sick") || cleanText.includes("leave") || cleanText.includes("fever") || cleanText.includes("cannot make") || cleanText.includes("won't be able") || cleanText.includes("can't make")) {
      alertMsg = `🚨 **Absence Alert:** ${hkName} reported sick and won't be able to complete their shift today.`;
    } else if (cleanText.includes("done") || cleanText.includes("finished") || cleanText.includes("complete") || cleanText.includes("room ready")) {
      alertMsg = `✅ **Task Completed by ${hkName}:** Completed cleaning their assigned room. Review is pending sign-off.`;
    } else if (cleanText.includes("ac") || cleanText.includes("leak") || cleanText.includes("pipe") || cleanText.includes("tv") || cleanText.includes("light") || cleanText.includes("flood") || cleanText.includes("electrical")) {
      alertMsg = `🔧 **Maintenance Request from ${hkName}:** Reported issue ("${text}"). Work order logged.`;
    } else if (cleanText.includes("marcus") || cleanText.includes("come") || cleanText.includes("supervisor")) {
      alertMsg = `🚨 **Urgent Alert:** ${hkName} requested your presence in-person at their current room.`;
    }

    if (alertMsg) {
      pushMsg(
        <LancyBubble>
          <div className="flex items-start gap-2">
            <div className="text-[14px]">🔔</div>
            <div className="text-[13px] leading-relaxed">
              <span className="font-bold text-emerald-800">Lancy Attendant Update</span>
              <div className="mt-1 text-foreground" dangerouslySetInnerHTML={{ __html: alertMsg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
            </div>
          </div>
        </LancyBubble>
      );
    }
  };

  const formatTime = (dateObj: Date): string => {
    const hrs = dateObj.getHours();
    const mins = dateObj.getMinutes();
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const displayHrs = hrs % 12 || 12;
    const displayMins = mins < 10 ? `0${mins}` : mins;
    return `${displayHrs}:${displayMins} ${ampm}`;
  };

  const buildAndAddLancySimulateMessage = (
    time: string,
    nowCleaning: any[],
    nowReady: any[],
    stillWaiting: any[]
  ) => {
    // Nothing has started yet (before 10 AM)
    if (nowCleaning.length === 0 && nowReady.length === 0) {
      const firstRooms = stillWaiting
        .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
        .slice(0, 5);
      pushMsg(
        <LancyBubble>
          {`It is ${time}. Checkout has not started yet. ` +
            `Your team is ready and waiting.\n\n` +
            `First rooms to open at 10:00 AM:\n` +
            firstRooms.map(r =>
              `${r.housekeeper_name} → Room ${r.room_number} (${r.room_type})`
            ).join('\n')}
        </LancyBubble>
      );
      return;
    }

    // Exactly 10:00 AM — everyone just started
    if (time === '10:00' && nowCleaning.length > 0 && nowReady.length === 0) {
      pushMsg(
        <LancyBubble>
          {`It is 10:00 AM. Checkouts processed. ` +
            `Your team is moving to their first rooms now.\n\n` +
            nowCleaning
              .sort((a, b) => a.housekeeper_name.localeCompare(b.housekeeper_name))
              .map(r =>
                `${r.housekeeper_name} → Room ${r.room_number} (${r.room_type})`
              ).join('\n') +
            `\n\nFirst wave completes around ` +
            formatTime(
              new Date(Math.max(...nowCleaning.map(r => new Date(r.scheduled_end).getTime())))
            ) + `.`}
        </LancyBubble>
      );
      return;
    }

    // Mid shift — mix of cleaning, ready, waiting
    let msg = `At ${time}:\n\n`;

    if (nowReady.length > 0) {
      msg += `Ready for guests (${nowReady.length}):\n`;
      msg += nowReady.map(r =>
        `Room ${r.room_number} — cleaned by ${r.housekeeper_name}`
      ).join('\n');
      msg += '\n\n';
    }

    if (nowCleaning.length > 0) {
      msg += `Being cleaned right now (${nowCleaning.length}):\n`;
      msg += nowCleaning.map(r => {
        const eta = formatTime(new Date(r.scheduled_end));
        return `Room ${r.room_number} — ${r.housekeeper_name}, done by ${eta}`;
      }).join('\n');
      msg += '\n\n';
    }

    if (stillWaiting.length > 0) {
      const next = stillWaiting
        .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0];
      msg += `${stillWaiting.length} rooms still waiting. `;
      msg += `Next up: Room ${next.room_number} with ${next.housekeeper_name} ` +
        `at ${formatTime(new Date(next.scheduled_start))}.`;
    }

    // All done
    if (stillWaiting.length === 0 && nowCleaning.length === 0) {
      msg = `All ${nowReady.length} rooms are ready for guests. ` +
        `Your team finished ahead of the 1:00 PM deadline. `;
    }

    pushMsg(
      <LancyBubble>
        <span className="whitespace-pre-wrap">{msg.trim()}</span>
      </LancyBubble>
    );
  };

  const todayAt = (timeStr: string): Date => {
    if (timeStr.includes('T')) {
      return new Date(timeStr);
    }
    const date = new Date();
    const cleaned = timeStr.replace(/\s*[AP]M\s*/i, '').trim();
    const [hours, minutes] = cleaned.split(':').map(Number);
    let h = hours;
    if (timeStr.toLowerCase().includes('pm') && h < 12) h += 12;
    if (timeStr.toLowerCase().includes('am') && h === 12) h = 0;
    date.setHours(h, minutes, 0, 0);
    return date;
  };

  const addLancyMessage = async (content: string) => {
    pushMsg(<LancyBubble>{content}</LancyBubble>);
    if (isRealSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('messages')
          .insert({
            role: 'lancy',
            content,
            shift_date: today
          });
      } catch (e) {
        console.warn("Failed to insert message:", e);
      }
    }
  };

  const handleNext = async () => {
    const newStep = currentStep + 1;
    if (newStep > 6) return;

    const simTime = getSimDateTime(newStep);

    if (isRealSupabaseConfigured && supabase) {
      if (newStep === 6) {
        const { data: assignments } = await supabase
          .from('room_assignments')
          .select('*')
          .eq('status', 'READY');
        if (assignments) {
          const updates = assignments.map(room => {
            lancyService.updateRoomStatus(room.room_number, 'occupied', {
              actual_start_time: room.scheduled_start,
              actual_end_time: room.scheduled_end,
            });
            return supabase!
              .from('room_assignments')
              .update({ status: 'OCCUPIED' })
              .eq('id', room.id);
          });
          await Promise.all(updates);
        }
        await supabase!
          .from('shifts')
          .update({ current_step: newStep })
          .eq('id', 1);
      } else {
        const { data: roomsData } = await supabase
          .from('room_assignments')
          .select('*')
          .neq('status', 'OCCUPIED');

        if (!roomsData || roomsData.length === 0) {
          addLancyMessage(
            "No assignments found. Please confirm assignments first."
          );
          return;
        }

        const updates = roomsData.map(room => {
          const start = new Date(room.scheduled_start);
          const end = new Date(room.scheduled_end);
          const st = simTime.getTime();

          let status = 'DIRTY';
          let actual_start = room.actual_start;
          let actual_end = room.actual_end;

          if (st >= start.getTime() && st < end.getTime()) {
            status = 'CLEANING';
            actual_start = room.scheduled_start;
            actual_end = null;
          } else if (st >= end.getTime()) {
            status = 'READY';
            actual_start = room.scheduled_start;
            actual_end = room.scheduled_end;
          } else {
            status = 'DIRTY';
            actual_start = null;
            actual_end = null;
          }

          // Keep rooms table in sync as well
          lancyService.updateRoomStatus(room.room_number, status.toLowerCase() as any, {
            actual_start_time: actual_start,
            actual_end_time: actual_end,
          });

          return supabase!
            .from('room_assignments')
            .update({ status, actual_start, actual_end })
            .eq('id', room.id);
        });

        await Promise.all(updates);

        await supabase!
          .from('shifts')
          .update({ current_step: newStep })
          .eq('id', 1);
      }
    } else {
      if (newStep === 6) {
        const roomsData = await lancyService.getRooms();
        for (const room of roomsData) {
          if (room.status === "ready") {
            await lancyService.updateRoomStatus(room.number, "occupied", {
              actual_start_time: room.scheduled_start_time || "10:00",
              actual_end_time: room.scheduled_end_time || "10:25",
              cleaned_by_name: room.attendant || null,
            });
          }
        }
      } else {
        const roomsData = await lancyService.getRooms();
        const assignedRooms = roomsData.filter(r => r.attendant && (r.scheduled_start_time || r.scheduled_end_time));

        if (assignedRooms.length === 0) {
          addLancyMessage(
            "No assignments found. Please confirm assignments first."
          );
          return;
        }

        const [simH, simM] = TIME_STEPS[newStep] || [9, 0];
        const simMins = simH * 60 + simM;

        for (const room of assignedRooms) {
          const start = timeToMinutes(room.scheduled_start_time || "10:00");
          const end = timeToMinutes(room.scheduled_end_time || "10:25");

          let status: Room["status"] = "dirty";
          let actual_start = room.actual_start_time;
          let actual_end = room.actual_end_time;

          if (simMins >= start && simMins < end) {
            status = "cleaning";
            actual_start = room.scheduled_start_time || "10:00";
            actual_end = null;
          } else if (simMins >= end) {
            status = "ready";
            actual_start = room.scheduled_start_time || "10:00";
            actual_end = room.scheduled_end_time || "10:25";
          } else {
            status = "dirty";
            actual_start = null;
            actual_end = null;
          }

          await lancyService.updateRoomStatus(room.number, status, {
            actual_start_time: actual_start,
            actual_end_time: actual_end,
            cleaned_by_name: status === "ready" ? room.attendant : null,
          });
        }
      }

      await lancyService.updateShift({
        started: true,
        status: "active",
      });
    }

    if (newStep === 4) {
      pushMsg(
        <LancyCard urgency="warning">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            🔧 Minor Issue · Room 303
          </div>
          <div className="text-[13px] text-foreground mb-3">
            James reports the TV is not functioning in Room 303. Do you want to continue cleaning or pause for maintenance?
          </div>
          <div className="flex gap-2">
            <ActionButton variant="primary" className="flex-1" onClick={() => toast.success("Maintenance ticket logged. Continue cleaning.")}>
              Continue Cleaning
            </ActionButton>
            <ActionButton variant="ghost" onClick={() => toast.info("Turnover paused for maintenance.")}>
              Pause
            </ActionButton>
          </div>
        </LancyCard>
      );
    } else if (newStep === 5) {
      pushMsg(<DynamicPlumbingIncidentCard />);
    }

    setCurrentStep(newStep);
    await buildLancyStepMessage(newStep);
  };

  const buildLancyStepMessage = async (step: number) => {
    if (step === 6) {
      addLancyMessage(`All rooms occupied. 12:30 PM. Checkin complete.`);
      return;
    }

    if (isRealSupabaseConfigured && supabase) {
      const { data: roomsData } = await supabase
        .from('room_assignments')
        .select('*')
        .neq('status', 'OCCUPIED');

      if (!roomsData) return;

      const ready = roomsData.filter(r => r.status === 'READY');
      const cleaning = roomsData.filter(r => r.status === 'CLEANING');
      const dirty = roomsData.filter(r => r.status === 'DIRTY');
      const timeLabel = formatStepTime(step);

      if (step === 1) {
        addLancyMessage(
          `Checkout complete. Team started cleaning rooms.\n\n` +
          cleaning.map(r =>
            `${r.housekeeper_name} → Room ${r.room_number} ` +
            `(${r.room_type}), ready by ` +
            `${formatTime(new Date(r.scheduled_end))}`
          ).join('\n') +
          (dirty.length > 0 ? `\n\n${dirty.length} rooms queued.` : '')
        );
        return;
      }

      if (step === 5 || roomsData.every(r => r.status === 'READY')) {
        addLancyMessage(
          `${ready.length} rooms guest ready. ` +
          `12:00 PM. Checkin begins.`
        );
        return;
      }

      let msg = `${timeLabel}. ${ready.length} rooms ready.\n\n`;

      if (cleaning.length > 0) {
        cleaning.forEach(r => {
          const minsLeft = Math.max(0, Math.round(
            (new Date(r.scheduled_end).getTime() - getSimDateTime(step).getTime()) / 60000
          ));
          msg += `${r.housekeeper_name} → Room ${r.room_number}, ` +
            `${minsLeft} mins left\n`;
        });
      }

      if (dirty.length > 0) {
        msg += `\n${dirty.length} rooms pending.`;
      }

      addLancyMessage(msg.trim());
    } else {
      const roomsData = await lancyService.getRooms();
      const assignedRooms = roomsData.filter(r => r.attendant && (r.scheduled_start_time || r.scheduled_end_time));

      if (assignedRooms.length === 0) return;

      const ready = assignedRooms.filter(r => r.status === 'ready');
      const cleaning = assignedRooms.filter(r => r.status === 'cleaning');
      const dirty = assignedRooms.filter(r => r.status === 'dirty' || r.status === 'occupied');
      const timeLabel = formatStepTime(step);

      const formatStringTime = (tStr: string | null | undefined) => {
        if (!tStr) return "10:00 AM";
        if (tStr.includes("T")) {
          const d = new Date(tStr);
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        const [h, m] = tStr.split(":").map(Number);
        const hour = h % 12 || 12;
        const ampm = h >= 12 ? "PM" : "AM";
        return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
      };

      if (step === 1) {
        addLancyMessage(
          `Checkout complete. Team started cleaning rooms.\n\n` +
          cleaning.map(r =>
            `${r.attendant} → Room ${r.number} ` +
            `(${r.type === "STE" ? "Suite" : r.type === "DLX" ? "Deluxe" : "Standard"}), ready by ` +
            `${formatStringTime(r.scheduled_end_time)}`
          ).join('\n') +
          (dirty.length > 0 ? `\n\n${dirty.length} rooms queued.` : '')
        );
        return;
      }

      if (step === 5 || assignedRooms.every(r => r.status === 'ready')) {
        addLancyMessage(
          `${ready.length} rooms guest ready. ` +
          `12:00 PM. Checkin begins.`
        );
        return;
      }

      let msg = `${timeLabel}. ${ready.length} rooms ready.\n\n`;

      if (cleaning.length > 0) {
        cleaning.forEach(r => {
          const [stepH, stepM] = TIME_STEPS[step] || [9, 0];
          const simMins = stepH * 60 + stepM;
          const endMins = timeToMinutes(r.scheduled_end_time || "10:25");
          const minsLeft = Math.max(0, endMins - simMins);

          msg += `${r.attendant} → Room ${r.number}, ` +
            `${minsLeft} mins left\n`;
        });
      }

      if (dirty.length > 0) {
        msg += `\n${dirty.length} rooms pending.`;
      }

      addLancyMessage(msg.trim());
    }
  };

  const initApp = async () => {
    // 1. Always reset local storage mock keys to wipe mock database residues!
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("lancy_local_rooms");
        localStorage.removeItem("lancy_local_housekeepers");
        localStorage.removeItem("lancy_local_messages");
        localStorage.removeItem("lancy_local_nudges");
        localStorage.removeItem("lancy_local_shift");
        localStorage.removeItem("lancy_local_supervisor_cards");
        localStorage.removeItem("lancy_local_maintenance_tickets");
        localStorage.removeItem("lancy_local_incidents");
      } catch (e) {
        console.warn("Wiping localStorage failed:", e);
      }
    }

    // 2. Reset real Supabase database if configured
    if (isRealSupabaseConfigured && supabase) {
      try {
        // Reset shifts table in database
        await supabase
          .from('shifts')
          .upsert({ id: 1, current_step: 0, assignments_confirmed: false });

        // Reset room_assignments table in database
        await supabase
          .from('room_assignments')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        // Reset housekeepers master queue assignments and active status
        const { data: hks } = await supabase
          .from('housekeepers')
          .select('name');
        if (hks) {
          for (const hk of hks) {
            await supabase
              .from('housekeepers')
              .update({
                rooms: [],
                current_room: null,
                current_activity: null
              })
              .eq('name', hk.name);
          }
        }

        // Reset master rooms table to clear previous assignments and statuses
        await supabase
          .from('rooms')
          .update({
            attendant: null,
            scheduled_start_time: null,
            scheduled_end_time: null,
            actual_start_time: null,
            actual_end_time: null,
            cleaned_by_name: null,
            status: 'occupied'
          })
          .neq('number', '0');

        await supabase
          .from('rooms')
          .update({ status: 'ready' })
          .in('number', ['501', '504']);
      } catch (e) {
        console.warn("initApp Supabase reset failed:", e);
      }
    }

    // 3. Reset local state variables
    setCurrentStep(0);
    setAssignmentsConfirmed(false);
    setRooms([]);

    // 4. Instantly trigger a complete state synchronisation with the newly cleaned database!
    window.dispatchEvent(new Event("lancy-refetch-rooms"));
  };

  useEffect(() => {
    initApp();
  }, []);

  const handleUpdateRoomStatus = async (number: string, status: Room["status"], updates?: Partial<Room>) => {
    if (number) {
      await lancyService.updateRoomStatus(number, status, updates);
    }

    // If a room is BLOCKED (needs maintenance):
    if (status === "blocked") {
      const dbHks = await lancyService.getHousekeepers();
      // Find if anyone is currently working in this room
      const workingHk = dbHks.find((h) => h.current_room === number);
      if (workingHk) {
        const nextRoom = workingHk.next_room || null;
        // Assign housekeeper to next room or clear current activity
        await lancyService.updateHousekeeper(workingHk.name, {
          current_room: null,
          current_activity: null,
          next_room: nextRoom,
        });

        // Relayout chat notification to Marcus
        const receptionMsg = `Reception has been alerted to reassign any upcoming guests for Room ${number}.`;
        const nextTaskMsg = nextRoom
          ? `${workingHk.name} has been reassigned to their next room in queue: Room ${nextRoom}.`
          : `${workingHk.name} has completed their queue and is now available.`;

        pushMsg(
          <LancyBubble>
            <div className="flex items-start gap-2">
              <div className="text-[14px]">🚨</div>
              <div className="text-[13px] leading-relaxed">
                <span className="font-bold text-red-800">Lancy Maintenance Update</span>
                <div className="mt-1 text-foreground">
                  Room <strong>{number}</strong> has been marked as <strong>BLOCKED</strong> due to maintenance. {receptionMsg} {nextTaskMsg}
                </div>
              </div>
            </div>
          </LancyBubble>
        );

        // Send housekeeper a notification in their chat tab
        const hkMsg = nextRoom
          ? `Marcus has blocked Room ${number} due to maintenance. Please stop work and proceed to Room ${nextRoom}.`
          : `Marcus has blocked Room ${number} due to maintenance. Please stop work and standby for new tasks.`;

        await lancyService.addMessage("lancy", workingHk.name, hkMsg);

        setHkChatMap((prev) => ({
          ...prev,
          [workingHk.name]: [
            ...(prev[workingHk.name] ?? []),
            { id: crypto.randomUUID(), from: "lancy", text: hkMsg },
          ],
        }));
      } else {
        // If no one is actively working inside it but it gets blocked
        pushMsg(
          <LancyBubble>
            <div className="flex items-start gap-2">
              <div className="text-[14px]">🔧</div>
              <div className="text-[13px] leading-relaxed">
                <span className="font-bold text-red-800">Room Blocked</span>
                <div className="mt-1 text-foreground">
                  Room <strong>{number}</strong> is now <strong>BLOCKED</strong> from inventory. Reception has been alerted to reassign incoming guests.
                </div>
              </div>
            </div>
          </LancyBubble>
        );
      }
    }

    // Reload state from database
    const dbRooms = await lancyService.getRooms();
    const dbHks = await lancyService.getHousekeepers();
    setDbHksList(dbHks);
    setSimState((prev) => {
      const updatedRooms = { ...prev.rooms };
      dbRooms.forEach((r) => {
        if (updatedRooms[r.number]) {
          updatedRooms[r.number] = {
            ...updatedRooms[r.number],
            ...r,
          };
        }
      });
      const updatedHks = { ...prev.housekeepers };
      dbHks.forEach((h) => {
        if (updatedHks[h.name]) {
          updatedHks[h.name] = {
            ...updatedHks[h.name],
            status: h.status === "ABSENT" ? "ABSENT" : (h.current_activity === "INSPECTION" ? "Inspecting" : h.current_activity === "CLEANING" ? "Cleaning" : "Available"),
            currentRoom: h.current_room || undefined,
            completed: h.rooms_completed || [],
            nextInQueue: h.next_room || "None",
          };
        }
      });
      return {
        ...prev,
        rooms: updatedRooms,
        housekeepers: updatedHks,
      };
    });
  };

  const DynamicPlumbingIncidentCard = () => {
    const isBlocked = simState.rooms["402"]?.status === "blocked" || simState.rooms["402"]?.isBlocked;
    return (
      <LancyCard urgency="urgent">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#991B1B] mb-1.5">
          🚨 URGENT: Major Plumbing Issue
        </div>
        <div className="text-[13px] text-foreground mb-3">
          Priya reports the bathroom is actively leaking in Room 402. Block room from inventory?
        </div>
        {!isBlocked ? (
          <div className="flex gap-2">
            <ActionButton
              variant="primary"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                handleUpdateRoomStatus("402", "blocked", { isBlocked: true } as any);
                toast.error("Room 402 BLOCKED. Priya reassigned to Room 405.");
              }}
            >
              Stop & Block Room
            </ActionButton>
            <ActionButton variant="ghost" onClick={() => toast.warning("Proceeding with caution.")}>
              Continue
            </ActionButton>
          </div>
        ) : (
          <div className="text-[12px] bg-red-50 text-red-700 rounded-xl p-3 border border-red-200 leading-snug">
            ✅ Room 402 is BLOCKED and out of inventory. Reception has been alerted to reassign guests.
          </div>
        )}
      </LancyCard>
    );
  };

  const handleUpdateFromLancy = async (msg: string) => {
    pushMsg(<LancyBubble>{msg}</LancyBubble>);
    setTab("chat");

    const lower = msg.toLowerCase();
    const match = msg.match(/\b\d{3}\b/);
    if (match) {
      const roomNum = match[0];
      if (lower.includes("assigned to")) {
        const hkMatch = msg.match(/assigned to (\w+)/i);
        const hkName = hkMatch ? hkMatch[1] : undefined;
        await handleUpdateRoomStatus(roomNum, "cleaning", { attendant: hkName });
      } else if (lower.includes("ready")) {
        await handleUpdateRoomStatus(roomNum, "ready");
      }
    }
  };

  const getDuration = (type: string) => (type === "STE" ? 45 : type === "DLX" ? 35 : 25);

  const parsePosition = (input: string, max: number): number => {
    const clean = input.toLowerCase().trim();
    if (clean.includes("top") || clean.includes("first") || clean === "1" || clean.includes("number 1")) {
      return 1;
    }
    if (clean.includes("second") || clean === "2" || clean.includes("number 2")) {
      return 2;
    }
    if (clean.includes("third") || clean === "3" || clean.includes("number 3")) {
      return 3;
    }
    if (clean.includes("fourth") || clean === "4" || clean.includes("number 4")) {
      return 4;
    }
    if (clean.includes("fifth") || clean === "5" || clean.includes("number 5")) {
      return 5;
    }
    if (clean.includes("last") || clean.includes("bottom")) {
      return max;
    }
    const match = clean.match(/\d+/);
    if (match) {
      const val = parseInt(match[0], 10);
      if (val >= 1 && val <= max) return val;
    }
    return 1;
  };

  const reorderHousekeeperQueue = async (hkName: string, roomNum: string, newPos: number) => {
    const dbHks = await lancyService.getHousekeepers();
    const dbRooms = await lancyService.getRooms();

    const hk = dbHks.find(h => h.name === hkName);
    if (!hk) return null;

    const currentRooms = hk.rooms || [];
    const remaining = currentRooms.filter(num => num !== roomNum);
    const targetIdx = Math.max(0, Math.min(newPos - 1, remaining.length));
    const newRooms = [...remaining];
    newRooms.splice(targetIdx, 0, roomNum);

    await lancyService.updateHousekeeper(hkName, { rooms: newRooms });

    let currentMins = 600;
    const updatedRoomsList = [];

    for (const num of newRooms) {
      const r = dbRooms.find(rm => rm.number === num);
      if (!r) continue;
      const duration = getDuration(r.type);
      const start = currentMins;
      const end = currentMins + duration;

      const startStr = minutesToTime(start);
      const endStr = minutesToTime(end);

      const updated = await lancyService.updateRoomStatus(num, r.status, {
        attendant: hkName,
        scheduled_start_time: startStr,
        scheduled_end_time: endStr,
      });
      updatedRoomsList.push(updated);
      currentMins = end;
    }

    return updatedRoomsList;
  };

  const reassignRoomBetweenHks = async (roomNum: string, fromHkName: string, toHkName: string) => {
    const dbHks = await lancyService.getHousekeepers();
    const dbRooms = await lancyService.getRooms();

    const fromHk = dbHks.find(h => h.name === fromHkName);
    const toHk = dbHks.find(h => h.name === toHkName);
    if (!fromHk || !toHk) return null;

    const remainingFromRooms = (fromHk.rooms || []).filter(num => num !== roomNum);
    await lancyService.updateHousekeeper(fromHkName, { rooms: remainingFromRooms });

    let currentMins = 600;
    for (const num of remainingFromRooms) {
      const r = dbRooms.find(rm => rm.number === num);
      if (!r) continue;
      const duration = getDuration(r.type);
      const start = currentMins;
      const end = currentMins + duration;

      await lancyService.updateRoomStatus(num, r.status, {
        scheduled_start_time: minutesToTime(start),
        scheduled_end_time: minutesToTime(end),
      });
      currentMins = end;

      // Find toHk anchor: end time of their last room
      // If they have no rooms, start at 10:00 AM (600 mins)
      const toHkCurrentRooms = toHk.rooms || []
      let toHkAnchor = 600

      if (toHkCurrentRooms.length > 0) {
        for (const num of toHkCurrentRooms) {
          const r = dbRooms.find(rm => rm.number === num)
          if (!r) continue
          const duration = getDuration(r.type)
          toHkAnchor += duration
        }
      }

      // Insert reassigned room at correct priority position
      const typeOrder: Record<string, number> = {
        Suite: 0, Deluxe: 1, Standard: 2
      }
      const movedRoom = dbRooms.find(rm => rm.number === roomNum)
      const movingPriority = typeOrder[movedRoom?.type ?? 'Standard'] ?? 2

      let insertAt = toHkCurrentRooms.length
      for (let i = 0; i < toHkCurrentRooms.length; i++) {
        const r = dbRooms.find(rm => rm.number === toHkCurrentRooms[i])
        if (!r) continue
        if ((typeOrder[r.type] ?? 2) > movingPriority) {
          insertAt = i
          break
        }
      }

      const updatedToRooms = [
        ...toHkCurrentRooms.slice(0, insertAt),
        roomNum,
        ...toHkCurrentRooms.slice(insertAt)
      ]

      await lancyService.updateHousekeeper(toHkName, { rooms: updatedToRooms })

      // Recalculate toHk complete queue from anchor
      // Must recalculate ALL rooms not just the new one
      let toCurrentMins = 600

      // First advance past any already-completed rooms
      // by finding the true anchor from scheduled times
      // For simplicity recalculate entire queue from 10 AM
      for (const num of updatedToRooms) {
        const r = dbRooms.find(rm => rm.number === num)
        if (!r) continue
        const duration = getDuration(r.type)
        const start = toCurrentMins
        const end = toCurrentMins + duration

        await lancyService.updateRoomStatus(num, r.status, {
          scheduled_start_time: minutesToTime(start),
          scheduled_end_time: minutesToTime(end),
        })
        toCurrentMins = end
      }
    }

    const toRooms = toHk.rooms || [];
    const targetRoomObj = dbRooms.find(r => r.number === roomNum);
    if (!targetRoomObj) return null;
    const targetType = targetRoomObj.type;

    const newToRooms = [];
    let inserted = false;

    for (const num of toRooms) {
      const r = dbRooms.find(rm => rm.number === num);
      if (!r) {
        newToRooms.push(num);
        continue;
      }

      if (!inserted) {
        if (targetType === "STE" && r.type !== "STE") {
          newToRooms.push(roomNum);
          inserted = true;
        } else if (targetType === "DLX" && r.type === "STD") {
          newToRooms.push(roomNum);
          inserted = true;
        }
      }
      newToRooms.push(num);
    }

    if (!inserted) {
      newToRooms.push(roomNum);
    }

    await lancyService.updateHousekeeper(toHkName, { rooms: newToRooms });

    currentMins = 600;
    const toHkUpdatedRooms = [];
    for (const num of newToRooms) {
      const r = dbRooms.find(rm => rm.number === num);
      if (!r) continue;
      const duration = getDuration(r.type);
      const start = currentMins;
      const end = currentMins + duration;

      const updated = await lancyService.updateRoomStatus(num, r.status, {
        attendant: toHkName,
        scheduled_start_time: minutesToTime(start),
        scheduled_end_time: minutesToTime(end),
      });
      toHkUpdatedRooms.push(updated);
      currentMins = end;
    }

    return { fromHkName, toHkName, toHkRooms: toHkUpdatedRooms };
  };

  const onSend = async (text: string) => {
    console.log("[index.tsx] onSend triggered with text:", text);
    setExtra((prev) => prev.filter((item) => item.id !== "greeting-btn" && !item.id.endsWith("-btn")));
    pushMsg(<MarcusBubble>{text}</MarcusBubble>);

    const clean = text.trim().toLowerCase();

    // Clear nudges dynamically whenever a new message starts processing
    clearLatestNudges();

    // FLOW RESET PATTERNS
    if (clean === "done" || clean === "thanks" || clean === "nevermind" || clean === "cancel" || clean === "completed queue") {
      setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
      pushMsg(<LancyBubble>Let me know if you need any other queue adjustments!</LancyBubble>);
      return;
    }

    if (clean.includes("see another housekeeper") || clean.includes("view another")) {
      setFlow({ step: 'AWAITING_HK_SELECT', selectedHK: null, selectedRoom: null, action: null });
      pushMsgWithNudges(
        <>
          Would you like to see any housekeeper's upcoming tasks?
        </>,
        dbHksList.length > 0 ? dbHksList.map(h => h.name) : ["Ana", "Rosa", "James", "Priya", "Sofia"]
      );
      return;
    }

    if (clean.includes("reorder again") || clean.includes("reassign another")) {
      setFlow({ step: 'AWAITING_HK_SELECT', selectedHK: null, selectedRoom: null, action: null });
      pushMsgWithNudges(
        <>
          Which housekeeper's queue would you like to edit?
        </>,
        dbHksList.length > 0 ? dbHksList.map(h => h.name) : ["Ana", "Rosa", "James", "Priya", "Sofia"]
      );
      return;
    }

    // DIRECT NLP COMMANDS (bypass the guided flow at any time)

    // NLP 1: SHOW TASKS
    const showTasksMatch = clean.match(/show\s+(\w+)'s\s+tasks/i) ||
      clean.match(/what\s+does\s+(\w+)\s+have/i) ||
      clean.match(/(\w+)'s\s+queue/i) ||
      clean.match(/upcoming\s+tasks\s+for\s+(\w+)/i);
    if (showTasksMatch) {
      const name = showTasksMatch[1].charAt(0).toUpperCase() + showTasksMatch[1].slice(1).toLowerCase();
      const validNames = dbHksList.length > 0 ? dbHksList.map(h => h.name) : ["Ana", "Rosa", "James", "Priya", "Sofia"];
      if (validNames.includes(name)) {
        const dbRooms = await lancyService.getRooms();
        const hkRooms = sortHkRooms(dbRooms.filter(r => r.attendant === name && isStatusUpcoming(r.status)));

        let contentText = "";
        if (hkRooms.length === 0) {
          contentText = `${name} has no upcoming tasks.`;
        } else {
          const roomList = hkRooms.map(r => `Room ${r.number} (${formatTaskTime(r.scheduled_start_time)})`).join(", ");
          contentText = `${name}: ${roomList}`;
        }

        setFlow({ step: 'AWAITING_ACTION', selectedHK: name, selectedRoom: null, action: null });
        pushMsgWithNudges(
          <div className="whitespace-pre-wrap">{contentText}</div>,
          ["Reorder a task", "Assign to someone else"]
        );
        return;
      }
    }

    // NLP 2: DIRECT REASSIGN
    const reassignMatch = clean.match(/(?:assign|move|give|reassign|put)\s+room\s+(\d{3})\s+(?:to|with)\s+(\w+)/i);
    if (reassignMatch) {
      const roomNum = reassignMatch[1];
      const destHkName = reassignMatch[2].charAt(0).toUpperCase() + reassignMatch[2].slice(1).toLowerCase();
      const validNames = dbHksList.length > 0 ? dbHksList.map(h => h.name) : ["Ana", "Rosa", "James", "Priya", "Sofia"];

      if (validNames.includes(destHkName)) {
        const dbRooms = await lancyService.getRooms();
        const rm = dbRooms.find(r => r.number === roomNum);

        if (rm && (isStatusCleaning(rm.status) || isStatusReady(rm.status))) {
          pushMsg(<LancyBubble>Room {roomNum} is already {rm.status}, it cannot be reassigned.</LancyBubble>);
          setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
          return;
        }

        if (rm && isStatusUpcoming(rm.status)) {
          const sourceHkName = rm.attendant || "Ana";
          if (sourceHkName === destHkName) {
            pushMsg(<LancyBubble>Room {roomNum} is already assigned to {destHkName}.</LancyBubble>);
            setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
            return;
          }

          // Run reassign logic
          await reassignRoomBetweenHks(roomNum, sourceHkName, destHkName);

          const freshRooms = await lancyService.getRooms();
          const toHkRooms = sortHkRooms(freshRooms.filter(r => r.attendant === destHkName && isStatusUpcoming(r.status)));

          let listStr = "";
          toHkRooms.forEach((r, idx) => {
            listStr += `${idx + 1}. Room ${r.number} — ${r.scheduled_start_time} to ${r.scheduled_end_time}${r.number === roomNum ? "  ← inserted here" : ""}\n`;
          });

          // Reload states
          const dbHks = await lancyService.getHousekeepers();
          setDbHksList(dbHks);
          setSimState(compileSimulation(selectedTime, freshRooms, dbHks));

          setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
          pushMsgWithNudges(
            <>
              Done. Room {roomNum} moved from {sourceHkName} to {destHkName}.
              <br /><br />
              {destHkName}'s updated queue:<br />
              {listStr.split("\n").map((line, idx) => <span key={idx}>{line}<br /></span>)}
            </>,
            ["See another housekeeper", "Reassign another", "Done"]
          );
          return;
        }
      }
    }

    // NLP 3: DIRECT REORDER
    let reorderRoom = "";
    let reorderPos = 1;
    let isReorder = false;

    if (clean.includes("top priority") || clean.includes("first")) {
      const m = clean.match(/(?:make|put)\s+room\s+(\d{3})/i);
      if (m) {
        reorderRoom = m[1];
        reorderPos = 1;
        isReorder = true;
      }
    } else {
      const m = clean.match(/room\s+(\d{3})\s+should\s+be\s+number\s+(\d+)/i) ||
        clean.match(/move\s+room\s+(\d{3})\s+to\s+position\s+(\d+)/i);
      if (m) {
        reorderRoom = m[1];
        reorderPos = parseInt(m[2], 10);
        isReorder = true;
      }
    }

    if (isReorder) {
      const dbRooms = await lancyService.getRooms();
      const rm = dbRooms.find(r => r.number === reorderRoom);
      const hkName = rm ? rm.attendant : null;

      if (hkName && rm && isStatusUpcoming(rm.status)) {
        await reorderHousekeeperQueue(hkName, reorderRoom, reorderPos);

        const freshRooms = await lancyService.getRooms();
        const hkRooms = sortHkRooms(freshRooms.filter(r => r.attendant === hkName && isStatusUpcoming(r.status)));

        let listStr = "";
        hkRooms.forEach((r, idx) => {
          listStr += `${idx + 1}. Room ${r.number} — ${r.scheduled_start_time} to ${r.scheduled_end_time}\n`;
        });

        // Reload states
        const dbHks = await lancyService.getHousekeepers();
        setDbHksList(dbHks);
        setSimState(compileSimulation(selectedTime, freshRooms, dbHks));

        setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
        pushMsgWithNudges(
          <>
            Done. Room {reorderRoom} is now number {reorderPos} in {hkName}'s queue.
            <br /><br />
            Updated schedule:<br />
            {listStr.split("\n").map((line, idx) => <span key={idx}>{line}<br /></span>)}
          </>,
          ["See another housekeeper", "Reorder again", "Done"]
        );
        return;
      }
    }

    // NLP 4: SWAP ROOMS
    const swapMatch = clean.match(/swap\s+room\s+(\d{3})\s+and\s+room\s+(\d{3})/i);
    if (swapMatch) {
      const rA = swapMatch[1];
      const rB = swapMatch[2];

      const dbRooms = await lancyService.getRooms();
      const dbHks = await lancyService.getHousekeepers();

      const rmA = dbRooms.find(r => r.number === rA);
      const rmB = dbRooms.find(r => r.number === rB);

      if (rmA && rmB && rmA.attendant && rmB.attendant && rmA.attendant === rmB.attendant && rmA.status === "dirty" && rmB.status === "dirty") {
        const hkName = rmA.attendant;
        const hk = dbHks.find(h => h.name === hkName);

        if (hk) {
          const currentRooms = [...(hk.rooms || [])];
          const idxA = currentRooms.indexOf(rA);
          const idxB = currentRooms.indexOf(rB);

          if (idxA !== -1 && idxB !== -1) {
            currentRooms[idxA] = rB;
            currentRooms[idxB] = rA;

            await lancyService.updateHousekeeper(hkName, { rooms: currentRooms });

            // Recalculate timings
            let currentMins = 600;
            for (const num of currentRooms) {
              const r = dbRooms.find(rm => rm.number === num);
              if (!r) continue;
              const duration = getDuration(r.type);
              const start = currentMins;
              const end = currentMins + duration;

              await lancyService.updateRoomStatus(num, r.status, {
                scheduled_start_time: minutesToTime(start),
                scheduled_end_time: minutesToTime(end),
              });
              currentMins = end;
            }

            const freshRooms = await lancyService.getRooms();
            const hkRooms = sortHkRooms(freshRooms.filter(r => r.attendant === hkName && isStatusUpcoming(r.status)));

            let listStr = "";
            hkRooms.forEach((r, idx) => {
              listStr += `${idx + 1}. Room ${r.number} — ${r.scheduled_start_time} to ${r.scheduled_end_time}\n`;
            });

            // Reload states
            const freshHks = await lancyService.getHousekeepers();
            setDbHksList(freshHks);
            setSimState(compileSimulation(selectedTime, freshRooms, freshHks));

            setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
            pushMsgWithNudges(
              <>
                Done. Swapped Room {rA} and Room {rB} in {hkName}'s queue.
                <br /><br />
                Updated schedule:<br />
                {listStr.split("\n").map((line, idx) => <span key={idx}>{line}<br /></span>)}
              </>,
              ["See another housekeeper", "Done"]
            );
            return;
          }
        }
      }
    }

    // STATE-GUIDED FLOW STEPS

    // STEP 1: AWAITING_HK_SELECT
    if (flow.step === 'AWAITING_HK_SELECT') {
      const name = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
      const validNames = dbHksList.length > 0 ? dbHksList.map(h => h.name) : ["Ana", "Rosa", "James", "Priya", "Sofia"];
      if (validNames.includes(name)) {
        const dbRooms = await lancyService.getRooms();
        const hkRooms = sortHkRooms(dbRooms.filter(r => r.attendant === name && isStatusUpcoming(r.status)));

        let contentText = "";
        if (hkRooms.length === 0) {
          contentText = `${name} has no upcoming tasks.`;
        } else {
          const roomList = hkRooms.map(r => `Room ${r.number} (${formatTaskTime(r.scheduled_start_time)})`).join(", ");
          contentText = `${name}: ${roomList}`;
        }

        setFlow({ step: 'AWAITING_ACTION', selectedHK: name, selectedRoom: null, action: null });
        pushMsgWithNudges(
          <div className="whitespace-pre-wrap">{contentText}</div>,
          ["Reorder a task", "Assign to someone else"]
        );
        return;
      } else {
        // Unrelated input: Reset to IDLE
        setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
      }
    }

    // STEP 2: AWAITING_ACTION
    if (flow.step === 'AWAITING_ACTION') {
      if (clean.includes("reorder")) {
        const name = flow.selectedHK!;
        const dbRooms = await lancyService.getRooms();
        const hkRooms = sortHkRooms(dbRooms.filter(r => r.attendant === name && isStatusUpcoming(r.status)));

        const roomNudges = hkRooms.map(r => `Room ${r.number}`);
        setFlow({ ...flow, step: 'AWAITING_REORDER_ROOM', action: 'reorder' });
        pushMsgWithNudges(
          <>
            Which room do you want to reorder?
            <br />
            {name}'s upcoming rooms:
          </>,
          roomNudges
        );
        return;
      } else if (clean.includes("assign") || clean.includes("reassign") || clean.includes("someone else")) {
        const name = flow.selectedHK!;
        const dbRooms = await lancyService.getRooms();
        const hkRooms = sortHkRooms(dbRooms.filter(r => r.attendant === name && isStatusUpcoming(r.status)));

        const roomNudges = hkRooms.map(r => `Room ${r.number}`);
        setFlow({ ...flow, step: 'AWAITING_REASSIGN_TASK', action: 'reassign' });
        pushMsgWithNudges(
          <>
            Which of {name}'s tasks do you want to reassign?
          </>,
          roomNudges
        );
        return;
      } else {
        // Unrelated input: Reset to IDLE
        setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
      }
    }

    // STEP 3: AWAITING_REORDER_ROOM
    if (flow.step === 'AWAITING_REORDER_ROOM') {
      const match = clean.match(/\d{3}/);
      if (match) {
        const roomNum = match[0];
        const name = flow.selectedHK!;

        setFlow({ ...flow, step: 'AWAITING_REORDER_POSITION', selectedRoom: roomNum });
        pushMsg(
          <LancyBubble>
            Where would you like Room {roomNum} in {name}'s queue?
            <br />
            Type a position like 'first', 'second', 'top', or 'number 2' — or just say the number.
          </LancyBubble>
        );
        return;
      } else {
        // Unrelated input: Reset to IDLE
        setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
      }
    }

    // STEP 4: AWAITING_REORDER_POSITION
    if (flow.step === 'AWAITING_REORDER_POSITION') {
      const name = flow.selectedHK!;
      const roomNum = flow.selectedRoom!;

      const dbRooms = await lancyService.getRooms();
      const hkRooms = sortHkRooms(dbRooms.filter(r => r.attendant === name && isStatusUpcoming(r.status)));

      const maxPos = hkRooms.length;
      const targetPos = parsePosition(clean, maxPos);

      // Run reorder
      await reorderHousekeeperQueue(name, roomNum, targetPos);

      // Get new schedule
      const freshRooms = await lancyService.getRooms();
      const newHkRooms = sortHkRooms(freshRooms.filter(r => r.attendant === name && isStatusUpcoming(r.status)));

      let listStr = "";
      newHkRooms.forEach((r, idx) => {
        listStr += `${idx + 1}. Room ${r.number} — ${r.scheduled_start_time} to ${r.scheduled_end_time}\n`;
      });

      // Reload local states
      const dbHks = await lancyService.getHousekeepers();
      setDbHksList(dbHks);
      setSimState(compileSimulation(selectedTime, freshRooms, dbHks));

      setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
      pushMsgWithNudges(
        <>
          Done. Room {roomNum} is now number {targetPos} in {name}'s queue.
          <br /><br />
          Updated schedule:<br />
          {listStr.split("\n").map((line, idx) => <span key={idx}>{line}<br /></span>)}
        </>,
        ["See another housekeeper", "Reorder again", "Done"]
      );
      return;
    }

    // STEP 5: AWAITING_REASSIGN_TASK
    if (flow.step === 'AWAITING_REASSIGN_TASK') {
      const match = clean.match(/\d{3}/);
      if (match) {
        const roomNum = match[0];
        const name = flow.selectedHK!;

        const allHkNames = dbHksList.length > 0 ? dbHksList.map(h => h.name) : ["Ana", "Rosa", "James", "Priya", "Sofia"];
        const otherHks = allHkNames.filter(h => h !== name);
        setFlow({ ...flow, step: 'AWAITING_REASSIGN_PERSON', selectedRoom: roomNum });
        pushMsgWithNudges(
          <>
            Assign Room {roomNum} to whom?
          </>,
          otherHks
        );
        return;
      } else {
        // Unrelated input: Reset to IDLE
        setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
      }
    }

    // STEP 6: AWAITING_REASSIGN_PERSON
    if (flow.step === 'AWAITING_REASSIGN_PERSON') {
      const destHkName = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
      const validNames = dbHksList.length > 0 ? dbHksList.map(h => h.name) : ["Ana", "Rosa", "James", "Priya", "Sofia"];

      if (validNames.includes(destHkName)) {
        const sourceHkName = flow.selectedHK!;
        const roomNum = flow.selectedRoom!;

        // Run reassignment logic
        await reassignRoomBetweenHks(roomNum, sourceHkName, destHkName);

        const freshRooms = await lancyService.getRooms();
        const toHkRooms = sortHkRooms(freshRooms.filter(r => r.attendant === destHkName && isStatusUpcoming(r.status)));

        let listStr = "";
        toHkRooms.forEach((r, idx) => {
          listStr += `${idx + 1}. Room ${r.number} — ${r.scheduled_start_time} to ${r.scheduled_end_time}${r.number === roomNum ? "  ← inserted here" : ""}\n`;
        });

        // Reload states
        const dbHks = await lancyService.getHousekeepers();
        setDbHksList(dbHks);
        setSimState(compileSimulation(selectedTime, freshRooms, dbHks));

        setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
        pushMsgWithNudges(
          <>
            Done. Room {roomNum} moved from {sourceHkName} to {destHkName}.
            <br /><br />
            {destHkName}'s updated queue:<br />
            {listStr.split("\n").map((line, idx) => <span key={idx}>{line}<br /></span>)}
          </>,
          ["See another housekeeper", "Reassign another", "Done"]
        );
        return;
      } else {
        // Unrelated input: Reset to IDLE
        setFlow({ step: 'IDLE', selectedHK: null, selectedRoom: null, action: null });
      }
    }

    // A. Intercept tab transitions
    if (clean === "rooms" || clean.includes("go to rooms") || clean.includes("room turnarounds") || clean === "rooms tab") {
      setTab("rooms");
      toast.info("Switching to Rooms tab.");
      return;
    }
    if (clean === "tasks" || clean.includes("go to tasks") || clean.includes("view tasks") || clean === "tasks tab") {
      setTab("tasks");
      toast.info("Switching to Tasks tab.");
      return;
    }

    // B. Multi-turn Maintenance Ticket flow state machine
    if (ticketFlow.active) {
      if (ticketFlow.step === 1) {
        const rNum = clean.replace(/room/g, "").trim();
        setTicketFlow({ active: true, step: 2, room: rNum, issue: "" });
        setTimeout(() => {
          pushMsg(<LancyBubble>Got it, Room {rNum}. What is the issue?</LancyBubble>);
        }, 500);
        return;
      } else if (ticketFlow.step === 2) {
        const issueText = text.trim();
        const randDigits = Math.floor(1000 + Math.random() * 9000);
        const ticketNum = `MT-${randDigits}`;

        await lancyService.addMaintenanceTicket({
          room_number: ticketFlow.room,
          issue: issueText,
          ticket_number: ticketNum,
        });

        // Set the room status to blocked if the ticket is raised
        await handleUpdateRoomStatus(ticketFlow.room, "blocked");

        setTimeout(() => {
          pushMsg(
            <LancyBubble>
              Done. Ticket [{ticketNum}] raised for Room {ticketFlow.room}: {issueText}. Maintenance team has been notified.
            </LancyBubble>
          );
        }, 500);

        setTicketFlow({ active: false, step: 0, room: "", issue: "" });
        return;
      }
    }

    const ticketTriggers = ["raise a ticket", "maintenance ticket", "log maintenance", "create a ticket"];
    if (ticketTriggers.some(t => clean.includes(t))) {
      setTicketFlow({ active: true, step: 1, room: "", issue: "" });
      setTimeout(() => {
        pushMsg(<LancyBubble>Sure. Which room is this for?</LancyBubble>);
      }, 500);
      return;
    }

    // C. Intercept Deterministic Cleaning Tasks Generation
    const assignTriggers = [
      "yes, generate tasks", "generate tasks", "yes, assign tasks", "yes", "assign", "generate", "go ahead",
      "sure", "ok", "do it", "please assign", "let's start", "yep", "generate room tasks", "generate room cleaning tasks"
    ];
    const confirmTriggers = [
      "yes, assign the tasks", "looks good, confirm", "confirm assignments", "confirm", "looks good"
    ];
    // Check if the input is an assignment trigger and tasks are not yet done
    const dbRoomsCheck = await lancyService.getRooms();
    const hasAttendants = dbRoomsCheck.some(r => r.attendant);

    if (!hasAttendants && confirmTriggers.some(phrase => clean === phrase || clean.includes(phrase))) {
      const plan: Record<string, string[]> = {
        Ana: ["203", "201", "202"],
        Rosa: ["205", "204", "301"],
        James: ["303", "304", "302"],
        Priya: ["305", "401", "402"],
        Sofia: ["505", "403", "503"],
      };

      await lancyService.confirmAssignments(plan);
      if (isRealSupabaseConfigured && supabase) {
        try {
          await supabase
            .from('shifts')
            .update({ assignments_confirmed: true })
            .eq('id', 1);
        } catch (e) {
          console.warn("Failed to confirm shifts assignments in DB:", e);
        }
      }
      setAssignmentsConfirmed(true);
      toast.success("Cleaning tasks confirmed!");

      setTimeout(async () => {
        const dbRooms = await lancyService.getRooms();
        const dbHks = await lancyService.getHousekeepers();
        setDbHksList(dbHks);
        setSimState(compileSimulation(selectedTime, dbRooms, dbHks));

        const totalTasks = dbRooms.filter(r => r.attendant).length;
        const totalHks = dbHks.length;
        const earliestTime = dbRooms.reduce((acc, r) => {
          if (!r.scheduled_start_time) return acc;
          return timeToMinutes(r.scheduled_start_time) < timeToMinutes(acc) ? r.scheduled_start_time : acc;
        }, "10:00");
        const formattedStartTime = formatTaskTime(earliestTime);

        pushMsgWithNudges(
          <>
            Done. All {totalTasks} tasks assigned across your {totalHks} housekeepers.
            <br />
            Everything starts at {formattedStartTime}.
            <br /><br />
            Would you like to see any housekeeper's upcoming tasks?
          </>,
          dbHks.map(h => h.name)
        );

        setFlow({
          step: 'AWAITING_HK_SELECT',
          selectedHK: null,
          selectedRoom: null,
          action: null
        });

        // Call analyzeAndAlert 3 seconds after assignments are confirmed (2500ms remaining after the 500ms delay)
        setTimeout(async () => {
          const freshRooms = await lancyService.getRooms();
          const proactiveAlert = await lancyService.analyzeAndAlert(selectedTime, freshRooms);
          if (proactiveAlert) {
            pushMsg(
              <LancyBubble>
                {proactiveAlert}
              </LancyBubble>
            );
          }
        }, 2500);
      }, 500);
      return;
    } else if (!hasAttendants && assignTriggers.some(phrase => clean === phrase || clean.includes(phrase))) {
      pushMsg(
        <LancyBubble>
          I have generated the shift cleaning tasks plan: Suites are prioritized first, Deluxe second, and Standard third. Within each type, cleaning tasks are distributed by floor proximity.
        </LancyBubble>
      );
      setTimeout(() => {
        pushMsg(
          <AssignmentPlanCard />
        );
      }, 400);
      setTimeout(() => {
        pushMsgWithNudges(
          <div className="text-[13px]">Would you like to confirm these cleaning tasks?</div>,
          ["Yes, assign the tasks"]
        );
      }, 800);
      return;
    }

    // D. Freeform Conversation Routing
    const res = await lancyService.lancyChat(text, undefined, selectedTime);
    console.log("[index.tsx] lancyChat response resolved:", res);

    setTimeout(() => {
      pushMsg(<LancyBubble>{res.reply}</LancyBubble>);

      if (res.buttons && res.buttons.length > 0) {
        pushMsg(
          <div className="flex flex-wrap gap-2 mt-1 pl-1">
            {res.buttons.map((btn) => (
              <button
                key={btn.label}
                onClick={() => onSendRef.current(btn.textToSend)}
                className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm animate-fade-in"
              >
                {btn.label}
              </button>
            ))}
          </div>,
          crypto.randomUUID() + "-btn"
        );
      }
    }, 500);
  };

  onSendRef.current = onSend;

  const checkIns = { total: 17, vip: 1, deluxe: 7, standard: 9 };
  const checkOuts = { total: 15, early: 3, onTime: 12, late: 0 };

  return (
    <div className="h-screen w-full flex justify-center bg-[#EFEDE8] overflow-hidden">
      <Toaster position="top-center" />
      <div className="app-shell shadow-2xl bg-background">
        {/* Header */}
        <header className="header shadow-sm">
          <div className="flex items-center justify-between gap-3">
            {/* Left: hotel + name or attendant dropdown */}
            <div className="shrink-0">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Maplewood Suites</div>
              <h1 className="text-[20px] font-extrabold tracking-tight text-[#1A1A2E] leading-tight">Marcus</h1>
            </div>
            {/* Right: Next button + plain text simulation time */}
            <div data-tour="simulate" className="flex items-center gap-3 flex-1 justify-end">
              <span className="text-[13px] font-extrabold text-[#1A1A2E] bg-[#F3F2EF] border border-[#E8E5DF] px-3 py-1.5 rounded-[10px] select-none">
                {formatStepTime(currentStep)}
              </span>
              <button
                onClick={handleNext}
                disabled={(currentStep === 0 && !assignmentsConfirmed) || currentStep === 6}
                className="h-9 px-4 rounded-[10px] bg-[#2A9D8F] text-white text-[13px] font-extrabold active:scale-[0.97] transition-all shrink-0 shadow-sm hover:bg-[#208075] disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100 cursor-pointer"
              >
                {currentStep === 6 ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </header>

        {/* Tab content */}
        <div className="tab-content animate-fade-in flex-grow flex-1 min-h-0 flex flex-col">
          {/* Chat Tab */}
          <div className="flex-grow flex-1 min-h-0 flex flex-col bg-background" style={{ display: tab === "chat" ? "flex" : "none" }}>
            {/* Chat feed */}
            <div ref={scrollRef} className="flex-grow flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              {/* 1. Dynamic conversational feed */}
              {extra.map((m) => (
                <div key={m.id} className="animate-fade-in">{m.render()}</div>
              ))}

              {/* 2. Real-time active operational scenario cards */}
              {timeToMinutes(selectedTime) >= timeToMinutes("10:00") && (
                <>
                  {/* Pending Supervisor Reviews Queue */}
                  {simState.reviewQueue.length > 0 && (
                    <LancyCard urgency="warning">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#92400E] mb-1.5">
                        ⚠️ Supervisor Review Pending
                      </div>
                      <div className="text-[13px] text-foreground mb-3">
                        {simState.reviewQueue.length} room{simState.reviewQueue.length > 1 ? "s" : ""} need{simState.reviewQueue.length === 1 ? "s" : ""} your review.
                      </div>
                      <div className="space-y-2">
                        {simState.reviewQueue.map((rev) => (
                          <div key={rev.room} className="flex items-center justify-between bg-[#FEF3C7]/40 border border-[#FEF3C7] rounded-xl p-3 text-[12px] shadow-sm animate-msg-in">
                            <div>
                              <span className="font-bold">Room {rev.room}</span> · {simState.rooms[rev.room]?.type}
                              <div className="text-[10px] text-muted-foreground mt-0.5">Housekeeper: {rev.housekeeper} · waiting since {rev.timeEntered}</div>
                            </div>
                            <button
                              onClick={() => {
                                const r = simState.rooms[rev.room];
                                if (r) setActiveRoom(r);
                              }}
                              className="h-7 px-3 rounded-lg bg-[#F59E0B] text-white text-[11px] font-bold active:scale-95 transition-transform"
                            >
                              Review
                            </button>
                          </div>
                        ))}
                      </div>
                    </LancyCard>
                  )}

                </>
              )}
            </div>

            <div data-tour="mic" className="shrink-0 border-t border-border bg-white">
              <InputBar onSend={onSend} />
            </div>
          </div>

          {/* Rooms Tab */}
          <div className="flex-grow flex-1 min-h-0 flex flex-col" style={{ display: tab === "rooms" ? "flex" : "none" }}>
            <RoomsView onSelectRoom={(r) => setActiveRoom(r)} roomsList={roomsList} />
          </div>

          {/* Tasks Tab */}
          <div className="flex-grow flex-1 min-h-0 flex flex-col" style={{ display: tab === "tasks" ? "flex" : "none" }}>
            <TasksView
              roomsList={roomsList}
              housekeepers={dbHksList}
              simTime={selectedTime}
              onUpdateRoomStatus={handleUpdateRoomStatus}
              onRefreshState={async () => {
                const rms = await lancyService.getRooms();
                const hks = await lancyService.getHousekeepers();
                setDbHksList(hks);
                setSimState(compileSimulation(selectedTime, rms, hks));
              }}
            />
          </div>
        </div>

        <BottomNav active={tab} onChange={setTab} />

        {activeRoom && (
          <RoomDetail
            room={activeRoom}
            onClose={() => setActiveRoom(null)}
            onUpdateLancy={handleUpdateFromLancy}
            onUpdateRoomStatus={handleUpdateRoomStatus}
            simTime={selectedTime}
          />
        )}

        {showDraft && (
          <>
            <div className="absolute inset-0 z-40 bg-black/30 animate-fade-in" onClick={() => setShowDraft(false)} />
            <div className="absolute left-0 right-0 bottom-0 z-50 bg-white rounded-t-[20px] p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-semibold tracking-tight">Maintenance · Room 215</h3>
                <button onClick={() => setShowDraft(false)} className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-lg leading-none">×</span>
                </button>
              </div>
              <div className="rounded-[12px] bg-secondary p-3.5 text-[13px] leading-relaxed mb-4 text-foreground">
                Room 215 has a broken shower head. Guest arriving at 3pm, please inspect and repair before 2pm. Priority: high.
              </div>
              <div className="flex gap-2">
                <ActionButton variant="primary" className="flex-1" onClick={() => { setShowDraft(false); setStep("issue-sent"); }}>Confirm & send</ActionButton>
                <ActionButton variant="ghost" onClick={() => setShowDraft(false)}>Edit</ActionButton>
              </div>
            </div>
          </>
        )}

        {showHandoff && (
          <HandoffScreen
            onClose={() => setShowHandoff(false)}
            onSend={() => { setShowHandoff(false); toast.success("Handoff sent to evening supervisor"); }}
          />
        )}
      </div>
    </div>
  );
}

function SummaryBlock({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: { label: string; value: number }[];
}) {
  return (
    <div className="rounded-[12px] bg-secondary p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase label-track text-muted-foreground">{title}</span>
        <span className="text-[13px] font-semibold text-foreground leading-none">{total}</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">{r.label}</span>
            <span className="text-[12px] font-semibold text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
