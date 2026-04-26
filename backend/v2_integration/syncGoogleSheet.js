import { extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
import { submissions } from 'wix-forms.v2';
import { syncBookingsToSheet } from './syncService';

/**
 * Scheduled Job function to sync the next 10 days of bookings to Google Sheets.
 * This is designed to be called from jobs.config.
 */
export async function export10DaysToGoogleSheets(triggerMetadata) {
    const triggerSource = triggerMetadata ? "Scheduled Job" : "Manual/Direct Call";
    await logToCMS("Sync Triggered", `Execution started via ${triggerSource}`);

    try {
        // 1. Calculate the 10-day window
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endWindow = new Date(startOfToday.getTime());
        endWindow.setDate(endWindow.getDate() + 10);
        endWindow.setHours(23, 59, 59, 999);

        console.log(`Syncing bookings from ${startOfToday.toISOString()} to ${endWindow.toISOString()}`);

        // 2. Fetch all bookings in the window using Extended Universal API
        const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);
        const results = await elevatedQuery({
            filter: {
                "$and": [
                    { "startDate": { "$gte": startOfToday.toISOString() } },
                    { "startDate": { "$lte": endWindow.toISOString() } },
                    { "status": { "$in": ["CONFIRMED", "PENDING"] } }
                ]
            }
        });

        let allResults = results.extendedBookings || [];

        if (allResults.length === 0) {
            await logToCMS("Sync Warning", "No bookings found in the next 10 days.");
            return;
        }

        // 3. Sort chronologically by startTime
        allResults.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        
        // 4. Fetch up-to-date form submissions via Wix Forms v2
        const elevatedGetSubmission = auth.elevate(submissions.getSubmission);
        const submissionsByBookingId = {};
        
        console.log("Fetching latest form submissions for edited responses...");
        await Promise.all(allResults.map(async (rb) => {
            const b = rb.booking || rb;
            if (!b.formSubmissionId) return;
            try {
                const sub = await elevatedGetSubmission(b.formSubmissionId);
                if (sub) submissionsByBookingId[b._id] = sub;
            } catch (err) {
                console.warn(`Could not fetch submission for booking ${b._id}:`, err.message);
            }
        }));

        // 5. Send to Google Sheets via syncService
        console.log(`Processing ${allResults.length} bookings for Google Sheets...`);
        await syncBookingsToSheet(allResults, submissionsByBookingId);

    } catch (err) {
        console.error("Sync Job Failed:", err.message);
        await logToCMS("Sync Job Error", err.message);
    }
}

/**
 * Utility to log events to the CMS 'logs' collection.
 */
async function logToCMS(title, message) {
    try {
        await wixData.insert("logs", {
            title: `Sync Job: ${title}`,
            message: message,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("CMS Logging failed in Sync Job:", e.message);
    }
}
