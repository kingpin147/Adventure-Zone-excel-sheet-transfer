import { Permissions, webMethod } from "wix-web-module";
import { extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
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

        // 2. Map them and return a detailed report
        const report = items.map(booking => {
            const row = mapBookingToRow(booking);
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
