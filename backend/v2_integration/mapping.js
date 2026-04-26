/**
 * UNIVERSAL MAPPING LOGIC
 * Handles both legacy V1 (label-based) and new V2 (key-based) booking data.
 */

/**
 * Formats a phone number to +1-XXX-XXX-XXXX
 */
function formatPhone(rawPhone) {
    if (!rawPhone) return "";
    const clean = rawPhone.replace(/[^\d]/g, "");
    if (clean.length === 10) {
        return `+1-${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    } else if (clean.length === 11 && clean.startsWith("1")) {
        return `+1-${clean.slice(1, 4)}-${clean.slice(4, 7)}-${clean.slice(7)}`;
    }
    return rawPhone;
}

/**
 * Formats date to Vancouver Time with Offset
 */
function formatVancouverDate(isoStr) {
    if (!isoStr) return "";
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        
        const opts = { timeZone: 'America/Vancouver', hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit' };
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

/**
 * Maps a Wix Booking object to a Google Sheet Row (Array)
 */
function mapBookingToRow(booking, submissionsByBookingId = {}) {
    const b = booking.booking || booking;
    const bookingId = b._id;
    
    // 1. Gather all possible fields (V1 additionalFields and V2 formResponses)
    const fields = [];
    if (b.additionalFields && Array.isArray(b.additionalFields)) {
        fields.push(...b.additionalFields);
    }
    if (b.formInfo && Array.isArray(b.formInfo.formResponses)) {
        fields.push(...b.formInfo.formResponses);
    }
    // V2 also uses extendedFormResponses for custom keys
    if (b.formInfo && b.formInfo.extendedFormResponses) {
        Object.entries(b.formInfo.extendedFormResponses).forEach(([key, value]) => {
            // Check if we already have it to avoid duplicates
            if (!fields.some(f => f._id === key || f.label === key)) {
                fields.push({ _id: key, label: key, value: value });
            }
        });
    }

    // 1.1 Overlay latest submission data if available (fixes edited responses)
    const latestSubmission = submissionsByBookingId[b._id];
    if (latestSubmission && latestSubmission.submission && latestSubmission.submission.submissions) {
        // Logging one sample for verification as requested by Wix
        if (Object.keys(submissionsByBookingId)[0] === b._id) {
            console.log(`Sample V2 Submission Keys for ${b._id}:`, JSON.stringify(latestSubmission.submission.submissions));
        }

        Object.entries(latestSubmission.submission.submissions).forEach(([key, value]) => {
            // Normalize key (e.g., s_8da98aba_a973_4da8_945b_4c7fde36fd53 -> 8da98aba-a973-4da8-945b-4c7fde36fd53)
            const normalizedId = key.replace(/^[sc]_/i, '').replace(/_/g, '-');
            const existingIdx = fields.findIndex(f =>
                (f._id || '').toLowerCase() === normalizedId.toLowerCase()
            );
            if (existingIdx >= 0) {
                fields[existingIdx].value = value;
            } else {
                fields.push({ _id: normalizedId, value: value, label: '' });
            }
        });
    }

    const usedIndices = new Set();

    /**
     * Finds a field by key (V2) or label keywords (V1)
     */
    function getField(v2Key, v1Keywords) {
        let found = null;
        for (let i = 0; i < fields.length; i++) {
            if (usedIndices.has(i)) continue;

            const f = fields[i];
            const fId = (f._id || "").toLowerCase();
            const fLabel = (f.label || "").toLowerCase();

            const isV2Match = v2Key && fId === v2Key.toLowerCase();
            const isV1Match = v1Keywords && v1Keywords.some(k => fLabel.includes(k.toLowerCase()));

            if (isV2Match || isV1Match) {
                found = f;
                usedIndices.add(i);
                break;
            }
        }
        let val = found ? found.value : "";
        if (val === null || val === undefined) return "";
        // Convert boolean-like values to TRUE/blank for checkboxes
        if (val === "Checked" || val === true || val === "true") return "TRUE";
        if (val === false || val === "false") return "";
        return val;
    }

    const serviceName = b.bookedService?.name || b.bookedEntity?.title || "";
    const isGroup = serviceName.toLowerCase().includes("group");

    // Mapping to Columns A-S (standard sheet structure)
    let h = "", k = "", l = "", m = "", n = "", o = "", p = "", q = "", r = "", s = "";

    if (isGroup) {
        h = getField("ga_org", ["organization"]); 
        k = getField("ga_age", ["age range"]); 
        l = "n/a";
        m = getField("ga_num_kids", ["number of kids"]); 
        n = getField("ga_num_adults", ["number of adults"]);
        o = "n/a"; p = "n/a"; q = "n/a"; r = "n/a";
        s = getField("ga_details", ["details", "anything else", "message", "know"]);
    } else {
        h = getField("bp_birthday_child", ["birthday child"]); 
        k = getField("bp_age", ["age"]);
        l = getField("bp_letter_colour", ["banner", "lettering"]);
        m = getField("bp_num_kids", ["kids", "approximately"]); 
        n = getField("bp_num_adults", ["adults"]);
        o = getField("bp_goody_bags", ["goody bags"]);
        p = getField("bp_sand_art", ["sand art"]);
        q = getField("bp_pinata", ["pinata"]);
        r = getField("bp_return_cust", ["booked with us", "return"]);
        s = getField("bp_extra_info", ["anything else", "message", "note", "know"]);
    }

    // Collect any leftover data for dynamic columns
    const extra = [];
    fields.forEach((f, idx) => {
        if (!usedIndices.has(idx) && f.label && f.value !== undefined && f.value !== "") {
            extra.push(`${f.label}: ${f.value}`);
        }
    });

    const startDate = formatVancouverDate(b.startDate || b.selectedSession?.start?.timestamp || "");
    const endDate = formatVancouverDate(b.endDate || b.selectedSession?.end?.timestamp || "");
    const staff = b.bookedEntity?.slot?.resource?.name || b.bookedEntity?.staffMember?.name || b.selectedSession?.staffMemberName || "";
    const notes = b.adminNotes || b.internalNotes || b.notes || "";

    const row = [
        startDate, endDate, notes, staff, serviceName,
        b.contactDetails?.firstName || "", b.contactDetails?.lastName || "", 
        h, formatPhone(b.contactDetails?.phone), b.contactDetails?.email || "", 
        k, l, m, n, o, p, q, r, s,
        "n/a", "n/a", bookingId
    ];

    if (extra.length > 0) row.push(...extra);
    
    return row;
}

export { formatPhone, formatVancouverDate, mapBookingToRow };
