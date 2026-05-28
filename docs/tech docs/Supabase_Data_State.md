# Supabase Database State & Inventory Reference

This document provides a complete technical view of the hotel inventory, housekeeper configurations, shift timelines, and active room assignments stored within the Supabase database system.

---

## 1. `rooms` Table (Master Hotel Inventory)

The hotel consists of **20 active rooms** spanning 4 floors (Floors 2 to 5).
By default:
*   **2 rooms** are clean, empty, and ready for incoming guests.
*   **18 rooms** are occupied by staying or departing guests.

### Database Records
| Room Number | Floor | Room Type | Baseline Status | Active Label |
| :--- | :--- | :--- | :--- | :--- |
| **201** | 2 | Standard (STD) | `occupied` | Occupied |
| **202** | 2 | Standard (STD) | `occupied` | Occupied |
| **203** | 2 | Deluxe (DLX) | `occupied` | Occupied |
| **204** | 2 | Deluxe (DLX) | `occupied` | Occupied |
| **205** | 2 | Suite (STE) | `occupied` | Occupied |
| **301** | 3 | Standard (STD) | `occupied` | Occupied |
| **302** | 3 | Standard (STD) | `occupied` | Occupied |
| **303** | 3 | Deluxe (DLX) | `occupied` | Occupied |
| **304** | 3 | Deluxe (DLX) | `occupied` | Occupied |
| **305** | 3 | Suite (STE) | `occupied` | Occupied |
| **401** | 4 | Standard (STD) | `occupied` | Occupied |
| **402** | 4 | Standard (STD) | `occupied` | Occupied |
| **403** | 4 | Deluxe (DLX) | `occupied` | Occupied |
| **404** | 4 | Deluxe (DLX) | `occupied` | Occupied |
| **405** | 4 | Suite (STE) | `occupied` | Occupied |
| **501** | 5 | Standard (STD) | `ready` | Empty |
| **502** | 5 | Standard (STD) | `occupied` | Occupied |
| **503** | 5 | Deluxe (DLX) | `occupied` | Occupied |
| **504** | 5 | Deluxe (DLX) | `ready` | Empty |
| **505** | 5 | Suite (STE) | `occupied` | Occupied |

---

## 2. `housekeepers` Table (Staff Directory)

Each of the **5 housekeepers** is assigned a distinct baseline queue. The arrival times are hardcoded into shift logic.

### Database Records
| Housekeeper | Language | Shift Start | Baseline Assigned Queue | Status at Arrival |
| :--- | :--- | :--- | :--- | :--- |
| **James** | English (EN) | **07:12 AM** | `302`, `303`, `304` | Present |
| **Ana** | English (EN) | **07:30 AM** | `201`, `202`, `203`, `502` | Present |
| **Priya** | Hindi (HI) | **07:45 AM** | `305`, `401`, `402`, `405` | Present |
| **Rosa** | Spanish (ES) | **07:53 AM** | `204`, `205`, `301`, `404` | Present |
| **Sofia** | English (EN) | **08:15 AM** | `403`, `503`, `505` | Present (After 08:15) |

---

## 3. `shifts` Table (Global Parameter Config)

Tracks global constraints for standard hotel operations.

| Parameter | Configuration Value | Description |
| :--- | :--- | :--- |
| **checkout_time** | `10:00 AM` | Threshold where stayed checkout rooms become `dirty` and ready for cleaning. |
| **checkin_time** | `01:00 PM` | SLA deadline for completed guest arrivals. |
| **supervisor_name** | `Marcus` | Default active supervisor identity. |

---

## 4. `room_assignments` Table (Active Shift Schedules)

### A. Initial Checkout Rushes (At 08:00 AM)
Exactly 3 rooms trigger checkout before 10:00 AM and require immediate action:
*   **Room 201** (Ana's queue) — dirty at 08:00 AM.
*   **Room 204** (Rosa's queue) — dirty at 08:00 AM.
*   **Room 302** (James' queue) — dirty at 08:00 AM.

---

### B. Generated Morning Assignment Plan (Post-Confirmation)
Upon Marcus confirming the assignment schedule via the Lancy dashboard prompt (`[Yes, assign rooms]`), all **15 checkout rooms** are cleanly assigned across the **5 housekeepers** following strict **Suites First, Deluxe Next, Standard Last** priority rules starting exactly at **10:00 AM**.

| Housekeeper | Room Number | Type | Scheduled Start | Scheduled End | Duration (Mins) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Ana** | **203** | Deluxe (DLX) | 10:00 AM | 10:35 AM | 35 |
| | **201** | Standard (STD) | 10:35 AM | 11:00 AM | 25 |
| | **202** | Standard (STD) | 11:00 AM | 11:25 AM | 25 |
| **Rosa** | **205** | Suite (STE) | 10:00 AM | 10:45 AM | 45 |
| | **204** | Deluxe (DLX) | 10:45 AM | 11:20 AM | 35 |
| | **301** | Standard (STD) | 11:20 AM | 11:45 AM | 25 |
| **James** | **303** | Deluxe (DLX) | 10:00 AM | 10:35 AM | 35 |
| | **304** | Deluxe (DLX) | 10:35 AM | 11:10 AM | 35 |
| | **302** | Standard (STD) | 11:10 AM | 11:35 AM | 25 |
| **Priya** | **305** | Suite (STE) | 10:00 AM | 10:45 AM | 45 |
| | **401** | Standard (STD) | 10:45 AM | 11:10 AM | 25 |
| | **402** | Standard (STD) | 11:10 AM | 11:35 AM | 25 |
| **Sofia** | **505** | Suite (STE) | 10:00 AM | 10:45 AM | 45 |
| | **403** | Deluxe (DLX) | 10:45 AM | 11:20 AM | 35 |
| | **503** | Deluxe (DLX) | 11:20 AM | 11:55 AM | 35 |
