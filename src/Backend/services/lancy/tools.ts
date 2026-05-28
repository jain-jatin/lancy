import { SchemaType } from "@google/generative-ai";
import { supabase, isRealSupabaseConfigured, mockDb } from "../../db/supabase";
import { Housekeeper } from "@/simulation/data";
import { dbOperations } from "./db-operations";

export const LANCY_TOOLS: any[] = [
  {
    name: "update_room_status",
    description: "Update a room's operational status in the database. Call this when a housekeeper reports a transition (inspection done, cleaning done) or when a room needs to be blocked.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        room_number: { type: SchemaType.STRING, description: "Room number e.g. 303" },
        new_status: { 
          type: SchemaType.STRING, 
          enum: ["INSPECTION","CLEANING","REVIEW","BLOCKED","READY"],
          description: "The new status to set"
        },
        reason: { type: SchemaType.STRING, description: "Brief reason for the change" }
      },
      required: ["room_number", "new_status"]
    }
  },
  {
    name: "notify_supervisor",
    description: "Send an action card to Marcus's feed. Call this whenever something needs his attention or decision.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        card_type: { 
          type: SchemaType.STRING, 
          enum: ["INFO","WARNING","URGENT","DECISION","REVIEW_REQUEST"],
          description: "INFO for updates, WARNING for minor issues, URGENT for major issues, DECISION for choices, REVIEW_REQUEST when a room needs sign-off"
        },
        room_number: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING, description: "Card headline" },
        message: { type: SchemaType.STRING, description: "Card body text" },
        option_a: { type: SchemaType.STRING, description: "First button label if DECISION card" },
        option_b: { type: SchemaType.STRING, description: "Second button label if DECISION card" }
      },
      required: ["card_type", "room_number", "title", "message"]
    }
  },
  {
    name: "create_maintenance_ticket",
    description: "Log a maintenance issue in the database. Call this when a housekeeper reports any physical room issue: broken fixtures, leaks, electrical, AC, TV etc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        room_number: { type: SchemaType.STRING },
        issue_description: { type: SchemaType.STRING },
        severity: { 
          type: SchemaType.STRING, 
          enum: ["MINOR","MAJOR"],
          description: "MINOR for cosmetic or non-urgent. MAJOR for active leaks, flooding, electrical, anything that makes the room unsafe or unusable."
        },
        reported_by: { type: SchemaType.STRING, description: "Housekeeper name" }
      },
      required: ["room_number", "issue_description", "severity", "reported_by"]
    }
  },
  {
    name: "log_lost_and_found",
    description: "Log a found item or guest damage report. Call this when a housekeeper finds something left by a guest or reports guest-caused damage.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        room_number: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING, description: "What was found or damaged" },
        type: { 
          type: SchemaType.STRING, 
          enum: ["LOST_ITEM","GUEST_DAMAGE"],
        },
        reported_by: { type: SchemaType.STRING }
      },
      required: ["room_number", "description", "type", "reported_by"]
    }
  },
  {
    name: "reassign_room_to_housekeeper",
    description: "Move a cleaning task (room) from one housekeeper's queue to another. Use whenever Marcus says 'assign room X to Y', 'move room X to Y', 'give room X to Y', 'reassign room X to Y', or any equivalent. Extract room_number from the 3-digit number in the message and dest_housekeeper_name from the target housekeeper's name.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        room_number: { type: SchemaType.STRING, description: "3-digit room number to move, e.g. '201'" },
        dest_housekeeper_name: { type: SchemaType.STRING, description: "Name of the housekeeper who should receive the room, e.g. 'Sofia'" }
      },
      required: ["room_number", "dest_housekeeper_name"]
    }
  },
  {
    name: "get_hotel_snapshot",
    description: "Retrieve full current state of all rooms and housekeepers. Call this when Marcus asks about the team, room status, or overall shift progress.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  }
];

export const executeTool = async (toolName: string, args: any): Promise<any> => {
  console.log(`[executeTool] Executing tool: ${toolName}`, args);
  switch (toolName) {
    case 'update_room_status': {
      const dbStatus = args.new_status === 'INSPECTION' ? 'dirty' : args.new_status === 'REVIEW' ? 'inspection' : args.new_status.toLowerCase();
      
      // Update room in DB
      await dbOperations.updateRoomStatus(args.room_number, dbStatus, { note: args.reason });
      
      // Also update the housekeeper's activity if appropriate
      const hks = await dbOperations.getHousekeepers();
      const attendant = hks.find(h => h.current_room === args.room_number || h.rooms.includes(args.room_number));
      if (attendant) {
        let act: Housekeeper["current_activity"] = null;
        if (args.new_status === 'INSPECTION') act = 'INSPECTION';
        if (args.new_status === 'CLEANING') act = 'CLEANING';
        
        let roomsCompleted = attendant.rooms_completed || [];
        let nextRoom: string | null = attendant.next_room ?? null;
        let currentRoom: string | null = attendant.current_room ?? null;
        
        if (args.new_status === 'READY') {
          currentRoom = null;
          act = null;
          if (!roomsCompleted.includes(args.room_number)) {
            roomsCompleted.push(args.room_number);
          }
          if (attendant.next_room) {
            currentRoom = attendant.next_room;
            act = 'INSPECTION';
            nextRoom = null;
            await dbOperations.updateRoomStatus(currentRoom, "dirty", { attendant: attendant.name });
          }
        }
        
        await dbOperations.updateHousekeeper(attendant.name, {
          current_activity: act,
          current_room: currentRoom,
          next_room: nextRoom,
          rooms_completed: roomsCompleted
        });
      }
      break;
    }

    case 'notify_supervisor': {
      if (isRealSupabaseConfigured) {
        await supabase!
          .from('supervisor_cards')
          .insert({
            card_type: args.card_type,
            room_number: args.room_number,
            title: args.title,
            message: args.message,
            option_a: args.option_a || null,
            option_b: args.option_b || null,
            created_at: new Date()
          });
      } else {
        mockDb.addSupervisorCard({
          card_type: args.card_type,
          room_number: args.room_number,
          title: args.title,
          message: args.message,
          option_a: args.option_a || null,
          option_b: args.option_b || null,
        });
      }
      break;
    }

    case 'create_maintenance_ticket': {
      if (isRealSupabaseConfigured) {
        await supabase!.from('maintenance_tickets').insert({
          room_number: args.room_number,
          description: args.issue_description,
          severity: args.severity,
          reported_by: args.reported_by,
          status: 'OPEN'
        });
      } else {
        mockDb.addMaintenanceTicket({
          room_number: args.room_number,
          description: args.issue_description,
          severity: args.severity,
          reported_by: args.reported_by,
          status: 'OPEN'
        });
      }
      
      // If MAJOR, also call notify_supervisor with URGENT card
      if (args.severity === 'MAJOR') {
        await executeTool('notify_supervisor', {
          card_type: 'URGENT',
          room_number: args.room_number,
          title: `Major Issue: Room ${args.room_number}`,
          message: `${args.reported_by} reports: ${args.issue_description}`,
          option_a: 'Stop + Block Room',
          option_b: 'Continue with Caution'
        });
      } else {
        // For MINOR issues, notify supervisor with DECISION card as described in prompt
        await executeTool('notify_supervisor', {
          card_type: 'DECISION',
          room_number: args.room_number,
          title: `Minor Issue: Room ${args.room_number}`,
          message: `${args.reported_by} reports the TV is not functioning in Room ${args.room_number}. Do you want to continue cleaning or pause for maintenance?`,
          option_a: 'Continue Cleaning',
          option_b: 'Pause'
        });
      }
      break;
    }

    case 'log_lost_and_found': {
      if (isRealSupabaseConfigured) {
        await supabase!.from('incidents').insert({
          room_number: args.room_number,
          description: args.description,
          type: args.type,
          reported_by: args.reported_by
        });
      } else {
        mockDb.addIncident({
          room_number: args.room_number,
          description: args.description,
          type: args.type,
          reported_by: args.reported_by
        });
      }
      break;
    }

    case 'reassign_room_to_housekeeper': {
      const roomNum: string = String(args.room_number);
      const destName: string = args.dest_housekeeper_name;

      const allHks = await dbOperations.getHousekeepers();
      const allRooms = await dbOperations.getRooms();

      // Find source housekeeper (current owner of this room)
      const srcHk = allHks.find(h => (h.rooms || []).includes(roomNum));
      if (!srcHk) {
        return `I could not find Room ${roomNum} in any housekeeper's queue. Please check the room number.`;
      }
      if (srcHk.name === destName) {
        return `Room ${roomNum} is already assigned to ${destName}.`;
      }

      const destHk = allHks.find(h => h.name === destName);
      if (!destHk) {
        return `I could not find a housekeeper named ${destName}. Please check the name.`;
      }

      const getDur = (type: string) => type === 'STE' || type === 'Suite' ? 45 : type === 'DLX' || type === 'Deluxe' ? 35 : 25;
      const toTime = (mins: number) => `${Math.floor(mins/60).toString().padStart(2,'0')}:${(mins%60).toString().padStart(2,'0')}`;
      const typeOrder: Record<string,number> = { STE: 0, Suite: 0, DLX: 1, Deluxe: 1, STD: 2, Standard: 2 };

      // 1. Remove from source queue and recalculate
      const srcRooms = (srcHk.rooms || []).filter((n: string) => n !== roomNum);
      await dbOperations.updateHousekeeper(srcHk.name, { rooms: srcRooms });
      let srcMins = 600;
      for (const num of srcRooms) {
        const r = allRooms.find(rm => rm.number === num);
        if (!r) continue;
        const dur = getDur(r.type);
        await dbOperations.updateRoomStatus(num, r.status, {
          attendant: srcHk.name,
          scheduled_start_time: toTime(srcMins),
          scheduled_end_time: toTime(srcMins + dur),
        });
        srcMins += dur;
      }

      // 2. Insert into destination queue in priority order
      const movedRoom = allRooms.find(r => r.number === roomNum);
      const movingPriority = typeOrder[movedRoom?.type ?? 'Standard'] ?? 2;
      const destRooms = [...(destHk.rooms || [])];
      let insertAt = destRooms.length;
      for (let i = 0; i < destRooms.length; i++) {
        const r = allRooms.find(rm => rm.number === destRooms[i]);
        if (!r) continue;
        if ((typeOrder[r.type] ?? 2) > movingPriority) { insertAt = i; break; }
      }
      const newDestRooms = [...destRooms.slice(0, insertAt), roomNum, ...destRooms.slice(insertAt)];
      await dbOperations.updateHousekeeper(destName, { rooms: newDestRooms });

      // 3. Recalculate full dest queue timings from 10AM
      let destMins = 600;
      for (const num of newDestRooms) {
        const r = allRooms.find(rm => rm.number === num);
        if (!r) continue;
        const dur = getDur(r.type);
        await dbOperations.updateRoomStatus(num, r.status, {
          attendant: destName,
          scheduled_start_time: toTime(destMins),
          scheduled_end_time: toTime(destMins + dur),
        });
        destMins += dur;
      }

      // 4. Build a readable updated queue string
      const freshRooms = await dbOperations.getRooms();
      const queueLines = newDestRooms.map((num, idx) => {
        const r = freshRooms.find(rm => rm.number === num);
        return `${idx + 1}. Room ${num} — ${r?.scheduled_start_time || ''} to ${r?.scheduled_end_time || ''}${num === roomNum ? '  ← moved here' : ''}`;
      }).join('\n');

      return `Done. Room ${roomNum} moved from ${srcHk.name} to ${destName}.\n\n${destName}'s updated queue:\n${queueLines}`;
    }

    case 'get_hotel_snapshot': {
      const snapshot = await buildHotelSnapshot();
      return snapshot;
    }
  }
};

async function buildHotelSnapshot(): Promise<string> {
  const rooms = await dbOperations.getRooms();
  const housekeepers = await dbOperations.getHousekeepers();
  
  const roomsStr = rooms.map(r => {
    const hk = r.attendant || 'Unassigned';
    return `Room ${r.number} (${r.type}): ${r.status}, Attendant: ${hk}`;
  }).join('\n');

  const hksStr = housekeepers.map(hk => {
    const status = hk.current_room ? `${hk.current_activity} in Room ${hk.current_room}` : 'IDLE';
    return `${hk.name}: ${status}`;
  }).join('\n');

  return `Current state:\n\nROOMS:\n${roomsStr}\n\nHOUSEKEEPERS:\n${hksStr}`;
}
