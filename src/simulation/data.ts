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
  { name: "Ana", rooms: ["203", "201", "202"], current_room: null, current_activity: null, rooms_completed: [], next_room: "203" },
  { name: "Rosa", rooms: ["205", "204", "301"], current_room: null, current_activity: null, rooms_completed: [], next_room: "205" },
  { name: "James", rooms: ["303", "304", "302"], current_room: null, current_activity: null, rooms_completed: [], next_room: "303" },
  { name: "Priya", rooms: ["305", "401", "402"], current_room: null, current_activity: null, rooms_completed: [], next_room: "305" },
  { name: "Sofia", rooms: ["505", "403", "503"], current_room: null, current_activity: null, rooms_completed: [], next_room: "505" },
];

export const statusDot: Record<RoomStatus, string> = {
  occupied: "bg-[#60A5FA]",
  dirty: "bg-[#F87171]",
  cleaning: "bg-[#D97706]",
  ready: "bg-[#2A9D8F]",
};

export const statusBorder: Record<RoomStatus, string> = {
  occupied: "border-[#DBEAFE]",
  dirty: "border-[#FEE2E2]",
  cleaning: "border-[#FEF3C7]",
  ready: "border-[#E8F5F3]",
};

export const statusTag: Record<RoomStatus, string> = {
  occupied: "bg-[#DBEAFE] text-[#1E40AF]",
  dirty: "bg-[#FEE2E2] text-[#991B1B]",
  cleaning: "bg-[#FEF3C7] text-[#92400E]",
  ready: "bg-[#E8F5F3] text-[#1A6B61]",
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

// The 15 checkout rooms for today's turnover
export const CHECKOUT_ROOMS = [
  '201','202','203','204','205',
  '301','302','303','304','305',
  '401','402','403','503','505'
];

export const rooms: Room[] = hotelRoomsBase.map((r) => {
  const isCheckout = CHECKOUT_ROOMS.includes(r.number);
  const isEmpty = r.number === "501" || r.number === "504";
  return {
    ...r,
    type: r.type as RoomType,
    status: isEmpty ? "ready" : (isCheckout ? "dirty" : "occupied"),
    label: isEmpty ? "Empty" : (isCheckout ? "Checkout" : "Occupied"),
  };
});
