import { Room, Housekeeper, rooms as initialRooms, housekeepers as initialHousekeepers, RoomStatus } from "./data";

export interface SimState {
  rooms: Record<string, Room>;
  housekeepers: Record<string, {
    name: string;
    status: "Cleaning" | "Available" | "Not Arrived" | "ABSENT" | "Inspecting";
    currentRoom?: string;
    completed: string[];
    nextInQueue?: string;
  }>;
  reviewQueue: any[];
}

export const checkOutRooms = [
  "201", "202", "203", "204", "205", "301", "302", "303", "304", "305", "401", "402", "403", "503", "505"
];

export const continuingRooms = ["404", "405", "502"];

export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 600;
  if (timeStr.includes("T")) {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }
  const parts = timeStr.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return (isNaN(h) ? 10 : h) * 60 + (isNaN(m) ? 0 : m);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function getHkColor(name: string): string {
  const colors = ["#818CF8", "#F472B6", "#FBBF24", "#34D399", "#2A9D8F"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export function compileSimulation(simTime: string, customRooms?: Room[], customHks?: Housekeeper[], assignmentsConfirmed?: boolean): SimState {
  const T_mins = timeToMinutes(simTime);
  const roomsList = (customRooms && customRooms.length > 0) ? customRooms : initialRooms;
  const hksList = (customHks && customHks.length > 0) ? customHks : initialHousekeepers;

  const isConfirmed = assignmentsConfirmed !== undefined 
    ? assignmentsConfirmed 
    : roomsList.some(r => r.attendant !== null && r.attendant !== undefined && r.attendant !== "");

  const roomsState: Record<string, Room> = {};
  roomsList.forEach((r) => {
    // Default starting state at 7:00 AM
    const isOccupied = r.number !== "501" && r.number !== "504";
    roomsState[r.number] = {
      ...r,
      status: isOccupied ? "occupied" : "ready",
      label: isOccupied ? "Occupied" : "Ready",
      attendant: r.attendant || undefined,
      cleaning_started_at: null,
      ready_at: null,
      cleaned_by: null,
    };
  });

  const hkState: SimState["housekeepers"] = {};
  hksList.forEach((h) => {
    hkState[h.name] = {
      name: h.name,
      status: "Available",
      completed: [],
      nextInQueue: "None",
    };
  });

  // Calculate timelines if we are at checkout time T >= 10:00 AM (600 mins) and assignments are confirmed!
  if (T_mins >= 600 && isConfirmed) {
    // Turn the 15 checkout rooms to Dirty
    checkOutRooms.forEach((num) => {
      if (roomsState[num]) {
        roomsState[num].status = "dirty";
        roomsState[num].label = "Dirty";
      }
    });

    hksList.forEach((hk) => {
      const stateHk = hkState[hk.name];
      if (!stateHk) return;

      // Filter rooms in housekeeper's assigned queue that are checkout rooms
      const assignedCheckoutRooms = hk.rooms.filter(num => checkOutRooms.includes(num));

      let currentMins = 600; // 10:00 AM start

      // 1. Sort these rooms by priority first!
      const sortedRooms = assignedCheckoutRooms.map(num => roomsState[num]).filter(Boolean);
      sortedRooms.sort((a, b) => {
        // Active/completed first, upcoming last
        const aActive = a.status === "ready" || a.status === "cleaning" || a.actual_start_time || a.actual_end_time;
        const bActive = b.status === "ready" || b.status === "cleaning" || b.actual_start_time || b.actual_end_time;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;

        if (aActive && bActive) {
          const aTime = timeToMinutes(a.scheduled_start_time || "10:00");
          const bTime = timeToMinutes(b.scheduled_start_time || "10:00");
          return aTime - bTime;
        }

        // Upcoming: STE (0), DLX (1), STD (2)
        const typeOrder: Record<string, number> = { STE: 0, DLX: 1, STD: 2 };
        const aOrd = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 2;
        const bOrd = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 2;
        const diff = aOrd - bOrd;
        if (diff !== 0) return diff;

        return Number(a.number) - Number(b.number);
      });

      sortedRooms.forEach((room) => {
        const duration = room.type === "STE" ? 45 : room.type === "DLX" ? 35 : 25;
        const hasSchedule = room.scheduled_start_time && room.scheduled_end_time;

        if (hasSchedule) {
          if (room.scheduled_start_time!.includes("T")) {
            room.scheduled_start_time = minutesToTime(timeToMinutes(room.scheduled_start_time!));
          }
          if (room.scheduled_end_time!.includes("T")) {
            room.scheduled_end_time = minutesToTime(timeToMinutes(room.scheduled_end_time!));
          }
        } else {
          // If schedule time is not available, do not hardcode to 10 AM! Calculate it sequentially from currentMins!
          room.scheduled_start_time = minutesToTime(currentMins);
          room.scheduled_end_time = minutesToTime(currentMins + duration);
        }

        const start = timeToMinutes(room.scheduled_start_time!);
        const end = timeToMinutes(room.scheduled_end_time!);

        // Apply attendant linkage
        room.attendant = hk.name;

        // Set status transitions based on simulation T_mins
        if (T_mins >= start && T_mins < end) {
          room.status = "cleaning";
          room.label = "Cleaning";
          room.cleaning_started_at = minutesToTime(start);
          room.actual_start_time = minutesToTime(start);
          room.actual_end_time = null;
          room.cleaned_by_name = null;
          stateHk.status = "Cleaning";
          stateHk.currentRoom = room.number;
        } else if (T_mins >= end) {
          room.status = "ready";
          room.label = "Ready";
          room.cleaning_started_at = minutesToTime(start);
          room.ready_at = minutesToTime(end);
          room.cleaned_by = hk.name;
          room.actual_start_time = minutesToTime(start);
          room.actual_end_time = minutesToTime(end);
          room.cleaned_by_name = hk.name;
          stateHk.completed.push(room.number);
        } else {
          room.status = "dirty";
          room.label = "Dirty";
          room.actual_start_time = null;
          room.actual_end_time = null;
          room.cleaned_by_name = null;
        }

        currentMins = end;
      });

      // Find next room in queue
      const sortedNums = sortedRooms.map(r => r.number);
      const remaining = sortedNums.filter(rNum => !stateHk.completed.includes(rNum) && stateHk.currentRoom !== rNum);
      stateHk.nextInQueue = remaining[0] || "None";
    });
  }

  // 1:00 PM Check-in check (780 mins)
  if (T_mins >= 780) {
    Object.keys(roomsState).forEach((num) => {
      const room = roomsState[num];
      // Any READY room becomes OCCUPIED
      if (room.status === "ready") {
        room.status = "occupied";
        room.label = "Occupied";
      }
    });
  }

  return {
    rooms: roomsState,
    housekeepers: hkState,
    reviewQueue: [],
  };
}
