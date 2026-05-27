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
    name: "reassign_housekeeper",
    description: "Move a housekeeper from their current room to a different one. Call this when a room is blocked and the housekeeper needs a new assignment.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        housekeeper_name: { type: SchemaType.STRING },
        from_room: { type: SchemaType.STRING },
        to_room: { type: SchemaType.STRING },
        reason: { type: SchemaType.STRING }
      },
      required: ["housekeeper_name", "from_room", "to_room"]
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

    case 'reassign_housekeeper': {
      if (isRealSupabaseConfigured) {
        await supabase!
          .from('housekeepers')
          .update({ 
            current_room: args.to_room, 
            current_activity: 'INSPECTION' 
          })
          .eq('name', args.housekeeper_name);
      }
      
      await dbOperations.updateHousekeeper(args.housekeeper_name, {
        current_room: args.to_room,
        current_activity: 'INSPECTION'
      });
      
      if (args.from_room) {
        await dbOperations.updateRoomStatus(args.from_room, "dirty", { attendant: undefined });
      }
      await dbOperations.updateRoomStatus(args.to_room, "dirty", { attendant: args.housekeeper_name });
      break;
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
