import { Room, Housekeeper } from "@/simulation/data";
import { dbOperations } from "./db-operations";
import { supabase, isRealSupabaseConfigured } from "../../db/supabase";

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
    // Purge any accidental 501 / 504 assignments from database
    if (isRealSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('room_assignments')
          .delete()
          .in('room_number', ['501', '504']);
      } catch (err) {
        console.warn("Failed to purge 501/504 room_assignments:", err);
      }
    }

    // Overwrite the rooms assigned to each housekeeper
    const allRooms = await dbOperations.getRooms();
    const today = new Date().toISOString().split('T')[0];

    const hkPromises: Promise<any>[] = [];
    const roomPromises: Promise<any>[] = [];

    for (const [hkName, roomsList] of Object.entries(plan)) {
      hkPromises.push(dbOperations.updateHousekeeper(hkName, { rooms: roomsList }));

      let currentMins = 600; // 10:00 AM
      for (const rNum of roomsList) {
        const roomObj = allRooms.find(r => r.number === rNum);
        const rType = roomObj ? roomObj.type : "STD";
        const duration = rType === "STE" ? 45 : rType === "DLX" ? 35 : 25;

        const start = currentMins;
        const end = currentMins + duration;

        const toLocalISO = (hours: number, minutes: number) => {
          const d = new Date()
          d.setHours(hours, minutes, 0, 0)
          d.setSeconds(0, 0)
          d.setMilliseconds(0)
          return d.toISOString()
        };

        const format24 = (mins: number) => `${Math.floor(mins / 60).toString().padStart(2, "0")}:${(mins % 60).toString().padStart(2, "0")}`;

        const scheduled_start = toLocalISO(Math.floor(start / 60), start % 60);
        const scheduled_end = toLocalISO(Math.floor(end / 60), end % 60);

        roomPromises.push((async () => {
          await dbOperations.updateRoomStatus(rNum, "dirty", {
            attendant: hkName,
            scheduled_start_time: format24(start),
            scheduled_end_time: format24(end),
            actual_start_time: null,
            actual_end_time: null,
            cleaned_by_name: null,
          });

          // Write to Supabase room_assignments table directly if real Supabase is configured
          if (isRealSupabaseConfigured && supabase) {
            const rTypeLabel = rType === "STE" ? "Suite" : rType === "DLX" ? "Deluxe" : "Standard";
            const rFloor = roomObj ? roomObj.floor : parseInt(rNum.charAt(0), 10);
            const queuePos = roomsList.indexOf(rNum) + 1;

            try {
              const { data: existing } = await supabase
                .from('room_assignments')
                .select('id')
                .eq('room_number', rNum)
                .eq('shift_date', today)
                .limit(1);

              if (existing && existing.length > 0) {
                await supabase
                  .from('room_assignments')
                  .update({
                    housekeeper_name: hkName,
                    room_type: rTypeLabel,
                    floor: rFloor,
                    queue_position: queuePos,
                    scheduled_start,
                    scheduled_end,
                    status: 'DIRTY'
                  })
                  .eq('id', existing[0].id);
              } else {
                await supabase
                  .from('room_assignments')
                  .insert({
                    room_number: rNum,
                    housekeeper_name: hkName,
                    room_type: rTypeLabel,
                    floor: rFloor,
                    queue_position: queuePos,
                    shift_date: today,
                    scheduled_start,
                    scheduled_end,
                    status: 'DIRTY'
                  });
              }
            } catch (err) {
              console.warn("Writing to room_assignments failed:", err);
            }
          }
        })());

        currentMins = end;
      }
    }

    await Promise.all(hkPromises);
    await Promise.all(roomPromises);
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
  },

  async handleHousekeeperAbsence(hkName: string) {
    const freshRooms = await dbOperations.getRooms();
    const hkRooms = freshRooms.filter(r => r.attendant === hkName);
    for (const r of hkRooms) {
      await dbOperations.updateRoomStatus(r.number, "dirty", { attendant: undefined });
    }
  },

  async markCleaningDone(hkName: string) {
    const hks = await dbOperations.getHousekeepers();
    const hk = hks.find(h => h.name === hkName);
    if (hk && hk.current_room) {
      await dbOperations.updateRoomStatus(hk.current_room, "ready");
      await dbOperations.updateHousekeeper(hkName, { current_room: null, current_activity: null });
    }
  }
};
