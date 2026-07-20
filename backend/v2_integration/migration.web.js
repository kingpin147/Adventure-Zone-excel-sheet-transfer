import { Permissions, webMethod } from "wix-web-module";
import { bookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
const wixBookingsV1 = require('wix-bookings-backend');

// SET TO FALSE TO RUN FOR REAL
const DRY_RUN = true; 
const START_DATE = new Date("2026-04-23T00:00:00Z");

/**
 * Run the bookings form data update.
 * Safe flow: Gets existing V2 booking, updates its formSubmission with parsed V1/legacy form data.
 */
export const runV2Migration = webMethod(Permissions.Admin, async (birthdayFormId = "", groupFormId = "") => {
    const birthdayServices = [
        "d0c2496b-536b-434e-92cf-f637cc69d610", 
        "bf6e95c2-275e-4c24-8926-886a10cfb5f2", 
        "18601f51-8af0-44c2-af61-4e773f0c7a68", 
        "006d8b0f-f142-4dc5-b4d6-e9937eed6937"
    ];
    const groupService = "5eb1b06e-2dbd-438c-b83a-977fe736db6e";

    try {
        let bFormId = birthdayFormId;
        let gFormId = groupFormId;

        if (!bFormId || !gFormId) {
            throw new Error("Form IDs were not provided. Please run the script by passing your V2 Birthday and Group Form IDs (e.g. testDryRun('birthday-id', 'group-id')).");
        }

        console.log(`Forms detected/configured. Birthday Form ID: ${bFormId}, Group Form ID: ${gFormId}`);

        // 1. Get all future bookings from V1 created after START_DATE with active status
        const v1Query = await wixBookingsV1.bookings.queryBookings()
            .gt("startTime", new Date().toISOString()) 
            .ge("_createdDate", START_DATE)
            .limit(1000)
            .find();

        const allFuture = (v1Query.items || []).filter(b => b.status === "CONFIRMED" || b.status === "PENDING");
        console.log(`Found ${allFuture.length} future V1 bookings for migration (CONFIRMED/PENDING).`);

        let totalCount = 0;
        let results = [];

        // 2. Migrate Birthday Parties
        for (const sId of birthdayServices) {
            const matches = allFuture.filter(b => b.bookedEntity?.serviceId === sId);
            const count = await migrateItems(matches, sId, "BIRTHDAY", bFormId, gFormId);
            results.push(`Service ${sId} (Birthday): ${count} bookings processed.`);
            totalCount += count;
        }

        // 3. Migrate Group Activities
        const groupMatches = allFuture.filter(b => b.bookedEntity?.serviceId === groupService);
        const gCount = await migrateItems(groupMatches, groupService, "GROUP", bFormId, gFormId);
        results.push(`Service ${groupService} (Group): ${gCount} bookings processed.`);
        totalCount += gCount;

        return {
            summary: results,
            total: totalCount,
            status: DRY_RUN ? "DRY RUN COMPLETED" : "LIVE MIGRATION COMPLETED"
        };
    } catch (err) {
        console.error("Migration script failed:", err.message);
        await logErrorToCMS("Migration Failed", err.message);
        return {
            status: "FAILED",
            error: err.message
        };
    }
});

/**
 * Helper method to confirm any bookings still left in "CREATED" status.
 */
export const confirmAllCreatedBookings = webMethod(Permissions.Admin, async () => {
    const elevatedQuery = auth.elevate(bookings.queryBookings);
    const result = await elevatedQuery({
        filter: {
            "status": "CREATED"
        }
    });

    const createdBookings = result.items || [];
    console.log(`Found ${createdBookings.length} bookings with status CREATED`);

    let confirmed = 0;
    let failed = 0;
    let details = [];

    for (const b of createdBookings) {
        const name = `${b.contactDetails?.firstName || ''} ${b.contactDetails?.lastName || ''}`.trim();
        try {
            const elevatedConfirm = auth.elevate(bookings.confirmBooking);
            await elevatedConfirm(b._id, { 
                participantNotification: { notifyParticipants: false },
                flowControlSettings: { ignoreCapacity: true }
            });
            confirmed++;
            console.log(`CONFIRMED: ${name} (${b._id}) - ${b.startDate}`);
            details.push(`OK: ${name} - ${b.startDate}`);
        } catch (err) {
            failed++;
            console.error(`FAIL to confirm ${name} (${b._id}): ${err.message}`);
            details.push(`FAIL: ${name} - ${err.message}`);
        }
    }

    return {
        status: "CONFIRMATION COMPLETE",
        found: createdBookings.length,
        confirmed,
        failed,
        details
    };
});

async function migrateItems(items, serviceId, type, birthdayFormId, groupFormId) {
    let count = 0;
    for (const old of items) {
        const payload = type === "BIRTHDAY" ? mapBirthdayToV2(old) : mapGroupToV2(old);
        
        // Construct formFields in V2 format: array of { fieldId, value }
        const formFields = Object.entries(payload).map(([key, val]) => ({
            fieldId: key,
            value: val
        }));

        const bookingInfo = {
            "serviceId": serviceId,
            "bookedEntity": {
                "slot": { 
                    "sessionId": old.bookedEntity.singleSession.sessionId,
                    "startDate": old.bookedEntity.singleSession.start, 
                    "endDate": old.bookedEntity.singleSession.end 
                }
            },
            "contactDetails": old.formInfo.contactDetails,
            "numberOfParticipants": 1,
            "formSubmission": {
                "formId": type === "BIRTHDAY" ? birthdayFormId : groupFormId,
                "fields": formFields
            }
        };

        if (DRY_RUN) {
            console.log(`[DRY RUN] Would update: ${old.formInfo?.contactDetails?.firstName} for service ${serviceId}`);
            // Log to CMS for visual verification
            await logDryRunToCMS(old, bookingInfo, type);
            count++;
        } else {
            // LIVE RUN
            try {
                await logErrorToCMS("Migration Attempt", `Starting update for ${old._id}`);

                const elevatedGet = auth.elevate(bookings.getBooking);
                const currentBooking = await elevatedGet(old._id);

                if (!currentBooking) {
                    throw new Error(`Booking ${old._id} not found in V2 API.`);
                }

                // Update formSubmission
                currentBooking.formSubmission = {
                    formId: type === "BIRTHDAY" ? birthdayFormId : groupFormId,
                    fields: formFields
                };

                const elevatedUpdate = auth.elevate(bookings.updateBooking);
                await elevatedUpdate(old._id, currentBooking);
                
                count++;

            } catch (err) {
                console.error(`Update Failed for ${old._id}:`, err.message);
                await logErrorToCMS("Migration Failed", `Booking ${old._id} could not be updated: ${err.message}`);
            }
        }
    }
    return count;
}

async function logErrorToCMS(title, message) {
    try {
        await wixData.insert("logs", {
            title: `Migration: ${title}`,
            message,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Critical logging failed:", e.message);
    }
}

async function logDryRunToCMS(oldBooking, v2Payload, type) {
    try {
        await wixData.insert("MigrationTestResults", {
            v1BookingId: oldBooking._id,
            clientName: `${oldBooking.formInfo.contactDetails.firstName} ${oldBooking.formInfo.contactDetails.lastName}`,
            startTime: oldBooking.bookedEntity.singleSession.start,
            serviceType: type,
            mappedPayload: JSON.stringify(v2Payload.formSubmission, null, 2),
            timestamp: new Date()
        });
    } catch (err) {
        console.error("Failed to log dry run to CMS:", err.message);
    }
}

function mapBirthdayToV2(old) {
    const getVal = (label) => {
        const field = (old.formInfo?.additionalFields || []).find(f => f.label === label);
        return field ? field.value : "";
    };
    const isChecked = (label) => {
        const val = getVal(label);
        return val !== "" && val !== false && val !== null;
    };

    return {
        "form_field_28ae": true, // Default to true for the room selection check
        "bp_birthday_child": getVal("First Name of Birthday Child"),
        "bp_age": getVal("Age of Birthday Child"),
        "bp_num_kids": getVal("Number of Kids (approximately)"),
        "bp_num_adults": getVal("Number of Adults"),
        "bp_letter_colour": getVal("Colour of Lettering on Banner\n(blue, red, green, yellow, gold, pink, purple, doesn't matter)"),
        "bp_pinata": isChecked("Add Pinata? $40"),
        "bp_goody_bags": isChecked("Add Goody Bags? $6 per child"),
        "bp_sand_art": isChecked("Add Sand Art? $8 per child"),
        "bp_extra_info": getVal("Anything else you'd like us to know?"),
        "bp_return_cust": isChecked("Click here if you have booked with us before")
    };
}

function mapGroupToV2(old) {
    const getVal = (label) => {
        const field = (old.formInfo?.additionalFields || []).find(f => f.label === label);
        return field ? field.value : "";
    };
    return {
        "ga_org": getVal("Organization"),
        "ga_age": getVal("Age Range"),
        "ga_num_kids": getVal("Number of kids"),
        "ga_num_adults": getVal("Number of adults"),
        "ga_details": getVal("Details of booking (playground, arcade, price, etc).")
    };
}
