# Wix Bookings to Google Sheets Sync

This repository contains the backend code for integrating Wix Bookings (V2) with Google Sheets. The system automatically fetches any bookings happening within the next 10 days and syncs them to a Google Sheet. It handles two different Custom Forms ("Group Activity" and "Default"), updates existing rows to prevent duplicate data, and preserves any manual notes typed directly into the Google Sheet.

## File Overview

- **`backend/syncGoogleSheet.js`**: The core synchronization script. It queries the `@wix/bookings` API for the next 10 days of bookings, meticulously parses the custom fields natively from `additionalFields`, formats phone numbers, and sends a bulk `POST` to the Google Apps Script endpoint.
- **`backend/jobs.config`**: Defines the cron job schedule within Wix to run the `export10DaysToGoogleSheets` function every 4 hours automatically.
- **`backend/test.web.js`**: Provides isolated test functions intended for manual execution in the Wix Editor to verify the V2 Bookings API payload and Google Sheets mapping logic without firing external requests.
- **`Code.gs`**: A standalone Google Apps Script file. This acts as a Webhook endpoint that receives incoming data from Wix, locates the row via Booking ID, and updates or appends the data while protecting column C (Manual Notes) from being overwritten.
- **`backend/events.js`**: (Legacy) Contains the previous developer's code built on outdated Wix API architectures (`onBookingUpdated` & V1 payload variables). Left for reference only; is unused in this deployment.

## Deployment Instructions

### 1. Google Sheets Setup
1. Open the target Google Sheet and navigate to **Extensions > Apps Script**.
2. Replace any dummy code with the contents of `Code.gs`.
3. Click **Deploy > New deployment**.
4. Choose **Web app** as the deployment type.
5. Set **Execute as: Me** and **Who has access: Anyone**.
6. Deploy and **Copy the resulting Web App URL**.

### 2. Wix Setup
1. In your Wix Dashboard, go to **Developer Tools > Secrets Manager**.
2. Click **Store Secret**.
3. Name the secret exactly: `GOOGLE_SCRIPT_URL`
4. Paste the Web App URL retrieved in step 1 as the secret value and click save.
5. Copy all files inside the local `/backend/` directory to the `backend/` folder of your Velo IDE workspace in the Wix Editor.
6. Publish the Wix website to initialize the `jobs.config` scheduler. 

## Testing the Infrastructure
To debug or manually trigger a sync without waiting for the 4-hour cycle:
1. Open `syncGoogleSheet.js` in the Wix Editor.
2. Click the Play/Run button next to `export10DaysToGoogleSheets` in the editor.
3. Validate that rows appear seamlessly in Google Sheets, mapping successfully from Columns A through V.
