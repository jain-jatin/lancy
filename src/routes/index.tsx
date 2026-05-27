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
import { CleanerView } from "@/UI/views/CleanerView";
import { Room, housekeepers, Housekeeper } from "@/simulation/data";
import { lancyService } from "@/Backend/services/lancy-service";
import { compileSimulation, timeToMinutes, HK_ARRIVALS } from "@/simulation/engine";
import { AppSelect } from "@/UI/components/AppSelect";

export const Route = createFileRoute("/")({ component: LancyApp });

type Step =
  | "intro" | "priority" | "priority-done"
  | "issue" | "issue-sent"
  | "frontdesk" | "frontdesk-done"
  | "sofia" | "sofia-done"
  | "maintenance" | "maintenance-done";

interface ChatItem { id: string; render: () => React.ReactNode }

const timePills = [
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
  const [extra, setExtra] = useState<ChatItem[]>(() => [
    {
      id: "greeting",
      render: () => <LancyBubble>Good morning, Marcus. Would you like to see the summary of today's checkouts and checkins?</LancyBubble>
    },
    {
      id: "greeting-btn",
      render: () => (
        <div className="flex flex-wrap gap-2 mt-1 pl-1">
          <button
            onClick={() => onSendRef.current("Yes, please")}
            className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm"
          >
            Yes, please
          </button>
        </div>
      )
    }
  ]);
  const [activeHkName, setActiveHkName] = useState<string>(housekeepers[0].name);
  const [hkChatMap, setHkChatMap] = useState<Record<string, Array<{ id: string; from: "lancy" | "hk"; text: string }>>>(() =>
    Object.fromEntries(housekeepers.map((h) => [h.name, [
      { id: "init-" + h.name, from: "lancy", text: `Good morning, ${h.name}. You are assigned to Floors 2 & 5 today. Your active task queue has 4 rooms.` }
    ]]))
  );

  const [selectedTime, setSelectedTime] = useState("08:00");
  const [simState, setSimState] = useState(() => compileSimulation("08:00"));
  const roomsList = Object.values(simState.rooms);

  // Proactive greeting on selection change
  useEffect(() => {
    const triggerProactiveGreeting = async () => {
      const currentMins = timeToMinutes(selectedTime);
      const arrivalTimeStr = HK_ARRIVALS[activeHkName] || "08:00";
      const hasArrived = currentMins >= timeToMinutes(arrivalTimeStr);

      if (!hasArrived) {
        setHkChatMap((prev) => ({
          ...prev,
          [activeHkName]: [
            {
              id: "init-" + activeHkName,
              from: "lancy",
              text: `${activeHkName} has not arrived yet (arrives at ${arrivalTimeStr}).`
            }
          ]
        }));
        return;
      }

      // Check if already absent
      const dbHks = await lancyService.getHousekeepers();
      const hk = dbHks.find((h) => h.name === activeHkName);
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

  // Keep React state 100% synchronized with persistent database
  useEffect(() => {
    const syncFromDb = async () => {
      const dbRooms = await lancyService.getRooms();
      const dbHks = await lancyService.getHousekeepers();
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
    syncFromDb();
  }, [selectedTime, tab]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const onSendRef = useRef<(text: string) => Promise<void>>(async () => {});

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

  const handleSimulate = async (time: string) => {
    setSelectedTime(time);
    const compiled = compileSimulation(time);
    setSimState(compiled);

    // Reset housekeeper chats on Simulate!
    setHkChatMap(
      Object.fromEntries(housekeepers.map((h) => [h.name, [
        { id: "init-" + h.name, from: "lancy", text: `Good morning, ${h.name}. You are assigned to Floors 2 & 5 today. Your active task queue has 4 rooms.` }
      ]]))
    );

    // Sync mock DB (localStorage) with compiled state
    const dbHks = await lancyService.getHousekeepers();
    const dbRooms = await lancyService.getRooms();

    for (const hk of dbHks) {
      const compHk = compiled.housekeepers[hk.name];
      if (compHk) {
        let dbActivity: "INSPECTION" | "CLEANING" | null = null;
        if (compHk.status === "Inspecting") dbActivity = "INSPECTION";
        if (compHk.status === "Cleaning") dbActivity = "CLEANING";

        await lancyService.updateHousekeeper(hk.name, {
          current_room: compHk.currentRoom || null,
          current_activity: dbActivity,
          rooms_completed: compHk.completed || [],
          next_room: compHk.nextInQueue && compHk.nextInQueue !== "None" ? compHk.nextInQueue : null,
        });
      }
    }

    for (const r of dbRooms) {
      const compRoom = compiled.rooms[r.number];
      if (compRoom) {
        await lancyService.updateRoomStatus(r.number, compRoom.status, {
          attendant: compRoom.attendant || undefined,
          damageReported: compRoom.damageReported || false,
          tvIssue: compRoom.tvIssue || false,
          isBlocked: compRoom.isBlocked || false,
          note: compRoom.note || undefined,
        });
      }
    }

    // Call buildAutoRecommendation to get deterministic Lancy recommendations
    const rec = await lancyService.buildAutoRecommendation(time);

    // Completely reset Marcus chat history (extra state) on Simulate to keep states aligned with time-warp
    const initMsgId = crypto.randomUUID();
    const newExtra: Array<{ id: string; render: () => React.ReactNode }> = [
      {
        id: initMsgId,
        render: () => <LancyBubble><div className="whitespace-pre-line">{rec.msg}</div></LancyBubble>
      }
    ];

    // Push action buttons for the simulation time
    if (time === "08:00") {
      newExtra.push({
        id: "simulate-action-08",
        render: () => (
          <div className="flex flex-wrap gap-2 pt-1 animate-fade-in">
            <button
              onClick={() => onSend("Yes, please")}
              className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm"
            >
              Show shift summary
            </button>
            <button
              onClick={() => onSend("where is everyone")}
              className="h-9 px-4 rounded-full border border-indigo-600 bg-white text-[13px] font-semibold text-indigo-700 active:bg-indigo-50 hover:bg-indigo-50 transition-all shadow-sm"
            >
              Show housekeeper assignments
            </button>
          </div>
        )
      });
    } else if (time === "10:00") {
      newExtra.push({
        id: "simulate-action-10",
        render: () => (
          <div className="flex flex-wrap gap-2 pt-1 animate-fade-in">
            <button
              onClick={() => onSend("where is everyone")}
              className="h-9 px-4 rounded-full border border-indigo-600 bg-white text-[13px] font-semibold text-indigo-700 active:bg-indigo-50 hover:bg-indigo-50 transition-all shadow-sm"
            >
              Show live housekeeper map
            </button>
            <button
              onClick={() => onSend("room turnarounds")}
              className="h-9 px-4 rounded-full border border-amber-600 bg-white text-[13px] font-semibold text-amber-700 active:bg-amber-50 hover:bg-amber-50 transition-all shadow-sm"
            >
              Check turnaround priorities
            </button>
          </div>
        )
      });
    }

    // Push inline card recommendations
    if (rec.recommendations && rec.recommendations.length > 0) {
      rec.recommendations.forEach((r) => {
        const btnId = `${r.roomNumber}-${r.hkName}-btn`;
        newExtra.push({
          id: btnId,
          render: () => (
            <div className="max-w-[88%] rounded-[14px] bg-white border border-border shadow-card p-3.5 mt-1 animate-fade-in">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Recommendation</div>
              <div className="text-[13px] font-bold text-foreground">Room {r.roomNumber} &rarr; {r.hkName}</div>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={async () => {
                    await lancyService.assignHousekeeperRoom(r.hkName, r.roomNumber);
                    toast.success(`Assigned Room ${r.roomNumber} to ${r.hkName}`);
                    // Refresh state
                    handleSimulate(time);
                  }}
                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold active:scale-95 transition-all shadow-sm"
                >
                  Assign {r.hkName}
                </button>
                <button
                  onClick={() => {
                    setActiveRoom(compiled.rooms[r.roomNumber] || null);
                  }}
                  className="h-8 px-3 rounded-lg border border-border hover:bg-secondary text-foreground text-[11px] font-bold active:scale-95 transition-all"
                >
                  Edit
                </button>
              </div>
            </div>
          )
        });
      });
    }

    setExtra(newExtra);
  };

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [step, extra, tab]);

  const onSend = async (text: string) => {
    console.log("[index.tsx] onSend triggered with text:", text);
    setExtra((prev) => prev.filter((item) => item.id !== "greeting-btn" && !item.id.endsWith("-btn")));
    pushMsg(<MarcusBubble>{text}</MarcusBubble>);
    
    // Call the intelligent operations AI
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
      } else if (res.card && res.card.action === "day-summary") {
        pushMsg(
          <div className="max-w-[88%] rounded-[14px] bg-white border border-border shadow-card p-3.5 mt-1 animate-fade-in">
            <div className="text-[10px] font-semibold text-muted-foreground label-track uppercase mb-2.5">Today at a glance</div>
            <div className="grid grid-cols-2 gap-3">
              <SummaryBlock
                title="Check-ins"
                total={checkIns.total}
                rows={[
                  { label: "VIP", value: checkIns.vip },
                  { label: "Deluxe", value: checkIns.deluxe },
                  { label: "Standard", value: checkIns.standard },
                ]}
              />
              <SummaryBlock
                title="Checkouts"
                total={checkOuts.total}
                rows={[
                  { label: "Early", value: checkOuts.early },
                  { label: "On time", value: checkOuts.onTime },
                  { label: "Late", value: checkOuts.late },
                ]}
              />
            </div>
          </div>
        );
 
        // Instantly append continuation option
        setTimeout(() => {
          pushMsg(
            <div className="flex flex-wrap gap-2 mt-1 pl-1">
              <button
                onClick={() => onSendRef.current("Go to Room turnarounds")}
                className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm animate-fade-in"
              >
                Continue to room Turnarounds
              </button>
            </div>,
            crypto.randomUUID() + "-btn"
          );
        }, 400);
      }
    }, 600);
  };

  onSendRef.current = onSend;

  const checkIns = { total: 17, vip: 1, deluxe: 7, standard: 9 };
  const checkOuts = { total: 15, early: 3, onTime: 12, late: 0 };

  return (
    <div className="h-screen w-full flex justify-center bg-[#EFEDE8] overflow-hidden">
      <Toaster position="top-center" />
      <div className="relative w-full max-w-[390px] h-screen bg-background flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <header className="bg-white border-b border-border px-5 pt-3 pb-3 shrink-0 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            {/* Left: hotel + name or attendant dropdown */}
            <div className="shrink-0">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Maplewood Suites</div>
              {tab === "cleaner" ? (
                <AppSelect
                  value={activeHkName}
                  onChange={setActiveHkName}
                  options={housekeepers.map((h) => ({ value: h.name, label: h.name }))}
                  headerVariant
                />
              ) : (
                <h1 className="text-[20px] font-extrabold tracking-tight text-[#1A1A2E] leading-tight">Marcus</h1>
              )}
            </div>
            {/* Right: compact time dropdown + simulate */}
            <div data-tour="simulate" className="flex items-center gap-2 flex-1 justify-end">
              <AppSelect
                value={selectedTime}
                onChange={setSelectedTime}
                options={timePills}
              />
              <button
                onClick={() => handleSimulate(selectedTime)}
                className="h-9 px-4 rounded-[10px] bg-accent text-white text-[13px] font-bold active:scale-[0.97] transition-all shrink-0 shadow-sm hover:bg-accent/90"
              >
                Simulate
              </button>
            </div>
          </div>
        </header>

        {/* Tab content */}
        <div className="flex-1 flex flex-col overflow-hidden animate-fade-in" key={tab}>
          {tab === "chat" && (
            <>
              {/* Chat feed */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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

                    {/* SCENARIO A: Guest Damage Card (from 10:10 AM) */}
                    {timeToMinutes(selectedTime) >= timeToMinutes("10:10") && (
                      <LancyBubble>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#991B1B] mb-1">
                          🚨 Room 204 Guest Damage
                        </div>
                        {"Rosa reported guest damage in Room 204 (broken mirror). I have notified the front desk. Charge will be applied to the departing guest's bill automatically."}
                      </LancyBubble>
                    )}

                    {/* SCENARIO B: Minor TV Issue Card (from 11:15 AM) */}
                    {timeToMinutes(selectedTime) >= timeToMinutes("11:15") && (
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
                    )}

                    {/* SCENARIO C: Major Plumbing Leak Card (from 12:17 PM) */}
                    {timeToMinutes(selectedTime) >= timeToMinutes("12:17") && (
                      <LancyCard urgency="urgent">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#991B1B] mb-1.5">
                          🚨 URGENT: Major Plumbing Issue
                        </div>
                        <div className="text-[13px] text-foreground mb-3">
                          Priya reports the bathroom is actively leaking in Room 402. Block room from inventory?
                        </div>
                        {simState.rooms["402"]?.status !== "blocked" && !simState.rooms["402"]?.isBlocked ? (
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
                    )}
                  </>
                )}
              </div>

              <div data-tour="mic" className="shrink-0 border-t border-border bg-white">
                <InputBar onSend={onSend} />
              </div>
            </>
          )}

          {tab === "rooms" && (
            <RoomsView onSelectRoom={(r) => setActiveRoom(r)} roomsList={roomsList} />
          )}

          {tab === "cleaner" && (
            <CleanerView
              roomsList={roomsList}
              onUpdateRoomStatus={handleUpdateRoomStatus}
              onSelectHousekeeper={setActiveHkName}
              activeHkName={activeHkName}
              selectedTime={selectedTime}
              chatMap={hkChatMap}
              onHousekeeperChat={handleHousekeeperChat}
              hkStatus={simState.housekeepers[activeHkName]?.status}
            />
          )}
        </div>

        <BottomNav active={tab} onChange={setTab} />

        {activeRoom && (
          <RoomDetail
            room={activeRoom}
            onClose={() => setActiveRoom(null)}
            onUpdateLancy={handleUpdateFromLancy}
            onUpdateRoomStatus={handleUpdateRoomStatus}
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
