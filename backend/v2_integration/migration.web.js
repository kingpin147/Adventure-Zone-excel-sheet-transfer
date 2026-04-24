import { Permissions, webMethod } from "wix-web-module";
import { bookings } from 'wix-bookings.v2';
const wixBookingsV1 = require('wix-bookings-backend');

// SET TO FALSE TO RUN FOR REAL
const DRY_RUN = true; 

export const runV2Migration = webMethod(Permissions.Admin, async () => {
    const birthdayServices = [
        "d0c2496b-536b-434e-92cf-f637cc69d610", 
        "bf6e95c2-275e-4c24-8926-886a10cfb5f2", 
        "18601f51-8af0-44c2-af61-4e773f0c7a68", 
        "006d8b0f-f142-4dc5-b4d6-e9937eed6937"
    ];
    const groupService = "5eb1b06e-2dbd-438c-b83a-977fe736db6e";

    // 1. Get all future bookings from V1
    const v1Query = await wixBookingsV1.bookings.queryBookings()
        .gt("startTime", new Date()) 
        .limit(100)
        .find();

    const allFuture = v1Query.items;
    let totalCount = 0;
    let results = [];

    // 2. Migrate Birthday Parties
    for (const sId of birthdayServices) {
        const matches = allFuture.filter(b => b.bookedEntity?.serviceId === sId);
        const count = await migrateItems(matches, sId, "BIRTHDAY");
        results.push(`Service ${sId} (Birthday): ${count} bookings migrated.`);
        totalCount += count;
    }

    // 3. Migrate Group Activities
    const groupMatches = allFuture.filter(b => b.bookedEntity?.serviceId === groupService);
    const gCount = await migrateItems(groupMatches, groupService, "GROUP");
    results.push(`Service ${groupService} (Group): ${gCount} bookings migrated.`);
    totalCount += gCount;

    return {
        summary: results,
        total: totalCount,
        status: DRY_RUN ? "DRY RUN COMPLETED" : "LIVE MIGRATION COMPLETED"
    };
});

async function migrateItems(items, serviceId, type) {
    let count = 0;
    for (const old of items) {
        const payload = type === "BIRTHDAY" ? mapBirthdayToV2(old) : mapGroupToV2(old);
        
        const bookingInfo = {
            "serviceId": serviceId,
            "slot": { 
                "startTime": old.bookedEntity.singleSession.start, 
                "endTime": old.bookedEntity.singleSession.end 
            },
            "contactDetails": old.formInfo.contactDetails,
            "formSubmission": payload
        };

        if (DRY_RUN) {
            console.log(`[DRY RUN] Would migrate: ${old.formInfo.contactDetails.firstName} for service ${serviceId}`);
            count++;
        } else {
            try {
                await bookings.createBooking(bookingInfo, {
                    participantNotification: { notifyParticipants: false }
                });
                count++;
            } catch (err) {
                console.error(`Migration Failed for ${old._id}:`, err.message);
            }
        }
    }
    return count;
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
