import { Permissions, webMethod } from "wix-web-module";
import { bookings, extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import { submissions } from '@wix/forms';
import { mapBookingToRow } from './mapping';
const wixBookingsV1 = require('wix-bookings-backend');

/**
 * Test function to verify that bookings are being correctly mapped.
 * Queries recent bookings across V2 Extended, V2 standard, and V1 APIs.
 */
export const testV2Mapping = webMethod(Permissions.Admin, async () => {
    try {
        console.log("Fetching recent bookings across V2 and V1...");
        let items = [];
        let sourceApi = "";

        // 1. Try Extended V2 API with proper query structure
        try {
            const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);
            // Wix V2 query accepts { query: { paging: { limit: 10 } } } or { filter: {} }
            const res = await elevatedQuery({
                query: {
                    paging: { limit: 10 },
                    sort: [{ fieldName: "startDate", order: "DESC" }]
                }
            });
            if (res && res.extendedBookings && res.extendedBookings.length > 0) {
                items = res.extendedBookings;
                sourceApi = "extendedBookings.queryExtendedBookings (query format)";
            } else if (res && res.bookings && res.bookings.length > 0) {
                items = res.bookings;
                sourceApi = "extendedBookings.queryExtendedBookings (bookings array)";
            }
        } catch (e1) {
            console.log("Extended V2 query attempt 1 failed:", e1.message);
        }

        // 2. Try Extended V2 API with filter structure
        if (items.length === 0) {
            try {
                const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);
                const res = await elevatedQuery({
                    filter: {}
                });
                if (res && res.extendedBookings && res.extendedBookings.length > 0) {
                    items = res.extendedBookings.slice(0, 10);
                    sourceApi = "extendedBookings.queryExtendedBookings (filter format)";
                }
            } catch (e2) {
                console.log("Extended V2 query attempt 2 failed:", e2.message);
            }
        }

        // 3. Try standard V2 bookings query
        if (items.length === 0) {
            try {
                const elevatedQuery = auth.elevate(bookings.queryBookings);
                const res = await elevatedQuery().limit(10).find();
                if (res && res.items && res.items.length > 0) {
                    items = res.items;
                    sourceApi = "bookings.queryBookings (V2 standard)";
                }
            } catch (e3) {
                console.log("Standard V2 query failed:", e3.message);
            }
        }

        // 4. Try V1 query as fallback to test mapping on existing live bookings
        if (items.length === 0) {
            try {
                const v1Res = await wixBookingsV1.bookings.queryBookings().limit(10).find();
                if (v1Res && v1Res.items && v1Res.items.length > 0) {
                    items = v1Res.items;
                    sourceApi = "wixBookingsV1.bookings.queryBookings (V1)";
                }
            } catch (e4) {
                console.log("V1 query failed:", e4.message);
            }
        }

        if (items.length === 0) {
            return {
                message: "No bookings found in any API (V2 Extended, V2 standard, or V1).",
                count: 0
            };
        }
        
        // Fetch latest form submissions for these bookings if available
        const elevatedGetSubmission = auth.elevate(submissions.getSubmission);
        const submissionsByBookingId = {};
        
        console.log(`Found ${items.length} bookings via ${sourceApi}. Fetching form submissions...`);
        await Promise.all(items.map(async (rb) => {
            const b = rb.booking || rb;
            const subId = b.formSubmissionId || (b.formInfo ? b.formInfo.formSubmissionId || b.formInfo.submissionId : null);
            if (!subId) return;
            try {
                const sub = await elevatedGetSubmission(subId);
                if (sub) submissionsByBookingId[b._id] = sub;
            } catch (err) {
                // Silently continue if submission cannot be fetched
            }
        }));

        // Map them and return a detailed report
        const report = items.map(rb => {
            const booking = rb.booking || rb;
            const row = mapBookingToRow(booking, submissionsByBookingId);
            return {
                clientName: `${booking.contactDetails?.firstName || booking.formInfo?.contactDetails?.firstName || ""} ${booking.contactDetails?.lastName || booking.formInfo?.contactDetails?.lastName || ""}`.trim(),
                bookingId: booking._id,
                startTime: booking.startDate || booking.startTime || booking.bookedEntity?.singleSession?.start || "",
                // The mapped row that goes to Google Sheets (Column O is index 14)
                goodyBagValue_Column_O: row[14],
                mappedSpreadsheetRow: row
            };
        });

        return {
            sourceApi,
            count: report.length,
            message: `Successfully retrieved and mapped ${report.length} bookings.`,
            report: report
        };

    } catch (err) {
        console.error("V2 Mapping Test Failed:", err.message);
        return {
            error: err.message
        };
    }
});

