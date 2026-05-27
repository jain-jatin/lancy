export type RoomStatus = "occupied" | "dirty" | "cleaning" | "inspection" | "review" | "ready" | "blocked" | "empty";
export type RoomType = "STD" | "DLX" | "STE";

export interface Room {
  number: string;
  floor: number;
  type: RoomType;
  status: RoomStatus;
  label: string;
  attendant?: string;
  startedAt?: string;
  elapsed?: number;
  note?: string;
  flagged?: boolean;
  priority?: string;
  damageReported?: boolean;
  tvIssue?: boolean;
  isBlocked?: boolean;
}

export interface Housekeeper {
  name: string;
  rooms: string[];
  active?: boolean;
  current_room?: string | null;
  current_activity?: "INSPECTION" | "CLEANING" | null;
  rooms_completed?: string[];
  next_room?: string | null;
  status?: "PRESENT" | "ABSENT" | "IDLE" | "INSPECTION" | "CLEANING" | "Not Arrived";
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
  inspection: "bg-[#F59E0B]",
  cleaning: "bg-[#6366F1]",
  review: "bg-[#7C3AED]",
  ready: "bg-[#10B981]",
  blocked: "bg-[#DC2626]",
  empty: "bg-[#9CA3AF]",
};

export const statusBorder: Record<RoomStatus, string> = {
  occupied: "border-[#DBEAFE]",
  dirty: "border-[#FEE2E2]",
  inspection: "border-[#FEF3C7]",
  cleaning: "border-[#E0E7FF]",
  review: "border-[#EDE9FE]",
  ready: "border-[#D1FAE5]",
  blocked: "border-[#FEE2E2]",
  empty: "border-[#F3F4F6]",
};

export const statusTag: Record<RoomStatus, string> = {
  occupied: "bg-[#DBEAFE] text-[#1E40AF]",
  dirty: "bg-[#FEE2E2] text-[#991B1B]",
  inspection: "bg-[#FEF3C7] text-[#92400E]",
  cleaning: "bg-[#E0E7FF] text-[#3730A3]",
  review: "bg-[#EDE9FE] text-[#5B21B6]",
  ready: "bg-[#D1FAE5] text-[#065F46]",
  blocked: "bg-[#FEE2E2] text-[#7F1D1D]",
  empty: "bg-[#F3F4F6] text-[#6B7280]",
};

export const statusLabel: Record<RoomStatus, string> = {
  occupied: "Occupied",
  dirty: "Dirty",
  inspection: "Inspection",
  cleaning: "Cleaning",
  review: "Review",
  ready: "Ready",
  blocked: "Blocked",
  empty: "Empty",
};

export const statusColor = statusDot;
export const rooms: Room[] = [];
