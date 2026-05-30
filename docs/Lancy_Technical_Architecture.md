# Technical Architecture Specification
## Lancy: AI Housekeeping Operations Platform

### 1. Core Technology Stack
* **Frontend**: Next.js 14, TypeScript, Tailwind CSS, TanStack Start, Lucide Icons.
* **Backend Database**: Supabase (PostgreSQL, Realtime Engine, Row Level Security).
* **AI Engine**: Google Gemini 2.5 Flash (via `@google/generative-ai` SDK).
* **Local Fallback**: LocalStorage database simulation layer for client-only offline operations.

---

### 2. Database Schema Design (Supabase PostgreSQL)

```sql
-- 1. Hotels Table
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT DEFAULT 'America/Chicago',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Rooms Table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  floor INTEGER NOT NULL,
  type TEXT CHECK (type IN ('Suite','Deluxe','Standard')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Housekeepers Table
CREATE TABLE housekeepers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  language_code TEXT DEFAULT 'en-US',
  language_label TEXT DEFAULT 'EN',
  pin_hash TEXT,
  avatar_color TEXT DEFAULT '#2A9D8F',
  initials TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Shifts Table
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id),
  shift_date DATE NOT NULL,
  simulation_time TIMESTAMPTZ DEFAULT NOW(),
  simulation_speed INTEGER DEFAULT 1,
  checkout_time TIME DEFAULT '10:00',
  checkin_time TIME DEFAULT '13:00',
  supervisor_name TEXT DEFAULT 'Marcus',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Room Assignments Table (Operational CDC Core)
CREATE TABLE room_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id),
  housekeeper_id UUID REFERENCES housekeepers(id) NULL,
  status TEXT DEFAULT 'CHECKOUT_PENDING'
    CHECK (status IN ('OCCUPIED','CHECKOUT_PENDING','CLEANING','INSPECTION','READY')),
  priority INTEGER DEFAULT 99,
  early_checkin BOOLEAN DEFAULT FALSE,
  guest_checkin_time TIME DEFAULT '13:00',
  guest_name TEXT,
  items_confirmed_at TIMESTAMPTZ,
  cleaning_started_at TIMESTAMPTZ,
  cleaning_completed_at TIMESTAMPTZ,
  inspection_approved_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_room_assignments_shift ON room_assignments(shift_id);
CREATE INDEX idx_room_assignments_status ON room_assignments(status);
```

#### Real-time CDC Synchronization
Real-time PostgreSQL CDC updates are published using Supabase replication channels:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE room_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE housekeeper_messages;
```

---

### 3. Chronological Simulation Snapshot Engine
The simulation runs state machines sequentially using timeline parameters from **8:00 AM to 2:00 PM** (measured as minutes from midnight):

* **8:00 AM (480 minutes)**: Ana arrives. Most rooms are still occupied.
* **10:00 AM (600 minutes)**: Standard Checkout Time. 15 checkout rooms switch to "Dirty" status. Housekeepers start cleaning.
* **10:10 AM (610 minutes)**: Rosa reports property damage in Room 204.
* **11:00 AM (660 minutes)**: Standard priority checkouts completed.
* **11:15 AM (675 minutes)**: James reports a broken television in Room 303.
* **12:17 PM (737 minutes)**: Priya reports a major plumbing leak in Room 402. Room status updates to "Blocked". Priya gets reassigned to Room 405.
* **1:00 PM (780 minutes)**: Late checkout shifts completed. Newly clean empty rooms (501, 504) get occupied by arriving check-ins.

---

### 4. Multilingual Translation Gateway
Attendants receive guidance on their mobile screens in their native languages while Marcus receives communications in English. The translation layer routes inputs dynamically:

```
[Attendant Input (Spanish/Hindi)]
       │
       ▼
[Gemini AI Multilingual translation model]
       │
       ▼
[Marcus Dashboard Alert (English)]
```

---

### 5. Gemini 1.5 Flash AI Engine Setup
The application interfaces with Gemini using the `@google/generative-ai` package. It passes the active supervisor's current database state directly in the prompt context to keep answers accurate and prevent hallucinations:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

export async function askLancy(message: string, roomsState: any) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: "You are Lancy, the housekeeping AI coordinator for Maplewood Suites. Guide supervisor Marcus based on the provided hotel state."
  });

  const prompt = `
    Active Hotel State: ${JSON.stringify(roomsState)}
    Supervisor Query: ${message}
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
```
