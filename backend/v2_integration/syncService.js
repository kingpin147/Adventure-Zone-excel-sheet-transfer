import { fetch } from 'wix-fetch';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';
import { mapBookingToRow } from './mapping';

/**
 * Sends a list of bookings to the Google Sheet.
 */
export async function syncBookingsToSheet(bookings, submissionsByBookingId = {}) {
    if (!bookings || bookings.length === 0) return;

    try {
        const GOOGLE_SCRIPT_URL = await getSecret("GOOGLE_SCRIPT_URL");
        const rows = bookings.map(b => mapBookingToRow(b, submissionsByBookingId));

        const payload = JSON.stringify({ bookings: rows });
        // Log a preview of the data being sent (limited to 3000 chars to avoid CMS limits)
        await logToCMS("Sync Payload Preview", `Sending ${rows.length} bookings: ${payload.substring(0, 3000)}`);

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: payload
        });

        if (response.ok) {
            const resultText = await response.text();
            // Log the raw response from Google Sheets to confirm what was received
            await logToCMS("Sync Response Success", `Google Sheets Response: ${resultText}`);
            
            try {
                const result = JSON.parse(resultText);
                if (result.status === "error") {
                    await logToCMS("Sync Error (App Script)", result.message);
                } else {
                    await logToCMS("Sync Success", `Synced ${rows.length} bookings.`);
                }
            } catch (e) {
                await logToCMS("Sync Warning", `Response was successful but not JSON: ${resultText.substring(0, 500)}`);
            }
        } else {
            const errText = await response.text();
            await logToCMS("Sync Error (HTTP)", `Status ${response.status}: ${errText}`);
        }
    } catch (err) {
        await logToCMS("Sync Exception", err.message || err);
    }
}

/**
 * Log to the CMS 'logs' collection for visibility in the Wix Dashboard.
 */
async function logToCMS(title, message) {
    try {
        await wixData.insert("logs", {
            title,
            message,
            timestamp: new Date()
        }, { suppressAuth: true });
    } catch (e) {
        console.error("CMS Logging failed", e);
    }
}
