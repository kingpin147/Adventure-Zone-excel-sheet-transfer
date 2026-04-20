import { customTrigger } from '@wix/automations';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
import { extendedBookings } from '@wix/bookings';
import { fetch } from 'wix-fetch';

//not using code as it for previous developer implementaion and it  not longer exists in production so dont count it

// --- CONFIGURATION ---
const TRIGGER_ID = "120ba264-62e2-42bb-9f35-f6f1ee05856a"; 
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const SCRIPT_URL = "some url"; 

// Helper function for critical logging to the CMS 'logs' collection
async function logCritical(title, message, error = null) {
  try {
    const logEntry = {
      title: title,
      message: message,
      timestamp: new Date()
    };
    if (error) {
      logEntry.errorDetails = typeof error === 'string' ? error : error.message || error.toString();
    }
    await wixData.insert("logs", logEntry, { suppressAuth: true });
    console.log(`Critical Log: ${title} - ${message}`, error || "");
  } catch (err) {
    console.error("Failed to insert log into CMS:", err);
  }
}

// --- 1. MAPPING HELPER (For Google Sheets) ---
export function getMappedRow(b, bookingId) {
    const res = {};
    if (b.additionalFields && Array.isArray(b.additionalFields)) {
        b.additionalFields.forEach(field => {
            if (field._id) {
                const formattedId = field._id.replace(/-/g, "_");
                res[`s_${formattedId}`] = field.value;
                res[`c_${formattedId}`] = field.value === "Checked" || field.value === true;
            }
        });
    }

    const serviceName = b.bookedService?.name || b.bookedEntity?.title || "";
    
    let rawPhone = b.contactDetails?.phone || "";
    let clean = rawPhone.replace(/[^\d]/g, "");
    let formattedPhone = rawPhone;
    if (clean.length === 10) {
        formattedPhone = `+1-${clean.slice(0,3)}-${clean.slice(3,6)}-${clean.slice(6)}`;
    } else if (clean.length === 11 && clean.startsWith("1")) {
        formattedPhone = `+1-${clean.slice(1,4)}-${clean.slice(4,7)}-${clean.slice(7)}`;
    }

    const hasGroupField = (res["s_18f379e7_7cb1_4d49_ab10_e58dde8c30d0"] !== undefined || res["s_f2fcf0ee_a161_4441_8774_9dcfd94d959e"] !== undefined);
    const isGroupActivity = hasGroupField || serviceName.toLowerCase().includes("group");

    let h = "", k = "", l = "", m = "", n = "", o = "", p = "", q = "", r = "", s = "";
    if (isGroupActivity) {
        h = res["s_ddc54cc9_58c2_4719_a624_dff45aece64e"] || ""; 
        k = res["s_d2afd821_b61a_49dd_88f6_0c875d4bf9c9"] || ""; 
        l = "n/a";
        m = res["s_18f379e7_7cb1_4d49_ab10_e58dde8c30d0"] || ""; 
        n = res["s_f2fcf0ee_a161_4441_8774_9dcfd94d959e"] || "";
        o = "n/a"; p = "n/a"; q = "n/a"; r = "n/a";
        s = res["s_3040c0ca_b567_41a7_abed_e10fc090fc43"] || "";
    } else {
        h = res["s_8da98aba_a973_4da8_945b_4c7fde36fd53"] || ""; 
        k = res["s_ddc54cc9_58c2_4719_a624_dff45aece64e"] || "";
        l = res["s_3be35852_23cd_468a_8aa1_8cafa4fa73f2"] || "";
        m = res["s_d2afd821_b61a_49dd_88f6_0c875d4bf9c9"] || ""; 
        n = res["s_a123bb4c_cd17_40d7_b8c9_76418c40851b"] || "";
        o = res["c_01196b47_1ce2_44e0_9ae6_745d814752f2"] ? "TRUE" : "";
        p = res["c_5951def1_1464_448e_97f3_d748c65c4c96"] ? "TRUE" : "";
        q = res["c_5e8ab05a_915d_4ff4_b7fc_1e336a3ff66c"] ? "TRUE" : "";
        r = res["c_aaeef4dc_6c8f_4c67_a4cc_6bf98deda30b"] ? "TRUE" : "";
        s = res["s_66923e81_1282_4689_bc32_08d3c020492c"] || "";
    }

    // Helper to find a field by ID or Label keywords
    function popField(id, keywords) {
        let found = null;
        for (let i = 0; i < fields.length; i++) {
            if (usedFieldEntries.has(i)) continue;

            const f = fields[i];
            const fId = (f._id || "").toLowerCase();
            const fLabel = (f.label || "").toLowerCase();
            
            const idMatch = id && fId === id.toLowerCase();
            const keywordMatch = keywords && keywords.some(k => fLabel.includes(k.toLowerCase()));

            if (idMatch || keywordMatch) {
                found = f;
                usedFieldEntries.add(i);
                break;
            }
        }
        const val = found ? found.value : "";
        return (val === null || val === undefined) ? "" : val;
    }

    const serviceName = b.bookedService?.name || b.bookedEntity?.title || "";
    const isGroupActivity = serviceName.toLowerCase().includes("group");

    // Track used fields to avoid duplicates in dynamic columns
    const usedFieldEntries = new Set();

    let h = "", k = "", l = "", m = "", n = "", o = "", p = "", q = "", r = "", s = "";
    if (isGroupActivity) {
        h = popField("ddc54cc9-58c2-4719-a624-dff45aece64e", ["organization"]); 
        k = popField("d2afd821-b61a-49dd-88f6-0c875d4bf9c9", ["age range"]); 
        l = "n/a";
        m = popField("18f379e7-7cb1-4d49-ab10-e58dde8c30d0", ["number of kids"]); 
        n = popField("f2fcf0ee-a161-4441-8774-9dcfd94d959e", ["number of adults"]);
        o = "n/a"; p = "n/a"; q = "n/a"; r = "n/a";
        s = popField("3040c0ca-b567-41a7-abed-e10fc090fc43", ["details", "anything else", "message", "know"]);
    } else {
        h = popField("8da98aba-a973-4da8-945b-4c7fde36fd53", ["birthday child"]); 
        k = popField("ddc54cc9-58c2-4719-a624-dff45aece64e", ["age"]);
        l = popField("3be35852-23cd-468a-8aa1-8cafa4fa73f2", ["banner", "lettering"]);
        m = popField("d2afd821-b61a-49dd-88f6-0c875d4bf9c9", ["kids", "approximately"]); 
        n = popField("a123bb4c-cd17-40d7-b8c9-76418c40851b", ["adults"]);
        
        const goodyVal = popField("01196b47-1ce2-44e0-9ae6-745d814752f2", ["goody bags"]);
        o = (goodyVal === "Checked" || goodyVal === true || goodyVal === "true") ? "TRUE" : "";
        
        const sandVal = popField("5951def1-1464-448e-97f3-d748c65c4c96", ["sand art"]);
        p = (sandVal === "Checked" || sandVal === true || sandVal === "true") ? "TRUE" : "";
        
        const pinataVal = popField("5e8ab05a-915d-4ff4-b7fc-1e336a3ff66c", ["pinata"]);
        q = (pinataVal === "Checked" || pinataVal === true || pinataVal === "true") ? "TRUE" : "";
        
        const pastVal = popField("aaeef4dc-6c8f-4c67-a4cc-6bf98deda30b", ["booked with us"]);
        r = (pastVal === "Checked" || pastVal === true || pastVal === "true") ? "TRUE" : "";
        
        s = popField("66923e81-1282-4689-bc32-08d3c020492c", ["anything else", "message", "note", "know"]);
    }

// --- 2. MAIN TRIGGER (On Update) ---
export async function wixBookingsV2_onBookingUpdated(event) {
    const bookingId = event.entityId || (event.booking && event.booking["_id"]);
    const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);

    const result = await elevatedQuery({ filter: { "_id": bookingId } });

    if (result.extendedBookings && result.extendedBookings.length > 0) {
        const rootBooking = result.extendedBookings[0];
        const b = rootBooking.booking || rootBooking;

        // Sync to Google Sheet
        const rowArray = getMappedRow(b, bookingId);
        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookings: [rowArray] })
            });

            if (response.ok) {
                let jsonResponse;
                try { jsonResponse = await response.json(); } catch(e){}

                if (jsonResponse && jsonResponse.status === "error") {
                    await logCritical("Event Update App Error", `Google Apps Script error tracking booking update ${bookingId}`, jsonResponse.message);
                }
            } else {
                const errText = await response.text();
                await logCritical("Event Update Failed", `HTTP Status: ${response.status} syncing booking ${bookingId}`, errText);
            }
        } catch (fetchErr) {
            await logCritical("Event Update Exception", `Network or processing error during sync for ${bookingId}`, fetchErr);
        }

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
