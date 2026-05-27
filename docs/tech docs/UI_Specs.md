# Lancy Housekeeping Simulator: Complete UI Specifications

This document outlines the complete User Interface (UI) specifications for the Lancy Housekeeping Simulator, detailing the layout, components, aesthetic design language, interactive states, and data schemas that drive the user experience.

---

## 1. Aesthetic Design System & Identity

Lancy is designed with a premium, sleek, mobile-first design language matching modern hotel management operating systems (OS). It utilizes soft organic backgrounds, glassmorphic header cards, tailored utility badges, and smooth micro-animations.

### Color Palette & Design Tokens
*   **Base Backdrop**: `#EFEDE8` (A warm sand/linen texture that makes the central device envelope pop).
*   **Device Envelope**: `bg-background` (Pure white `#FFFFFF` / Slate grey base).
*   **Primary Green (Emerald)**: `#059669` (Emerald 600) / Active `#047857` (Emerald 700) — used for primary action buttons, Lancy’s interactive options, and success badges.
*   **Warning Amber**: `#F59E0B` (Amber 500) — used for pending supervisor reviews.
*   **Urgent Red**: `#DC2626` (Red 600) — used for safety alerts and plumbing/room blockage cards.
*   **Text colors**:
    *   Dark Navy: `#1A1A2E` (For prominent titles and names).
    *   Muted Slate: `#475569` (For secondary metadata and instructions).

### Typography
*   System default sans-serif font stack (Inter/system-ui) optimized for high legibility at small viewport scales.
*   **Header scales**:
    *   Hotel context: `text-[10px] tracking-wider uppercase font-bold text-muted-foreground`
    *   Supervisor Name: `text-[20px] font-extrabold tracking-tight text-[#1A1A2E]`
    *   Tab Titles: `text-[15px] font-semibold tracking-tight`

---

## 2. Global Frame Layout

The viewport is locked to a centered layout modeling a premium smart device.

```
+------------------------------------------+
|  MAPLEWOOD SUITES              08:00 AM  | <-- Header
|  Marcus                       [Simulate] |
+------------------------------------------+
|                                          |
|                                          |
|            TAB CONTENT AREA              | <-- Dynamic Views
|         (Chat, Rooms, or Cleaner)        |
|                                          |
|                                          |
+------------------------------------------+
|   (o) Lancy     [#] Rooms     [x] Attnd  | <-- Bottom Navigation
+------------------------------------------+
```

### A. Persistent Header
Located at the top of the viewport, it remains fixed during tab transitions.
*   **Left Section**: 
    *   *Maplewood Suites* sub-label.
    *   *Marcus* (Supervisor identity) or a housekeeper selection dropdown when in the **Housekeepers** tab.
*   **Right Section**:
    *   **Time Dropdown Pill**: Allows selection of simulated shift hours ranging from `08:00 AM` to `02:00 PM` in 30-minute steps.
    *   **Simulate Button**: A solid accent button (`bg-accent`, `#059669` base) that compiles the hotel state for the selected time and restarts/warps the simulator.

### B. Persistent Bottom Navigation Bar
A floating-style tab bar locked to the bottom:
*   **Icons & Labels**:
    *   `Lancy (Chat)`: Speech bubble icon.
    *   `Rooms`: 3x3 grid icon.
    *   `Housekeepers (Cleaner)`: Multi-user group icon.
*   **Active State Indication**: The active tab uses solid emerald coloring and dynamic scaling, while inactive tabs remain muted grey.

---

## 3. Component Specs & Bubble UI

### A. Bubble Elements
*   **Lancy Bubble (Lancy AI)**:
    *   *Aesthetics*: Left-aligned, light grey backdrop, rounded border (`rounded-[18px] rounded-tl-[4px]`), dark slate text.
    *   *Micro-animation*: Fades and slides in from the left on mount.
*   **Marcus Bubble (Supervisor User)**:
    *   *Aesthetics*: Right-aligned, solid emerald backdrop (`bg-emerald-600`), pure white text, rounded border (`rounded-[18px] rounded-tr-[4px]`).
*   **Lancy Interactive Action Button**:
    *   *Aesthetics*: A clean white pill button, deep green border (`border-emerald-600`), green bold text (`text-emerald-700`).
    *   *Behavior*: Hovering applies a slight scale lift and background tint (`bg-emerald-50`). Clicking automatically inputs the text, sends it, and removes the button block from active history.

### B. Summary Block Card (Day at a Glance)
A structured grid card showing the morning inventory check:
*   **Container**: Left-aligned white panel, soft border, rounded (`rounded-[14px]`), drop shadow (`shadow-card`), width locked to `max-w-[88%]`.
*   **Left Column (Check-ins Block)**:
    *   Header: "CHECK-INS" with aggregate count (`17`).
    *   Breakdown rows: *VIP* (`1`), *Deluxe* (`7`), *Standard* (`9`).
*   **Right Column (Checkouts Block)**:
    *   Header: "CHECKOUTS" with aggregate count (`15`).
    *   Breakdown rows: *Early* (`3`), *On time* (`12`), *Late* (`0`).

### C. Urgency & Operational Cards
Embedded inside Lancy's feed dynamically:
*   **Warning Card** (TV issue, Review pending): Soft yellow background (`#FEF3C7`), brown border, dark warning icon. Contains action buttons ("Continue Cleaning" or "Pause").
*   **Urgent Card** (Major plumbing leak): Soft red/pink background (`#FEE2E2`), sharp red border (`#EF4444`). Prompts the supervisor to block the room instantly.

---

## 4. Room Grid Matrix Specs

In the **Rooms** view, rooms are represented as standard metric grid items:
*   **Grid layout**: 2-column or 3-column auto-wrapping layout.
*   **Status Badging System**:
    *   **Occupied**: Soft blue tag (`bg-[#DBEAFE] text-[#1E40AF]`) - indicates guest is currently in room.
    *   **Dirty**: Soft red tag (`bg-[#FEE2E2] text-[#991B1B]`) - indicates checkout or early checkin awaiting turn.
    *   **Cleaning**: Soft indigo tag (`bg-[#E0E7FF] text-[#3730A3]`) - housekeeper actively inside.
    *   **Inspection / Review Pending**: Soft purple tag (`bg-[#EDE9FE] text-[#5B21B6]`) - awaiting supervisor review.
    *   **Ready**: Soft green tag (`bg-[#D1FAE5] text-[#065F46]`) - clean and clear.
    *   **Blocked**: Crimson red tag (`bg-[#FEE2E2] text-[#7F1D1D]`) - locked due to plumbing or other damage.
