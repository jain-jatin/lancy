import { Room, Housekeeper } from "@/simulation/data";
import { dbOperations } from "./db-operations";
import { apiClient } from "./api-client";
import { continuingRooms } from "@/simulation/engine";
import { supabase, isRealSupabaseConfigured, mockDb } from "../../db/supabase";

export const workflowEngine = {
  async assignHousekeeperRoom(hkName: string, roomNum: string) {
    const hk = (await dbOperations.getHousekeepers()).find(h => h.name === hkName);
    if (!hk) return;
    if (hk.current_room) {
      await dbOperations.updateHousekeeper(hkName, { next_room: roomNum });
      return;
    }
    await dbOperations.updateHousekeeper(hkName, {
      current_room: roomNum,
      current_activity: "INSPECTION"
    });
    await dbOperations.updateRoomStatus(roomNum, "dirty", { attendant: hkName });
  },

  async markInspectionDone(hkName: string) {
    const hk = (await dbOperations.getHousekeepers()).find(h => h.name === hkName);
    if (!hk || !hk.current_room) return;
    await dbOperations.updateHousekeeper(hkName, {
      current_activity: "CLEANING"
    });
    await dbOperations.updateRoomStatus(hk.current_room, "cleaning", { attendant: hkName });
  },

  async markCleaningDone(hkName: string) {
    const hk = (await dbOperations.getHousekeepers()).find(h => h.name === hkName);
    if (!hk || !hk.current_room) return;
    const completedRoom = hk.current_room;
    const completedList = [...(hk.rooms_completed || []), completedRoom];
    const updates: Partial<Housekeeper> = {
      current_room: null,
      current_activity: null,
      rooms_completed: completedList
    };
    if (hk.next_room) {
      const next = hk.next_room;
      updates.current_room = next;
      updates.current_activity = "INSPECTION";
      updates.next_room = null;
      await dbOperations.updateHousekeeper(hkName, updates);
      await dbOperations.updateRoomStatus(next, "dirty", { attendant: hkName });
    } else {
      await dbOperations.updateHousekeeper(hkName, updates);
    }
    await dbOperations.updateRoomStatus(completedRoom, "review", { attendant: hkName });
  },

  /**
   * Handle sick leaves/absences deterministically:
   * 1. Set the housekeeper status to ABSENT.
   * 2. Find all non-completed rooms assigned to them.
   * 3. Sort them by priority: earlyCheckIn > standard checkout > continuing stayover.
   * 4. Allocate round-robin to other active housekeepers based on lowest active workloads.
   * 5. Keep active housekeepers' current rooms untouched (they finish what they're doing first),
   *    but prioritize their entire remaining queues.
   * 6. Notify Marcus immediately with an URGENT feed card.
   */
  async handleHousekeeperAbsence(hkName: string) {
    const rooms = await dbOperations.getRooms();
    const housekeepers = await dbOperations.getHousekeepers();

    // Find active (present) housekeepers
    const activeHousekeepers = housekeepers.filter(h => h.name !== hkName && h.status !== "ABSENT");
    if (activeHousekeepers.length === 0) {
      console.warn("No active housekeepers available for reassignment.");
      return;
    }

    // Find all incomplete rooms assigned to the sick housekeeper
    const sickHkRooms = rooms.filter(r => r.attendant === hkName && r.status !== "ready" && r.status !== "occupied");
    if (sickHkRooms.length === 0) {
      return;
    }

    // Room priority calculation helper
    const getPriorityScore = (room: Room) => {
      const isContinuing = continuingRooms.includes(room.number);
      if (room.earlyCheckIn) return 3;
      if (!isContinuing) return 2; // standard checkout
      return 1; // continuing stayover
    };

    // Sort rooms by priority score (descending), then room number (ascending)
    const sortedRooms = [...sickHkRooms].sort((a, b) => {
      const priA = getPriorityScore(a);
      const priB = getPriorityScore(b);
      if (priA !== priB) return priB - priA;
      return a.number.localeCompare(b.number);
    });

    // Distribute rooms one by one to active housekeepers with the lowest pending loads
    for (const room of sortedRooms) {
      const currentRooms = await dbOperations.getRooms();
      const currentHks = await dbOperations.getHousekeepers();

      const hkLoads = currentHks
        .filter(h => h.name !== hkName && h.status !== "ABSENT")
        .map(h => {
          const pendingCount = currentRooms.filter(r => r.attendant === h.name && r.status !== "ready" && r.status !== "occupied").length;
          return { name: h.name, pendingCount };
        });

      if (hkLoads.length === 0) break;

      // Select housekeeper with the absolute lowest load
      hkLoads.sort((a, b) => a.pendingCount - b.pendingCount);
      const bestHkName = hkLoads[0].name;

      const targetHk = currentHks.find(h => h.name === bestHkName)!;
      const updatedRooms = [...(targetHk.rooms || [])];
      if (!updatedRooms.includes(room.number)) {
        updatedRooms.push(room.number);
      }

      // Reassign attendant on room
      await dbOperations.updateRoomStatus(room.number, room.status, { attendant: bestHkName });

      // Update housekeeper's assigned rooms
      await dbOperations.updateHousekeeper(bestHkName, { rooms: updatedRooms });
    }

    // Prioritize the queue for each active housekeeper
    const finalRooms = await dbOperations.getRooms();
    const finalHks = await dbOperations.getHousekeepers();

    for (const hk of finalHks) {
      if (hk.name === hkName || hk.status === "ABSENT") continue;

      const assignedRoomNums = hk.rooms || [];
      if (assignedRoomNums.length === 0) continue;

      const activeRoomNum = hk.current_room;

      // Collect all incomplete assigned rooms excluding the one they are actively in the middle of
      const pendingRooms = finalRooms.filter(r => 
        assignedRoomNums.includes(r.number) && 
        r.number !== activeRoomNum && 
        r.status !== "ready" && 
        r.status !== "occupied"
      );

      const sortedPending = [...pendingRooms].sort((a, b) => {
        const priA = getPriorityScore(a);
        const priB = getPriorityScore(b);
        if (priA !== priB) return priB - priA;
        return a.number.localeCompare(b.number);
      });

      // Clean, prioritized room list: completed -> current active -> sorted pending
      const sortedRoomNums = [
        ...(hk.rooms_completed || []),
        ...(activeRoomNum ? [activeRoomNum] : []),
        ...sortedPending.map(r => r.number)
      ];
      const uniqueRoomNums = Array.from(new Set(sortedRoomNums));

      const updates: Partial<Housekeeper> = {
        rooms: uniqueRoomNums
      };

      // If housekeeper is idle, start their active/next room pointers immediately
      if (!hk.current_room && sortedPending.length > 0) {
        updates.current_room = sortedPending[0].number;
        updates.current_activity = "INSPECTION";
        updates.next_room = sortedPending.length > 1 ? sortedPending[1].number : null;
        await dbOperations.updateRoomStatus(sortedPending[0].number, "dirty", { attendant: hk.name });
      } else if (hk.current_room && sortedPending.length > 0) {
        updates.next_room = sortedPending[0].number;
      } else if (sortedPending.length === 0) {
        updates.next_room = null;
      }

      await dbOperations.updateHousekeeper(hk.name, updates);
    }

    // Notify Marcus via URGENT supervisor card
    const reassignSummary = sortedRooms.map(r => `Room ${r.number}`).join(", ");
    const message = `${hkName} reported sick. All pending rooms (${reassignSummary}) have been automatically reassigned to ${activeHousekeepers.map(h => h.name).join(", ")} based on lowest workloads and prioritized by early check-ins/checkout status. Active queues have been refreshed.`;

    if (isRealSupabaseConfigured) {
      await supabase!
        .from('supervisor_cards')
        .insert({
          card_type: 'URGENT',
          room_number: sortedRooms[0]?.number || 'MULTIPLE',
          title: `SICK CALL: ${hkName} Absent`,
          message,
          option_a: 'Acknowledge',
          option_b: 'Review Schedule',
          created_at: new Date()
        });
    } else {
      mockDb.addSupervisorCard({
        card_type: 'URGENT',
        room_number: sortedRooms[0]?.number || 'MULTIPLE',
        title: `SICK CALL: ${hkName} Absent`,
        message,
        option_a: 'Acknowledge',
        option_b: 'Review Schedule',
      });
    }
  },

  async generateHousekeeperGreeting(hk: Housekeeper, rooms: Room[], simTime: string): Promise<string> {
    const assignedRoomNums = hk.rooms || [];
    const assignedRooms = rooms
      .filter(r => assignedRoomNums.includes(r.number))
      .sort((a, b) => a.number.localeCompare(b.number));

    const remainingRooms = assignedRooms.filter(r =>
      r.status === 'dirty' || r.status === 'inspection' || r.status === 'cleaning'
    );

    const isMidTask = hk.current_room && (hk.current_activity === "INSPECTION" || hk.current_activity === "CLEANING");

    let estCompletionTime = simTime;
    if (isMidTask && hk.current_room) {
      const currentRoom = rooms.find(r => r.number === hk.current_room);
      const roomType = currentRoom?.type || "STD";
      const currentMin = dbOperations.timeToMins(simTime);
      
      let duration = 15; // default for inspection
      if (hk.current_activity === "CLEANING") {
        if (roomType === "DLX") duration = 35;
        else if (roomType === "STE") duration = 45;
        else duration = 25; // STD
      }
      
      const targetMin = currentMin + duration;
      const targetHours = Math.floor(targetMin / 60) % 24;
      const targetMins = String(targetMin % 60).padStart(2, "0");
      estCompletionTime = `${String(targetHours).padStart(2, "0")}:${targetMins}`;
    }

    // Try calling Gemini first
    const client = apiClient.getGeminiClient();
    if (client) {
      try {
        const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
Greet ${hk.name} warmly by name.
Current simulation time is ${simTime}.

Tell them their task list in priority order.
For each room include:
  - Room number and type
  - What the task is (Inspection or Cleaning)
  - Target completion time (estimate based on actual database room type: Inspection is always 15 minutes, Cleaning is 25 minutes for STD, 35 minutes for DLX, 45 minutes for STE)

Format example:
"Good morning Ana! Here is your list for today:

Room 201 (Standard) - Inspection - finish by 10:30 AM
Room 202 (Standard) - Cleaning - finish by 11:30 AM
Room 203 (Deluxe) - Cleaning - finish by 12:30 PM
Room 502 (Standard) - Cleaning (continuing stay, lower priority)

Start with Room ${remainingRooms[0]?.number || 'None'}. 
Let me know when you are inside."

If they are mid-task already (based on simulation state):
"Welcome back ${hk.name}. You are currently ${hk.current_activity === 'INSPECTION' ? 'inspecting' : 'cleaning'} Room ${hk.current_room}. 
Estimated completion: ${estCompletionTime}. 
After that: Room Y."

Keep it short. One greeting line then the list. 
Never use em dashes (—) or double hyphens (--) in your replies. Use commas, colons, or parentheses instead.
No long paragraphs.
`;
        const res = await model.generateContent(prompt);
        const text = res.response.text().trim();
        if (text) return text;
      } catch (err) {
        console.error("Gemini greeting failed, using local builder:", err);
      }
    }

    // High fidelity deterministic fallback
    if (isMidTask) {
      const nextRoom = remainingRooms.find(r => r.number !== hk.current_room);
      return `Welcome back ${hk.name}. You are currently ${hk.current_activity === 'INSPECTION' ? 'inspecting' : 'cleaning'} Room ${hk.current_room}.
Estimated completion: ${estCompletionTime}.
After that: ${nextRoom ? 'Room ' + nextRoom.number : 'none'}.`;
    }

    if (remainingRooms.length === 0) {
      return `Good morning ${hk.name}! All your assigned rooms have been completed. Great job today!`;
    }

    let roomLines = "";
    let accumulatedMins = dbOperations.timeToMins(simTime);

    remainingRooms.forEach((r) => {
      let duration = 0;
      if (hk.current_room === r.number) {
        if (hk.current_activity === "INSPECTION") {
          const cleaningDuration = r.type === "STE" ? 45 : r.type === "DLX" ? 35 : 25;
          duration = 10 + cleaningDuration; // remaining inspection + full cleaning
        } else {
          duration = 20; // remaining cleaning estimate
        }
      } else {
        const cleaningDuration = r.type === "STE" ? 45 : r.type === "DLX" ? 35 : 25;
        duration = 15 + cleaningDuration; // Full inspection (15m) + Cleaning
      }

      accumulatedMins += duration;
      
      const targetHours = Math.floor(accumulatedMins / 60) % 24;
      const targetMins = String(accumulatedMins % 60).padStart(2, '0');
      const ampm = targetHours >= 12 ? 'PM' : 'AM';
      const displayHours = targetHours % 12 || 12;
      const targetTimeStr = `${displayHours}:${targetMins} ${ampm}`;

      const taskType = r.status === 'inspection' ? 'Inspection' : 'Cleaning';
      roomLines += `Room ${r.number} (${r.type}) - ${taskType} - finish by ${targetTimeStr}\n`;
    });

    return `Good morning ${hk.name}! Here is your list for today:

${roomLines}
Start with Room ${remainingRooms[0]?.number}. Let me know when you are inside.`;
  },

  async autoAssignAllSchedules() {
    const rooms = await dbOperations.getRooms();
    const housekeepers = await dbOperations.getHousekeepers();
    
    const housekeeperAssignments: Record<string, string[]> = {
      Ana: ["201", "202", "203", "502"],
      Rosa: ["204", "205", "301", "404"],
      James: ["302", "303", "304"],
      Priya: ["305", "401", "402", "405"],
      Sofia: ["403", "503", "505"],
    };

    for (const hkName of Object.keys(housekeeperAssignments)) {
      const assignedRooms = housekeeperAssignments[hkName];
      for (const roomNum of assignedRooms) {
        const room = rooms.find(r => r.number === roomNum);
        if (room && !room.attendant) {
          // Assign attendant to the room
          await dbOperations.updateRoomStatus(roomNum, room.status, { attendant: hkName });
        }
      }
    }

    // Also update current_room and next_room pointers for idle housekeepers
    const freshRooms = await dbOperations.getRooms();
    const freshHks = await dbOperations.getHousekeepers();
    for (const hk of freshHks) {
      if (hk.status === "ABSENT") continue;
      const assignedRoomNums = housekeeperAssignments[hk.name] || [];
      const pendingRooms = freshRooms.filter(r => 
        assignedRoomNums.includes(r.number) && 
        r.status !== "ready" && 
        r.status !== "occupied"
      );

      if (!hk.current_room && pendingRooms.length > 0) {
        const updates: Partial<Housekeeper> = {
          current_room: pendingRooms[0].number,
          current_activity: "INSPECTION",
          next_room: pendingRooms.length > 1 ? pendingRooms[1].number : null
        };
        await dbOperations.updateHousekeeper(hk.name, updates);
        await dbOperations.updateRoomStatus(pendingRooms[0].number, "dirty", { attendant: hk.name });
      }
    }
  }
};
