import { Room, Housekeeper, rooms as initialRooms, housekeepers as initialHousekeepers, RoomStatus } from "./data";

export interface SimState {
  rooms: Record<string, Room>;
  housekeepers: Record<string, {
    name: string;
    status: "Cleaning" | "Available" | "Not Arrived" | "ABSENT";
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
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
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

export function compileSimulation(simTime: string, customRooms?: Room[], customHks?: Housekeeper[]): SimState {
  const T_mins = timeToMinutes(simTime);
  const roomsList = customRooms || initialRooms;
  const hksList = customHks || initialHousekeepers;

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

  // Calculate timelines if we are at checkout time T >= 10:00 AM (600 mins)
  if (T_mins >= 600) {
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

      assignedCheckoutRooms.forEach((rNum) => {
        const room = roomsState[rNum];
        if (!room) return;

        const duration = room.type === "STE" ? 45 : room.type === "DLX" ? 35 : 25;
        const start = currentMins;
        const end = currentMins + duration;

        // Apply Room attendant linkage
        room.attendant = hk.name;

        if (T_mins >= start && T_mins < end) {
          room.status = "cleaning";
          room.label = "Cleaning";
          room.cleaning_started_at = minutesToTime(start);
          stateHk.status = "Cleaning";
          stateHk.currentRoom = rNum;
        } else if (T_mins >= end) {
          room.status = "ready";
          room.label = "Ready";
          room.cleaning_started_at = minutesToTime(start);
          room.ready_at = minutesToTime(end);
          room.cleaned_by = hk.name;
          stateHk.completed.push(rNum);
        } else {
          // T_mins < start
          room.status = "dirty";
          room.label = "Dirty";
        }

        currentMins = end;
      });

      // Find next room in queue
      const remaining = assignedCheckoutRooms.filter(rNum => !stateHk.completed.includes(rNum) && stateHk.currentRoom !== rNum);
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
