# Wix Bookings to Google Sheets Sync Engine

This repository contains a professional-grade integration between **Wix Bookings (V2)** and **Google Sheets**. The system automatically synchronizes upcoming bookings, manages updates, protects manual spreadsheet notes, and ensures everything stays in perfect chronological order.

## 核心 (Core) Features

- **Chronological Sorting (Time-Based)**: Data is sorted by `startDate` at both the Wix query level and the application level to ensure a perfect timeline in the sheet.
- **Smart Update/Upsert**: Uses the unique Booking ID (Column V) to detect if a booking already exists. It updates existing rows instead of creating duplicates.
- **Manual Note Protection**: Column C (Manual Notes) in the Google Sheet is preserved. If you type a note in the sheet, the sync engine will not overwrite it even if the booking is updated from Wix.
- **Date Integrity**: Automatically converts Wix date strings into real Google Sheets Date objects for reliable sorting, filtering, and formatting.
- **Custom Form Support**: Dynamically parses `additionalFields` to support unique fields for both "Group Activity" and "Default" booking forms.
- **Automation**: Designed to run automatically via Wix Scheduled Jobs and Google Apps Script triggers.

## File Overview

- **`backend/syncGoogleSheet.js`**: Fetches the next 10 days of bookings, performs a multi-page chronological sort, and maps data to the 22-column Google Sheet format.
- **`backend/jobs.config`**: Wix scheduler configuration (currently set to sync every 4 hours).
- **`Code.gs`**: Google Apps Script endpoint. Handles the logic for row updates, date object conversion, past booking cleanup, and final sheet sorting.
- **`backend/events.js`**: **[LEGACY]** Contains previous developer's code. This is **not** part of the current sync flow and is kept only for historical reference.
- **`backend/test.web.js`**: Manual test file for internal developer verification.

---

## Deployment Instructions

### 1. Google Sheets Setup
1. In your Google Sheet, go to **Extensions > Apps Script**.
2. Paste the contents of `Code.gs` into the editor and save.
3. Click **Deploy > New deployment**.
4. Select **Web app**, set **Execute as: Me**, and **Who has access: Anyone**.
5. Deploy and **Copy the Web App URL**.

### 2. Apps Script Automation (Trigger)
To ensure the sheet cleans up past bookings daily:
1. In the Apps Script editor, click the **Clock (Triggers)** icon on the left.
2. Click **+ Add Trigger**.
3. Function: `cleanupAndSortBookings` | Event source: `Time-driven` | Type: `Day timer` | Time: `1 AM to 2 AM`.
4. Click Save and Authorize.

### 3. Wix Setup
1. In Wix Dashboard, go to **Developer Tools > Secrets Manager**.
2. Store a secret named `GOOGLE_SCRIPT_URL` with your Apps Script Web App URL.
3. Copy the `/backend/` files to your Wix Velo environment.
4. Publish the site to activate the `jobs.config` schedule.

---

## Technical Maintenance
To manually trigger a sync or debug:
1. Open `syncGoogleSheet.js` in the Wix Editor.
2. Run the `export10DaysToGoogleSheets` function.
3. Check the **Wix Site Logs** or the **CMS 'logs' collection** for detailed success/error reports.

---

## Column Mapping Reference (A-V)
| Col | Field | Col | Field |
| :--- | :--- | :--- | :--- |
| **A** | Start Date (Date Obj) | **L** | Letter Colour |
| **B** | End Date (Date Obj) | **M** | Kids Count |
| **C** | **Manual Notes (STAY)** | **N** | Adults Count |
| **D** | Staff/Resource | **O** | Goody Bags (TRUE/FALSE) |
| **E** | Service Name | **P** | Sand Art (TRUE/FALSE) |
| **F** | First Name | **Q** | Character (TRUE/FALSE) |
| **G** | Last Name | **R** | Pinata (TRUE/FALSE) |
| **H** | Birthday Child | **S** | Extra/Special Field |
| **I** | Phone (+1-XXX-...) | **T** | n/a |
| **J** | Email | **U** | n/a |
| **K** | Age | **V** | **Booking ID (Unique ID)** |
