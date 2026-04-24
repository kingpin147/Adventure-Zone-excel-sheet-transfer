import { Permissions, webMethod } from "wix-web-module";
import { bookings } from 'wix-bookings.v2'; 
const wixBookingsV1 = require('wix-bookings-backend'); 

const DRY_RUN = true; // Change to false when ready

export const runMasterMigration = webMethod(Permissions.Admin, async () => {
    const birthdayServices = [
        "d0c2496b-536b-434e-92cf-f637cc69d610", 
        "bf6e95c2-275e-4c24-8926-886a10cfb5f2", 
        "18601f51-8af0-44c2-af61-4e773f0c7a68", 
        "006d8b0f-f142-4dc5-b4d6-e9937eed6937"
    ];
    const groupService = "5eb1b06e-2dbd-438c-b83a-977fe736db6e";

    const v1Query = await wixBookingsV1.bookings.queryBookings()
        .gt("startTime", new Date()) 
        .limit(100)
        .find();

    const allFuture = v1Query.items;
    let summary = [];

    for (const sId of birthdayServices) {
        const matches = allFuture.filter(b => b.bookedEntity?.serviceId === sId);
        summary.push(await migrateList(matches, sId, "BIRTHDAY"));
    }

    const groupMatches = allFuture.filter(b => b.bookedEntity?.serviceId === groupService);
    summary.push(await migrateList(groupMatches, groupService, "GROUP"));

    return summary;
});

async function migrateList(items, serviceId, type) {
    let count = 0;
    console.log(`Processing ${items.length} bookings for service: ${serviceId}`);

    for (const old of items) {
        const payload = type === "BIRTHDAY" ? mapBirthday(old) : mapGroup(old);
        
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
            console.log(`[DRY RUN] Client: ${old.formInfo.contactDetails.firstName}`, payload);
            count++;
        } else {
            try {
                await bookings.createBooking(bookingInfo, {
                    participantNotification: { notifyParticipants: false }
                });
                count++;
            } catch (err) {
                console.error(`Error migrating ${old._id}: ${err.message}`);
            }
        }
    }
    return `Service ${serviceId}: ${count} processed.`;
}

function mapBirthday(old) {
    // Robust check: If the field has ANY text/value, it's considered "Checked"
    const check = (label) => {
        const val = getV1(old, label);
        return val !== undefined && val !== null && val !== "" && val !== false;
    };

    return {
        "form_field_28ae": check("Have you selected the correct room? (See Booking Details to view which room you have selected.)"),
        "bp_birthday_child": getV1(old, "First Name of Birthday Child"),
        "bp_age": getV1(old, "Age of Birthday Child"),
        "bp_num_kids": getV1(old, "Number of Kids (approximately)"),
        "bp_num_adults": getV1(old, "Number of Adults"),
        "bp_letter_colour": getV1(old, "Colour of Lettering on Banner\n(blue, red, green, yellow, gold, pink, purple, doesn't matter)"),
        "bp_pinata": check("Add Pinata? $40"),
        "bp_goody_bags": check("Add Goody Bags? $6 per child"),
        "bp_sand_art": check("Add Sand Art? $8 per child"),
        "bp_extra_info": getV1(old, "Anything else you'd like us to know?"),
        "bp_return_cust": check("Click here if you have booked with us before")
    };
}

function mapGroup(old) {
    return {
        "ga_org": getV1(old, "Organization"),
        "ga_age": getV1(old, "Age Range"),
        "ga_num_kids": getV1(old, "Number of kids"),
        "ga_num_adults": getV1(old, "Number of adults"),
        "ga_details": getV1(old, "Details of booking (playground, arcade, price, etc).")
    };
}

function getV1(booking, label) {
    const fields = booking.formInfo?.additionalFields || [];
    const field = fields.find(f => f.label === label);
    return field ? field.value : "";
}
