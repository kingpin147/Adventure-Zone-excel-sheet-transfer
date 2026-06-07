import { Permissions, webMethod } from "wix-web-module";
import { bookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
const wixBookingsV1 = require('wix-bookings-backend');

// SET TO FALSE TO RUN FOR REAL
const DRY_RUN = false; 
const START_DATE = new Date("2026-04-23T00:00:00Z");

export const runV2Migration = webMethod(Permissions.Admin, async () => {
    // ===== PHASE 2: CONFIRM ALL RECOVERED BOOKINGS =====
    // The recovered bookings have status "CREATED" and need to be confirmed
    // so they appear on the calendar and in the Google Sheet sync

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
                participantNotification: { notifyParticipants: false }
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
