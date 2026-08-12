import { Permissions, webMethod } from "wix-web-module";
import { bookings, extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import { submissions } from 'wix-forms.v2';
const wixBookingsV1 = require('wix-bookings-backend');

const START_DATE = new Date("2026-04-23T00:00:00Z");

/**
 * Retrieves a summary of bookings in the system, counting by status and booking version.
 */
export const getBookingsSummary = webMethod(Permissions.Admin, async () => {
    try {
        console.log("Analyzing V1 and V2 bookings...");
        
        // 1. Query V1 Future bookings
        const v1Query = await wixBookingsV1.bookings.queryBookings()
            .gt("startTime", new Date().toISOString())
            .ge("_createdDate", START_DATE)
            .limit(1000)
            .find();
        const v1Items = v1Query.items || [];

        // 2. Query V2 bookings
        const elevatedQueryV2 = auth.elevate(extendedBookings.queryExtendedBookings);
        const v2Result = await elevatedQueryV2({
            filter: {
                "startDate": { "$gte": START_DATE.toISOString() }
            },
            pagingMetadata: { limit: 1000 }
        });
        const v2Items = v2Result.extendedBookings || [];

        // 3. Aggregate V1 status
        const v1StatusCounts = {};
        v1Items.forEach(b => {
            v1StatusCounts[b.status] = (v1StatusCounts[b.status] || 0) + 1;
        });

        // 4. Aggregate V2 status
        const v2StatusCounts = {};
        v2Items.forEach(rb => {
            const b = rb.booking || rb;
            v2StatusCounts[b.status] = (v2StatusCounts[b.status] || 0) + 1;
        });

        return {
            status: "Success",
            timestamp: new Date().toISOString(),
            v1Summary: {
                totalFutureBookings: v1Items.length,
                statusBreakdown: v1StatusCounts
            },
            v2Summary: {
                totalBookingsSinceStartDate: v2Items.length,
                statusBreakdown: v2StatusCounts
            }
        };

    } catch (err) {
        console.error("Failed to compile bookings summary:", err.message);
        return {
            status: "Failed",
            error: err.message
        };
    }
});

/**
 * Returns a detailed list of future V1 bookings that are eligible for migration.
 */
export const getV1BookingsForMigration = webMethod(Permissions.Admin, async () => {
    try {
        const v1Query = await wixBookingsV1.bookings.queryBookings()
            .gt("startTime", new Date().toISOString())
            .ge("_createdDate", START_DATE)
            .limit(100)
            .find();
        const items = v1Query.items || [];

        return {
            status: "Success",
            count: items.length,
            bookings: items.map(b => ({
                id: b._id,
                clientName: `${b.formInfo?.contactDetails?.firstName || ''} ${b.formInfo?.contactDetails?.lastName || ''}`.trim(),
                email: b.formInfo?.contactDetails?.email || "",
                phone: b.formInfo?.contactDetails?.phone || "",
                serviceId: b.bookedEntity?.serviceId,
                serviceName: b.bookedEntity?.title || "",
                startTime: b.bookedEntity?.singleSession?.start,
                endTime: b.bookedEntity?.singleSession?.end,
                status: b.status,
                createdDate: b._createdDate
            }))
        };
    } catch (err) {
        return { status: "Failed", error: err.message };
    }
});

/**
 * Returns a list of V2 bookings (both CREATED and CONFIRMED) that currently exist.
 */
export const getV2BookingsStatus = webMethod(Permissions.Admin, async () => {
    try {
        const elevatedQueryV2 = auth.elevate(extendedBookings.queryExtendedBookings);
        const result = await elevatedQueryV2({
            filter: {
                "startDate": { "$gte": new Date().toISOString() }
            },
            pagingMetadata: { limit: 100 }
        });
        const items = result.extendedBookings || [];

        return {
            status: "Success",
            count: items.length,
            bookings: items.map(rb => {
                const b = rb.booking || rb;
                return {
                    id: b._id,
                    clientName: `${b.contactDetails?.firstName || ''} ${b.contactDetails?.lastName || ''}`.trim(),
                    email: b.contactDetails?.email || "",
                    serviceId: b.bookedService?.id || b.bookedEntity?.serviceId,
                    serviceName: b.bookedService?.name || b.bookedEntity?.title || "",
                    startDate: b.startDate,
                    status: b.status,
                    formSubmissionId: b.formSubmissionId,
                    formId: b.formId
                };
            })
        };
    } catch (err) {
        return { status: "Failed", error: err.message };
    }
});

/**
 * Finds and analyzes potential duplicates in V1 bookings.
 * Grouped by startTime, email, and service.
 */
export const getDuplicateV1Bookings = webMethod(Permissions.Admin, async () => {
    try {
        const v1Query = await wixBookingsV1.bookings.queryBookings()
            .gt("startTime", new Date().toISOString())
            .ge("_createdDate", START_DATE)
            .limit(1000)
            .find();
        const items = v1Query.items || [];

        const groups = {};
        items.forEach(b => {
            const key = `${b.bookedEntity?.singleSession?.start}_${b.formInfo?.contactDetails?.email}_${b.bookedEntity?.serviceId}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(b);
        });

        const duplicates = [];
        Object.entries(groups).forEach(([key, groupItems]) => {
            if (groupItems.length > 1) {
                duplicates.push({
                    key,
                    count: groupItems.length,
                    details: groupItems.map(b => ({
                        id: b._id,
                        clientName: `${b.formInfo?.contactDetails?.firstName || ''} ${b.formInfo?.contactDetails?.lastName || ''}`.trim(),
                        status: b.status,
                        createdDate: b._createdDate
                    }))
                });
            }
        });

        return {
            status: "Success",
            totalDuplicatesFound: duplicates.length,
            duplicates
        };
    } catch (err) {
        return { status: "Failed", error: err.message };
    }
});

/**
 * Diagnostic tool to fetch specific form submission fields for a given submission ID or Booking ID.
 */
export const getFormSubmissionDetails = webMethod(Permissions.Admin, async (idOrBookingId) => {
    try {
        let submissionId = idOrBookingId;
        let bookingDetails = null;

        // 1. Try resolving booking ID to submission ID using extendedBookings.getExtendedBooking
        try {
            const elevatedGet = auth.elevate(extendedBookings.getExtendedBooking);
            const res = await elevatedGet(idOrBookingId);
            const b = res?.booking || res;
            if (b && (b._id || b.id)) {
                bookingDetails = b;
                submissionId = b.formSubmissionId || (b.formInfo ? b.formInfo.formSubmissionId || b.formInfo.submissionId : null) || submissionId;
            }
        } catch (e1) {
            // 2. Try V1 getBooking as fallback
            try {
                const v1Booking = await wixBookingsV1.bookings.getBooking(idOrBookingId);
                if (v1Booking) {
                    bookingDetails = v1Booking;
                    submissionId = v1Booking.formSubmissionId || v1Booking.formInfo?.formSubmissionId || v1Booking.formInfo?.submissionId || submissionId;
                }
            } catch (e2) {
                // 3. Try queryExtendedBookings
                try {
                    const elevatedQueryV2 = auth.elevate(extendedBookings.queryExtendedBookings);
                    const result = await elevatedQueryV2({
                        filter: { "_id": idOrBookingId }
                    });
                    const items = result.extendedBookings || [];
                    if (items.length > 0) {
                        const b = items[0].booking || items[0];
                        bookingDetails = b;
                        submissionId = b.formSubmissionId || (b.formInfo ? b.formInfo.formSubmissionId || b.formInfo.submissionId : null) || submissionId;
                    }
                } catch (e3) {}
            }
        }

        // Fetch submission by submissionId using wix-forms v2 methods without auth.elevate wrapper
        let sub = null;
        let fetchError = null;

        // Attempt 1: Direct getSubmission
        try {
            sub = await submissions.getSubmission(submissionId);
        } catch (err1) {
            fetchError = err1.message;
            // Attempt 2: querySubmissions
            try {
                const queryRes = await submissions.querySubmissions().eq("_id", submissionId).find();
                if (queryRes && queryRes.items && queryRes.items.length > 0) {
                    sub = queryRes.items[0];
                }
            } catch (err2) {
                fetchError += ` | querySubmissions error: ${err2.message}`;
                // Attempt 3: querySubmissionsByNamespace
                try {
                    const wixFormsSdk = require('@wix/forms');
                    if (wixFormsSdk && wixFormsSdk.submissions && wixFormsSdk.submissions.getSubmission) {
                        sub = await wixFormsSdk.submissions.getSubmission(submissionId);
                    }
                } catch (err3) {
                    fetchError += ` | @wix/forms error: ${err3.message}`;
                }
            }
        }

        if (!sub) {
            throw new Error(`Could not fetch submission ID ${submissionId}. Errors: ${fetchError}`);
        }

        return {
            status: "Success",
            bookingId: bookingDetails ? (bookingDetails._id || bookingDetails.id) : null,
            submissionId,
            submissionRaw: sub
        };
    } catch (err) {
        return {
            status: "Failed",
            error: err.message
        };
    }
});

function findProperty(obj, propertyName, path = '') {
    const matches = [];

    if (!obj || typeof obj !== 'object') {
        return matches;
    }

    for (const key of Object.keys(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (key === propertyName) {
            matches.push({
                path: currentPath,
                value: obj[key]
            });
        }

        if (obj[key] && typeof obj[key] === 'object') {
            matches.push(
                ...findProperty(obj[key], propertyName, currentPath)
            );
        }
    }

    return matches;
}

/**
 * Diagnostic tool to find the exact JSON path of formSubmissionId in V2 bookings,
 * and automatically include John Danielson's submission details.
 */
export const findFormSubmissionIdPaths = webMethod(Permissions.Admin, async () => {
    try {
        // Query V2 bookings starting from 2026-01-01
        const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);
        const bookingResults = await elevatedQuery({
            filter: {
                "startDate": { "$gte": "2026-01-01T00:00:00Z" }
            },
            pagingMetadata: { limit: 10 }
        });
        const items = bookingResults.extendedBookings || [];

        const findings = [];
        for (const item of items) {
            const matches = findProperty(item, 'formSubmissionId');
            findings.push({
                bookingId: item.booking?._id || item._id,
                matches
            });
        }

        // Also fetch John Danielson submission details directly for Wix Support
        let johnDanielsonSubmission = null;
        try {
            johnDanielsonSubmission = await getFormSubmissionDetails("3240fe99-a524-456e-bf16-5fac2ce11301");
        } catch (e) {
            johnDanielsonSubmission = { error: e.message };
        }

        return {
            status: "Success",
            count: items.length,
            findings,
            johnDanielsonSubmissionResult: johnDanielsonSubmission
        };
    } catch (err) {
        return {
            status: "Failed",
            error: err.message
        };
    }
});


