import { Room, Housekeeper } from "@/simulation/data";
import { dbOperations } from "./db-operations";
import { apiClient } from "./api-client";

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
  }
};
