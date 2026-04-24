import { fetch } from 'wix-fetch';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';
import { mapBookingToRow } from './mapping.js';

/**
 * Sends a list of bookings to the Google Sheet.
 */
export async function syncBookingsToSheet(bookings) {
    if (!bookings || bookings.length === 0) return;

    try {
        const GOOGLE_SCRIPT_URL = await getSecret("GOOGLE_SCRIPT_URL");
        const rows = bookings.map(b => mapBookingToRow(b));

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookings: rows })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.status === "error") {
                await logToCMS("Sync Error (App Script)", result.message);
            } else {
                await logToCMS("Sync Success", `Synced ${rows.length} bookings.`);
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
