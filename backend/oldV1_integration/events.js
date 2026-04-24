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
        formattedPhone = `+1-${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    } else if (clean.length === 11 && clean.startsWith("1")) {
        formattedPhone = `+1-${clean.slice(1, 4)}-${clean.slice(4, 7)}-${clean.slice(7)}`;
    }

    const hasGroupField = (res["s_18f379e7_7cb1_4d49_ab10_e58dde8c30d0"] !== undefined || res["s_f2fcf0ee_a161_4441_8774_9dcfd94d959e"] !== undefined);
    const isGroupActivity = hasGroupField || serviceName.toLowerCase().includes("group");

    // Gather fields for mapping
    const fields = [];
    if (b.additionalFields && Array.isArray(b.additionalFields)) {
        fields.push(...b.additionalFields);
    }
    if (b.formInfo && Array.isArray(b.formInfo.formResponses)) {
        fields.push(...b.formInfo.formResponses);
    }

    // Track used fields to avoid duplicates in dynamic columns
    const usedFieldEntries = new Set();

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

    // Formatting helpers
    function formatVancouverDate(isoStr) {
        if (!isoStr) return "";
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            const opts = { timeZone: 'America/Vancouver', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
            const f = new Intl.DateTimeFormat('en-US', opts).formatToParts(d);
            const p_opts = {}; f.forEach(pt => p_opts[pt.type] = pt.value);
            const localMs = new Date(`${p_opts.year}-${p_opts.month}-${p_opts.day}T${p_opts.hour === '24' ? '00' : p_opts.hour}:${p_opts.minute}:${p_opts.second}Z`).getTime();
            let diffMins = Math.round((localMs - d.getTime()) / 60000);
            const sign = diffMins < 0 ? "-" : "+";
            diffMins = Math.abs(diffMins);
            const hrs = String(Math.floor(diffMins / 60)).padStart(2, '0');
            const mins = String(diffMins % 60).padStart(2, '0');
            return `${p_opts.year}-${p_opts.month}-${p_opts.day}T${p_opts.hour === '24' ? '00' : p_opts.hour}:${p_opts.minute}:${p_opts.second}.000${sign}${hrs}:${mins}`;
        } catch(e) { return isoStr; }
    }

    const startDateFmt = formatVancouverDate(b.startDate || b.selectedSession?.start?.timestamp || "");
    const endDateFmt = formatVancouverDate(b.endDate || b.selectedSession?.end?.timestamp || "");
    const tags = b.bookedEntity?.tags || [];
    const resourceNames = tags.filter(t => t.tag === "RESOURCE" || t.tag === "LOCATION").map(t => t.name).join(", ");
    const staff = b.bookedEntity?.slot?.resource?.name || resourceNames || tags.find(t => t.tag === "STAFF")?.name || b.bookedEntity?.staffMember?.name || b.selectedSession?.staffMemberName || "";
    const notes = b.adminNotes || b.internalNotes || b.notes || "";

    return [
        startDateFmt, endDateFmt, notes, staff, serviceName,
        b.contactDetails?.firstName || "", b.contactDetails?.lastName || "", 
        h, formattedPhone, b.contactDetails?.email || "", k, l, m, n, o, p, q, r, s,
        "n/a", "n/a", bookingId
    ];
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
                try { jsonResponse = await response.json(); } catch (e) { }

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

