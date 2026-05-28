export type RoomStatus = "occupied" | "dirty" | "cleaning" | "ready";
export type RoomType = "STD" | "DLX" | "STE";

export interface Room {
  number: string;
  floor: number;
  type: RoomType;
  status: RoomStatus;
  label: string;
  attendant?: string;
  cleaning_started_at?: string | null;
  ready_at?: string | null;
  cleaned_by?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  cleaned_by_name?: string | null;
}

export interface Housekeeper {
  name: string;
  rooms: string[];
  active?: boolean;
  current_room?: string | null;
  current_activity?: "CLEANING" | null;
  rooms_completed?: string[];
  next_room?: string | null;
  status?: "PRESENT" | "ABSENT" | "IDLE" | "CLEANING" | "Not Arrived";
}

export const housekeepers: Housekeeper[] = [
  { name: "Ana", rooms: ["201", "202", "203", "502"], current_room: null, current_activity: null, rooms_completed: [], next_room: "201" },
  { name: "Rosa", rooms: ["204", "205", "301", "404"], current_room: null, current_activity: null, rooms_completed: [], next_room: "204" },
  { name: "James", rooms: ["302", "303", "304"], current_room: null, current_activity: null, rooms_completed: [], next_room: "302" },
  { name: "Priya", rooms: ["305", "401", "402", "405"], current_room: null, current_activity: null, rooms_completed: [], next_room: "305" },
  { name: "Sofia", rooms: ["403", "503", "505"], current_room: null, current_activity: null, rooms_completed: [], next_room: "403" },
];

export const statusDot: Record<RoomStatus, string> = {
  occupied: "bg-[#3B82F6]",
  dirty: "bg-[#EF4444]",
  cleaning: "bg-[#6366F1]",
  ready: "bg-[#10B981]",
};

export const statusBorder: Record<RoomStatus, string> = {
  occupied: "border-[#DBEAFE]",
  dirty: "border-[#FEE2E2]",
  cleaning: "border-[#E0E7FF]",
  ready: "border-[#D1FAE5]",
};

export const statusTag: Record<RoomStatus, string> = {
  occupied: "bg-[#DBEAFE] text-[#1E40AF]",
  dirty: "bg-[#FEE2E2] text-[#991B1B]",
  cleaning: "bg-[#E0E7FF] text-[#3730A3]",
  ready: "bg-[#D1FAE5] text-[#065F46]",
};

export const statusLabel: Record<RoomStatus, string> = {
  occupied: "Occupied",
  dirty: "Dirty",
  cleaning: "Cleaning",
  ready: "Ready",
};

export const statusColor = statusDot;

export const hotelRoomsBase = [
  { number: "201", floor: 2, type: "STD" },
  { number: "202", floor: 2, type: "STD" },
  { number: "203", floor: 2, type: "DLX" },
  { number: "204", floor: 2, type: "DLX" },
  { number: "205", floor: 2, type: "STE" },
  { number: "301", floor: 3, type: "STD" },
  { number: "302", floor: 3, type: "STD" },
  { number: "303", floor: 3, type: "DLX" },
  { number: "304", floor: 3, type: "DLX" },
  { number: "305", floor: 3, type: "STE" },
  { number: "401", floor: 4, type: "STD" },
  { number: "402", floor: 4, type: "STD" },
  { number: "403", floor: 4, type: "DLX" },
  { number: "404", floor: 4, type: "DLX" },
  { number: "405", floor: 4, type: "STE" },
  { number: "501", floor: 5, type: "STD" },
  { number: "502", floor: 5, type: "STD" },
  { number: "503", floor: 5, type: "DLX" },
  { number: "504", floor: 5, type: "DLX" },
  { number: "505", floor: 5, type: "STE" },
];

export const rooms: Room[] = hotelRoomsBase.map((r) => {
  const isOccupied = r.number !== "501" && r.number !== "504";
  return {
    ...r,
    type: r.type as RoomType,
    status: isOccupied ? "occupied" : "ready",
    label: isOccupied ? "Occupied" : "Empty",
  };
});
