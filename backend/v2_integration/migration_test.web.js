import { Permissions, webMethod } from "wix-web-module";
import { runV2Migration } from './migration.web';

/**
 * Trigger a Dry Run migration.
 * This will NOT create actual V2 bookings or cancel V1 bookings.
 * Instead, it will output results to the 'MigrationTestResults' CMS collection.
 */
export const testDryRun = webMethod(Permissions.Admin, async (birthdayFormId = "", groupFormId = "") => {
    console.log("Starting Migration Dry Run...");
    const result = await runV2Migration(birthdayFormId, groupFormId);
    return {
        message: "Dry Run completed. Please check 'MigrationTestResults' CMS collection.",
        result
    };
});

/**
 * Trigger the LIVE migration.
 * WARNING: This will create actual V2 bookings and CANCEL the original V1 bookings.
 * Only run this after verifying the Dry Run results and disabling Wix Automations.
 */
export const testLiveRun = webMethod(Permissions.Admin, async (confirm, birthdayFormId = "", groupFormId = "") => {
    if (confirm !== "I_AM_SURE") {
        return {
            error: "You must pass 'I_AM_SURE' to trigger the live migration."
        };
    }

    console.log("Starting LIVE Migration...");
    const result = await runV2Migration(birthdayFormId, groupFormId);
    return {
        message: "Live Migration completed.",
        result
    };
});

import { services, bookings } from '@wix/bookings';
import { auth } from '@wix/essentials';

export const testV2ServiceAndBooking = webMethod(Permissions.Admin, async () => {
    try {
        // 1. Try querying services using @wix/bookings and elevated auth
        const elevatedQueryServices = auth.elevate(services.queryServices);
        const servicesResult = await elevatedQueryServices().find();
        
        const serviceCount = servicesResult.items ? servicesResult.items.length : 
                            (servicesResult.services ? servicesResult.services.length : 0);

        let bookingTestResult = "Not attempted";
        let bookingError = null;

        // 2. Try creating a dummy booking using a known V1 Service ID
        // Service ID for a birthday party
        const testServiceId = "006d8b0f-f142-4dc5-b4d6-e9937eed6937"; 
        
        // Date 1 month from now to avoid conflicts
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 30);
        const end = new Date(tomorrow);
        end.setHours(tomorrow.getHours() + 1);

        try {
            const elevatedCreate = auth.elevate(bookings.createBooking);
            const dummyBooking = await elevatedCreate({
                serviceId: testServiceId,
                bookedEntity: {
                    slot: {
                        startDate: tomorrow.toISOString(),
                        endDate: end.toISOString()
                    }
                },
                contactDetails: {
                    firstName: "Test",
                    lastName: "Migration",
                    email: "test@example.com",
                    phone: "1234567890"
                }
            }, {
                participantNotification: { notifyParticipants: false }
            });

            if (dummyBooking) {
                bookingTestResult = "Success! Created dummy booking ID: " + dummyBooking._id;
                // Clean it up immediately
                const elevatedCancel = auth.elevate(bookings.cancelBooking);
                await elevatedCancel(dummyBooking._id, { participantNotification: { notifyParticipants: false }});
                bookingTestResult += " (And successfully cancelled it)";
            }
        } catch (err) {
            bookingError = "V2 Booking Creation Failed: " + err.message;
        }

        return {
            status: "Diagnostics Completed",
            elevatedV2ServicesCount: serviceCount,
            dummyBookingTest: bookingError || bookingTestResult
        };

    } catch (err) {
        return {
            status: "Diagnostics Failed",
            error: err.message
        };
    }
});
