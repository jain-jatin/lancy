import { Room, Housekeeper } from "@/simulation/data";
import { dbOperations } from "./db-operations";

export const workflowEngine = {
  async assignHousekeeperRoom(hkName: string, roomNum: string) {
    const hks = await dbOperations.getHousekeepers();
    const hk = hks.find(h => h.name === hkName);
    if (!hk) return;

    // Remove from other housekeepers' queues first to prevent double assignment
    for (const h of hks) {
      if (h.rooms.includes(roomNum)) {
        const nextRooms = h.rooms.filter(num => num !== roomNum);
        await dbOperations.updateHousekeeper(h.name, { rooms: nextRooms });
      }
    }

    const updatedRooms = [...hk.rooms.filter(num => num !== roomNum), roomNum];
    await dbOperations.updateHousekeeper(hkName, { rooms: updatedRooms });
    await dbOperations.updateRoomStatus(roomNum, "dirty", { attendant: hkName });
  },

  async moveRoomToTop(hkName: string, roomNum: string) {
    const hk = (await dbOperations.getHousekeepers()).find(h => h.name === hkName);
    if (!hk) return;
    const remainingRooms = hk.rooms.filter(num => num !== roomNum);
    const updatedRooms = [roomNum, ...remainingRooms];
    await dbOperations.updateHousekeeper(hkName, { rooms: updatedRooms });
  },

  async confirmAssignments(plan: Record<string, string[]>) {
    // Overwrite the rooms assigned to each housekeeper
    const allRooms = await dbOperations.getRooms();
    for (const [hkName, roomsList] of Object.entries(plan)) {
      await dbOperations.updateHousekeeper(hkName, { rooms: roomsList });
      
      let currentMins = 600; // 10:00 AM
      for (const rNum of roomsList) {
        const roomObj = allRooms.find(r => r.number === rNum);
        const rType = roomObj ? roomObj.type : "STD";
        const duration = rType === "STE" ? 45 : rType === "DLX" ? 35 : 25;
        
        const start = currentMins;
        const end = currentMins + duration;

        const startStr = `${Math.floor(start / 60).toString().padStart(2, "0")}:${(start % 60).toString().padStart(2, "0")}`;
        const endStr = `${Math.floor(end / 60).toString().padStart(2, "0")}:${(end % 60).toString().padStart(2, "0")}`;

        await dbOperations.updateRoomStatus(rNum, "dirty", {
          attendant: hkName,
          scheduled_start_time: startStr,
          scheduled_end_time: endStr,
          actual_start_time: null,
          actual_end_time: null,
          cleaned_by_name: null,
        });

        currentMins = end;
      }
    }
  },

  async generateHousekeeperGreeting(hk: Housekeeper, rooms: Room[], simTime: string): Promise<string> {
    const assignedRoomNums = hk.rooms || [];
    const assignedRooms = rooms.filter(r => assignedRoomNums.includes(r.number));

    if (assignedRooms.length === 0) {
      return `Good morning ${hk.name}! You have no active assignments for today.`;
    }

    let roomLines = "";
    let accumulatedMins = 600; // 10:00 AM start

    assignedRooms.forEach((r) => {
      const duration = r.type === "STE" ? 45 : r.type === "DLX" ? 35 : 25;
      const start = accumulatedMins;
      const end = accumulatedMins + duration;

      const formatTime = (mins: number) => {
        const h = Math.floor(mins / 60) % 12 || 12;
        const m = String(mins % 60).padStart(2, "0");
        const ampm = Math.floor(mins / 60) >= 12 ? "PM" : "AM";
        return `${h}:${m} ${ampm}`;
      };

      roomLines += `Room ${r.number} (${r.type}) - Clean between ${formatTime(start)} and ${formatTime(end)}\n`;
      accumulatedMins = end;
    });

    return `Good morning ${hk.name}! Here is your compact cleaning schedule for today:

${roomLines}
Start with Room ${assignedRoomNums[0]}. Good luck!`;
  },

  async autoAssignAllSchedules() {
    const defaultPlan: Record<string, string[]> = {
      Ana: ["203", "201", "202"],
      Rosa: ["205", "204", "301"],
      James: ["303", "304", "302"],
      Priya: ["305", "401", "402"],
      Sofia: ["505", "403", "503"],
    };
    await this.confirmAssignments(defaultPlan);
  }
};
