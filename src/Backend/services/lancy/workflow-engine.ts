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
  - Target completion time (estimate based on current time or subsequent 45m slots)

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
Estimated completion: ${simTime}. 
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
Estimated completion: ${simTime}.
After that: ${nextRoom ? 'Room ' + nextRoom.number : 'none'}.`;
    }

    if (remainingRooms.length === 0) {
      return `Good morning ${hk.name}! All your assigned rooms have been completed. Great job today!`;
    }

    let roomLines = "";
    remainingRooms.forEach((r, idx) => {
      const taskType = r.status === 'inspection' ? 'Inspection' : 'Cleaning';
      const currentMin = dbOperations.timeToMins(simTime);
      const targetMin = currentMin + (idx + 1) * 60;
      const targetHours = Math.floor(targetMin / 60) % 24;
      const targetMins = String(targetMin % 60).padStart(2, '0');
      const ampm = targetHours >= 12 ? 'PM' : 'AM';
      const displayHours = targetHours % 12 || 12;
      const targetTimeStr = `${displayHours}:${targetMins} ${ampm}`;

      roomLines += `Room ${r.number} (${r.type}): ${taskType}, finish by ${targetTimeStr}\n`;
    });

    return `Good morning ${hk.name}! Here is your list for today:

${roomLines}
Start with Room ${remainingRooms[0]?.number}. Let me know when you are inside.`;
  }
};
