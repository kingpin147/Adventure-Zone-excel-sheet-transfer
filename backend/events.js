import { customTrigger } from '@wix/automations';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
import { extendedBookings } from 'wix-bookings.v2';
import { fetch } from 'wix-fetch';

// --- CONFIGURATION ---
const TRIGGER_ID = "120ba264-62e2-42bb-9f35-f6f1ee05856a"; 
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwYP_QYOEKVt6k0xDVgN7ChUtocd2iH3eL00h0mLiHllNq2N2Grf8BIBDcalA4OjSRX/exec"; 

// --- 1. MAPPING HELPER (For Google Sheets) ---
export function getMappedRow(b, bookingId) {
    const res = b.formInfo?.extendedFormResponses || {};
    const serviceName = b.bookedService?.name || "";
    
    let rawPhone = b.contactDetails?.phone || "";
    let clean = rawPhone.replace(/[^\d]/g, "");
    let formattedPhone = clean.length === 10 ? `+1-${clean.slice(0,3)}-${clean.slice(3,6)}-${clean.slice(6)}` : rawPhone;

    let h, k, m, n, s;
    if (serviceName.toLowerCase().includes("group")) {
        h = res["s_ddc54cc9_58c2_4719_a624_dff45aece64e"] || ""; 
        k = res["s_d2afd821_b61a_49dd_88f6_0c875d4bf9c9"] || ""; 
        m = res["s_18f379e7_7cb1_4d49_ab10_e58dde8c30d0"] || ""; 
        n = res["s_f2fcf0ee_a161_4441_8774_9dcfd94d959e"] || "";
        s = res["s_3040c0ca_b567_41a7_abed_e10fc090fc43"] || "";
    } else {
        h = res["s_8da98aba_a973_4da8_945b_4c7fde36fd53"] || ""; 
        k = res["s_ddc54cc9_58c2_4719_a624_dff45aece64e"] || "";
        m = res["s_d2afd821_b61a_49dd_88f6_0c875d4bf9c9"] || ""; 
        n = res["s_a123bb4c_cd17_40d7_b8c9_76418c40851b"] || "";
        s = res["s_66923e81_1282_4689_bc32_08d3c020492c"] || "";
    }

    return [
        b.selectedSession?.start?.timestamp || "", b.selectedSession?.end?.timestamp || "", 
        b.notes || b.internalNotes || "", b.selectedSession?.staffMemberName || "", 
        serviceName, b.contactDetails?.firstName || "", b.contactDetails?.lastName || "", 
        h, formattedPhone, b.contactDetails?.email || "", k, 
        res["s_3be35852_23cd_468a_8aa1_8cafa4fa73f2"] || "", m, n,
        res["c_01196b47_1ce2_44e0_9ae6_745d814752f2"] || false, res["c_5951def1_1464_448e_97f3_d748c65c4c96"] || false,
        res["c_5e8ab05a_915d_4ff4_b7fc_1e336a3ff66c"] || false, res["c_aaeef4dc_6c8f_4c67_a4cc_6bf98deda30b"] || false,
        s, "obsolete", "obsolete", bookingId
    ];
}

// --- 2. MAIN TRIGGER (On Update) ---
export async function wixBookingsV2_onBookingUpdated(event) {
    const bookingId = event.entityId || (event.booking && event.booking["_id"]);
    const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);
    
    const result = await elevatedQuery({ filter: { "_id": bookingId } });

    if (result.extendedBookings && result.extendedBookings.length > 0) {
        const b = result.extendedBookings[0];

        // Sync to Google Sheet
        const rowArray = getMappedRow(b, bookingId);
        await fetch(SCRIPT_URL, { 
            method: 'POST', 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingId, rowArray }) 
        });

        // Run Reschedule Logic
        await handleRescheduleLogic(b);
    }
}

// --- 3. ORIGINAL RESCHEDULE LOGIC ---
async function handleRescheduleLogic(booking) {
    const bookingId = booking["_id"];
    const newDateStr = booking.selectedSession?.start?.timestamp || booking.startDate;
    const newDateObj = new Date(newDateStr);
    const newStartTime = newDateObj.getTime();
    const now = Date.now();
    const diff = newStartTime - now;

    let previousState = null;
    try {
        const results = await wixData.query("BookingState").eq("_id", bookingId).find({ suppressAuth: true });
        previousState = results.items.length > 0 ? results.items[0] : null;
    } catch (e) { console.log("State search skipped"); }

    const oldStartTime = previousState?.startDate ? new Date(previousState.startDate).getTime() : null;
    const isInsideWindow = diff > 0 && diff <= TEN_DAYS_MS;
    const dateChanged = newStartTime !== oldStartTime;
    const wasOutside = !oldStartTime || (oldStartTime - now) > TEN_DAYS_MS;

    if (isInsideWindow && dateChanged && wasOutside) {
        try {
            const payload = mapToPayload(booking);
            const elevatedRun = auth.elevate(customTrigger.runTrigger);
            await elevatedRun({ triggerId: TRIGGER_ID, payload });
        } catch (err) { console.error("Automation Trigger Error", err); }
    }

    await wixData.save("BookingState", { _id: bookingId, title: bookingId, startDate: newDateObj }, { suppressAuth: true });
}

// --- 4. ORIGINAL PAYLOAD MAPPING ---
function mapToPayload(b) {
    const contact = b.contactDetails || {};
    return {
        contactId: b.contactId || contact.contactId || '', 
        bookingId: b["_id"],
        startDate: b.selectedSession?.start?.timestamp || b.startDate,
        endDate: b.selectedSession?.end?.timestamp || b.endDate,
        serviceName: b.bookedService?.name || '',
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email || '',
        phone: contact.phone || ''
    };
}
