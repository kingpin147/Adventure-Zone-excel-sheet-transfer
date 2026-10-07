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
        
        /** @type {Intl.DateTimeFormatOptions} */
        const opts = { 
            timeZone: 'America/Vancouver', 
            hour12: false,
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        };
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
    const submissionData = latestSubmission ? (latestSubmission.submissions || (latestSubmission.submission && latestSubmission.submission.submissions) || latestSubmission) : null;
    if (submissionData) {
        // Logging one sample for verification as requested by Wix
        if (Object.keys(submissionsByBookingId)[0] === b._id) {
            console.log(`Sample V2 Submission Keys for ${b._id}:`, JSON.stringify(submissionData));
        }

        Object.entries(submissionData).forEach(([key, value]) => {
            // Check if it matches a V1 GUID key format: s_8da98aba_a973_4da8_945b_4c7fde36fd53
            const isV1Pattern = /^[sc]_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/i.test(key);
            
            let normalizedId = key;
            if (isV1Pattern) {
                normalizedId = key.replace(/^[sc]_/i, '').replace(/_/g, '-');
            } else if (key.startsWith('s_') || key.startsWith('c_')) {
                // For V2 fields starting with prefix but not matching V1 pattern
                normalizedId = key.substring(2);
            }

            const existingIdx = fields.findIndex(f =>
                (f._id || '').toLowerCase() === normalizedId.toLowerCase() ||
                (f._id || '').toLowerCase() === key.toLowerCase()
            );
            if (existingIdx >= 0) {
                fields[existingIdx].value = value;
                // Update the label just in case the existing one was missing or we now have a better one
                if (!fields[existingIdx].label) fields[existingIdx].label = key;
            } else {
                // Add the normalized key. We now set the label to 'key' because with the new enrich logic, 'key' is the actual form label.
                fields.push({ _id: normalizedId, value: value, label: key });
                // Also add the raw key if it differs, ensuring maximum compatibility
                if (normalizedId !== key) {
                    fields.push({ _id: key, value: value, label: key });
                }
            }
        });
    }

    const usedIndices = new Set();

    /**
     * Finds a field by key (V2) or label keywords (V1).
     * Marks ALL matching entries as used so duplicates are consumed.
     */
    function getField(v2Key, v1Keywords) {
        let foundVal = null;
        const keys = Array.isArray(v2Key) ? v2Key : (v2Key ? [v2Key] : []);
        const keywords = Array.isArray(v1Keywords) ? v1Keywords : (v1Keywords ? [v1Keywords] : []);

        for (let i = 0; i < fields.length; i++) {
            const f = fields[i];
            const fId = (f._id || "").toLowerCase();
            const fLabel = (f.label || "").toLowerCase();

            const isV2Match = keys.some(k => fId === k.toLowerCase() || fLabel === k.toLowerCase());
            const isV1Match = keywords.some(k => fLabel.includes(k.toLowerCase()) || fId.includes(k.toLowerCase()));

            if (isV2Match || isV1Match) {
                usedIndices.add(i);
                if (foundVal === null && f.value !== undefined && f.value !== null && f.value !== "") {
                    foundVal = f.value;
                }
            }
        }
        
        let val = foundVal !== null ? foundVal : "";
        if (typeof val === "string") val = val.trim();

        // Convert negative / unchecked values to empty string (prevents "Not checked" leaking into sheet)
        if (
            val === false || 
            val === "false" || 
            (typeof val === "string" && (
                val.toLowerCase() === "not checked" || 
                val.toLowerCase() === "unchecked" || 
                val.toLowerCase() === "no"
            ))
        ) {
            return "";
        }

        // Convert boolean-like / positive values to TRUE for checkboxes
        if (
            val === "Checked" || 
            val === true || 
            val === "true" || 
            (typeof val === "string" && (
                val.toLowerCase() === "checked" || 
                val.toLowerCase() === "yes"
            ))
        ) {
            return "TRUE";
        }

        return val;
    }

    // Mark standard contact fields as used so they don't leak into extra columns
    getField(["first_name", "firstname", "first name"], ["first name"]);
    getField(["last_name", "lastname", "last name"], ["last name"]);
    getField(["phone", "phonenumber", "phone number"], ["phone number", "phone"]);
    getField(["email", "emailaddress", "email address"], ["email"]);

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
        h = getField("bp_birthday_child", ["birthday child", "first name of birthday child"]); 
        k = getField("bp_age", ["age of birthday child", "age"]);
        l = getField("bp_letter_colour", ["banner", "lettering", "colour of lettering"]);
        m = getField("bp_num_kids", ["number of kids", "kids", "approximately"]); 
        n = getField("bp_num_adults", ["number of adults", "adults"]);
        
        // Priority 1: Selected option (Premium - $8 / Standard - $5) via add_goody_bag or form_field_2b1c
        let goodyOption = getField(["add_goody_bag", "form_field_2b1c"], ["goody bag options", "goody bag option", "goody bags option"]);
        // Priority 2: Checkbox for goody bags
        let goodyCheckbox = getField(["bp_goody_bags", "form_field_goody_checkbox"], ["add goody bags", "goody bags"]);

        // Normalize goody bag output: "Premium - $8", "Standard - $5", or blank (never "TRUE", "yes", or "Not checked")
        if (goodyOption && goodyOption !== "" && goodyOption !== "TRUE") {
            if (goodyOption.toLowerCase().includes("premium")) {
                o = "Premium - $8";
            } else if (goodyOption.toLowerCase().includes("standard")) {
                o = "Standard - $5";
            } else {
                o = goodyOption;
            }
        } else if (goodyOption === "TRUE" || goodyCheckbox === "TRUE") {
            // Legacy / Checkbox selection defaults to Standard - $5
            o = "Standard - $5";
        } else if (goodyCheckbox && goodyCheckbox !== "" && goodyCheckbox !== "TRUE") {
            if (goodyCheckbox.toLowerCase().includes("premium")) {
                o = "Premium - $8";
            } else if (goodyCheckbox.toLowerCase().includes("standard")) {
                o = "Standard - $5";
            } else {
                o = goodyCheckbox;
            }
        } else {
            o = "";
        }

        p = getField("bp_sand_art", ["add sand art", "sand art"]);
        q = getField("bp_pinata", ["add pinata", "pinata"]);
        r = getField("bp_return_cust", ["booked with us", "return"]);
        s = getField("bp_extra_info", ["anything else", "message", "note", "know"]);
    }

    // Column W: Room selection confirmation
    const roomCheck = getField(
        ["form_field_28ae", "bp_room_confirm"], 
        ["selected the correct room", "correct room", "have you selected"]
    );

    // Collect any genuinely unmapped extra data for dynamic columns
    const standardIgnoredPatterns = [
        "first name", "last name", "email", "phone", "address", 
        "submissionid", "submission_id", "form_field_28ae", 
        "birthday child", "age", "banner", "lettering", "kids", "adults",
        "goody", "sand art", "pinata", "booked with us", "return",
        "anything else", "message", "note", "know", "details", "organization", "correct room"
    ];

    const extra = [];
    fields.forEach((f, idx) => {
        if (!usedIndices.has(idx) && f.label && f.value !== undefined && f.value !== null && f.value !== "" && f.value !== false && f.value !== "null") {
            const keyLower = (f._id || f.label || "").toLowerCase();
            const labelLower = (f.label || "").toLowerCase();
            const isIgnored = standardIgnoredPatterns.some(p => keyLower.includes(p) || labelLower.includes(p)) ||
                              keyLower.startsWith("c_") || 
                              keyLower.startsWith("s_");
            if (!isIgnored) {
                extra.push(`${f.label}: ${f.value}`);
            }
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

    // Column W (index 22): Room confirmation or first extra field
    row[22] = roomCheck || (extra.length > 0 ? extra[0] : "");
    
    // Column X (index 23): Last Data Updated Time and Date
    row[23] = formatVancouverDate(new Date().toISOString());

    // Push any remaining genuinely unmapped custom fields after column X
    if (extra.length > 1 && !roomCheck) {
        row.push(...extra.slice(1));
    } else if (extra.length > 0 && roomCheck) {
        row.push(...extra);
    }
    
    return row;
}

export { formatPhone, formatVancouverDate, mapBookingToRow };
