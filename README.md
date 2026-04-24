# Wix Bookings V2 Migration & Sync Engine

This repository contains a professional-grade integration and migration suite for moving from **Wix Bookings V1** to **Wix Bookings V2**. It ensures a seamless transition for live bookings and provides a robust, modular synchronization engine for Google Sheets.

## 📂 Project Structure

The project is divided into two main components:

### 1. `v2_integration/` (Current Production)

The modern, modular system built for Wix V2.

- **`migration.web.js`**: Safe migration script to re-create V1 bookings as V2 bookings. Includes date filtering and automatic cancellation of old bookings.
- **`syncGoogleSheet.js`**: The daily "Scheduled Job" that queries the next 10 days of V2 bookings.
- **`mapping.js`**: The central "brain" of the system. A universal mapper that handles both V1 and V2 data structures.
- **`syncService.js`**: Handles the actual communication with the Google Apps Script endpoint.
- **`v2_test.web.js`**: Developer tool to verify V2 data mapping in real-time.

### 2. `oldV1_integration/` (Legacy Archive)

Contains the original V1 code. These files are kept for historical reference but are **not** used by the new V2 engine.

---

## 🚀 V1 to V2 Migration Process

The migration is designed to be "Double-Safe" to prevent data loss or duplicate notifications.

### Step 1: Dry Run Verification

1. Open `v2_integration/migration.web.js`.
2. Ensure `const DRY_RUN = true;` is set.
3. Run `testDryRun()` from `migration_test.web.js`.
4. Check the **`MigrationTestResults`** CMS collection to verify that the names and fields (Kids, Pinata, etc.) are mapped correctly.

### Step 2: Live Migration

1. **Disable Wix Automations**: Temporarily turn off "New Booking" and "Booking Cancelled" emails in the Wix Dashboard.
2. In `migration.web.js`, set `const DRY_RUN = false;`.
3. Run `testLiveRun("I_AM_SURE")`.
4. The script will:

   - Create a new V2 booking for every upcoming V1 booking (post April 23, 2026).
   - Automatically cancel the old V1 booking (suppressing notifications).
   - Log any critical errors to the `logs` CMS collection.

---

## 🔄 Daily Sync Engine

Once migration is complete, the `v2_integration/syncGoogleSheet.js` handles the ongoing schedule.

- **Universal Mapping**: The sync engine is "Dual-Aware." It can read data from both old migrated bookings and brand-new V2 bookings without configuration changes.
- **Note Protection**: Column C (Manual Notes) in your Google Sheet is preserved. The sync engine will never overwrite your manual notes.
- **Auto-Sort**: Data is automatically sorted chronologically before being sent to the sheet.

---

## 📊 Column Mapping Reference (A-V)

| Col | Field | Col | Field |
| :--- | :--- | :--- | :--- |
| **A** | Start Date | **L** | Lettering Colour |
| **B** | End Date | **M** | Number of Kids |
| **C** | **Manual Notes (STAY)** | **N** | Number of Adults |
| **D** | Staff / Room | **O** | Goody Bags (TRUE) |
| **E** | Service Name | **P** | Sand Art (TRUE) |
| **F** | Client First Name | **Q** | Pinata (TRUE) |
| **G** | Client Last Name | **R** | Past Customer (TRUE) |
| **H** | Birthday Child Name | **S** | Extra Info / Notes |
| **I** | Phone (+1-XXX-...) | **T** | n/a |
| **J** | Email | **U** | n/a |
| **K** | Age of Child | **V** | **Booking ID (Unique ID)** |

---

## 🛠 Technical Notes

- **API**: This system uses the **Wix Universal API (`@wix/bookings`)** for maximum reliability.
- **Secrets**: Requires a secret named `GOOGLE_SCRIPT_URL` in the Wix Secrets Manager.
- **Logs**: All critical events and errors are recorded in the `logs` CMS collection for easy debugging.
