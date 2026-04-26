import { Permissions, webMethod } from "wix-web-module";
import { extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import { submissions } from 'wix-forms.v2';
import { mapBookingToRow } from './mapping';

/**
 * Test function to verify that V2 bookings are being correctly mapped.
 * Uses extendedBookings for maximum compatibility with your site's configuration.
 */
export const testV2Mapping = webMethod(Permissions.Admin, async () => {
    try {
        console.log("Fetching recent bookings via Extended Universal API...");
        
        // 1. Elevate permissions
        const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);
        
        // 2. Query the 5 most recent bookings
        const results = await elevatedQuery({
            pagingMetadata: { limit: 5 }
        });
        const items = results.extendedBookings || [];

        if (items.length === 0) {
            return {
                message: "No bookings found. Please create a test booking first.",
                count: 0
            };
        }
        
        // 3. Fetch latest form submissions for these bookings
        const elevatedGetSubmission = auth.elevate(submissions.getSubmission);
        const submissionsByBookingId = {};
        
        console.log("Fetching latest form submissions for test bookings...");
        await Promise.all(items.map(async (rb) => {
            const b = rb.booking || rb;
            if (!b.formSubmissionId) return;
            try {
                const sub = await elevatedGetSubmission(b.formSubmissionId);
                if (sub) submissionsByBookingId[b._id] = sub;
            } catch (err) {
                console.warn(`Could not fetch submission for booking ${b._id}:`, err.message);
            }
        }));

        // 4. Map them and return a detailed report
        const report = items.map(booking => {
            const row = mapBookingToRow(booking, submissionsByBookingId);
            return {
                clientName: `${booking.contactDetails?.firstName || ""} ${booking.contactDetails?.lastName || ""}`,
                bookingId: booking._id,
                startTime: booking.startTime,
                // The mapped row that would go to Google Sheets
                mappedSpreadsheetRow: row,
                // The original data structure for comparison
                originalV2Data: booking
            };
        });

        return {
            message: `Successfully mapped ${report.length} recent V2 bookings.`,
            report: report
        };

    } catch (err) {
        console.error("V2 Mapping Test Failed:", err.message);
        return {
            error: err.message
        };
    }
});
