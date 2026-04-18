import { extendedBookings } from '@wix/bookings';
import { fetch } from 'wix-fetch';
import { auth } from '@wix/essentials';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';

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

export async function export10DaysToGoogleSheets() {
  try {
    const GOOGLE_SCRIPT_URL = await getSecret("GOOGLE_SCRIPT_URL");
    const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);

    // Calculate dates
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endWindow = new Date(startOfToday.getTime());
    endWindow.setDate(endWindow.getDate() + 10);
    endWindow.setHours(23, 59, 59, 999);

    console.log(`Querying bookings from ${startOfToday.toISOString()} to ${endWindow.toISOString()}`);

    let allBookings = [];
    let hasNext = true;
    let cursor = null;

    // Fetch all bookings within the 10-day window
    while (hasNext) {
      const q = {
        filter: {
          "$and": [
            { "startDate": { "$gte": startOfToday.toISOString() } },
            { "startDate": { "$lte": endWindow.toISOString() } },
            { "status": { "$in": ["CONFIRMED", "PENDING"] } }
      ]  },
        sort: [{ fieldName: "startDate", direction: "ASC" }],
        cursorPaging: { limit: 100 }
      };

      if (cursor) q.cursorPaging.cursor = cursor;

      const results = await elevatedQuery(q);
      allBookings = allBookings.concat(results.extendedBookings || []);
      
      if (results.pagingMetadata && results.pagingMetadata.cursors && results.pagingMetadata.cursors.next) {
        cursor = results.pagingMetadata.cursors.next;
      } else {
        hasNext = false;
      }
    }

    // Secondary manual sort to guarantee chronological order before processing
    allBookings.sort((a, b) => {
        const startA = a.startDate || (a.booking && a.booking.startDate);
        const startB = b.startDate || (b.booking && b.booking.startDate);
        return new Date(startA).getTime() - new Date(startB).getTime();
    });

    if (allBookings.length === 0) {
      await logCritical("Production Sync Warning", "No bookings found in the next 10 days.");
      return;
    }

    console.log(`Found ${allBookings.length} bookings. Identifying forms and formatting data...`);

    const mappedRows = allBookings.map(rootBooking => {
      const b = rootBooking.booking || rootBooking;
      
      const res = {};
      const fields = [];
      if (b.additionalFields && Array.isArray(b.additionalFields)) {
        fields.push(...b.additionalFields);
      }
      if (b.formInfo && Array.isArray(b.formInfo.formResponses)) {
        fields.push(...b.formInfo.formResponses);
      }
      
      fields.forEach(field => {
        if (field._id) {
          const formattedId = field._id.replace(/-/g, "_");
          res[`s_${formattedId}`] = field.value;
          res[`c_${formattedId}`] = field.value === "Checked" || field.value === true;
        }
      });
      
      if (b.formInfo && b.formInfo.extendedFormResponses) {
          Object.assign(res, b.formInfo.extendedFormResponses);
      }

      const serviceName = b.bookedService?.name || b.bookedEntity?.title || "";
      const bookingId = b._id;
      
      // Formatting Phone +1-XXX-XXX-XXXX
      const rawPhone = b.contactDetails?.phone || "";
      const cleanPhone = rawPhone.replace(/[^\d]/g, "");
      let formattedPhone = rawPhone;
      if (cleanPhone.length === 10) {
        formattedPhone = `+1-${cleanPhone.slice(0,3)}-${cleanPhone.slice(3,6)}-${cleanPhone.slice(6)}`;
      } else if (cleanPhone.length === 11 && cleanPhone.startsWith("1")) {
        formattedPhone = `+1-${cleanPhone.slice(1,4)}-${cleanPhone.slice(4,7)}-${cleanPhone.slice(7)}`;
      }

      // Check form type based on unique field presences or service name
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

      function formatVancouverDate(isoStr) {
          if (!isoStr) return "";
          try {
              const d = new Date(isoStr);
              if (isNaN(d.getTime())) return isoStr;
              
              const opts = { timeZone: 'America/Vancouver', hour12: false,
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit', second: '2-digit' };
              const f = new Intl.DateTimeFormat('en-US', opts).formatToParts(d);
              const p = {}; f.forEach(pt => p[pt.type] = pt.value);
              
              const localMs = new Date(`${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}Z`).getTime();
              let diffMins = Math.round((localMs - d.getTime()) / 60000);
              const sign = diffMins < 0 ? "-" : "+";
              diffMins = Math.abs(diffMins);
              const hrs = String(Math.floor(diffMins / 60)).padStart(2, '0');
              const mins = String(diffMins % 60).padStart(2, '0');
              
              return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}.000${sign}${hrs}:${mins}`;
          } catch(e) { return isoStr; }
      }

      const startDate = formatVancouverDate(b.startDate || b.selectedSession?.start?.timestamp || "");
      const endDate = formatVancouverDate(b.endDate || b.selectedSession?.end?.timestamp || "");
      
      const tags = b.bookedEntity?.tags || [];
      const resourceNames = tags.filter(t => t.tag === "RESOURCE" || t.tag === "LOCATION").map(t => t.name).join(", ");
      const staffMember = b.bookedEntity?.slot?.resource?.name || resourceNames || tags.find(t => t.tag === "STAFF")?.name || b.bookedEntity?.staffMember?.name || b.selectedSession?.staffMemberName || "";
      const internalNotes = b.adminNotes || b.internalNotes || b.notes || "";

      return [
        startDate, endDate, internalNotes, staffMember, serviceName,
        b.contactDetails?.firstName || "", b.contactDetails?.lastName || "", 
        h, formattedPhone, b.contactDetails?.email || "", k, l, m, n, o, p, q, r, s,
        "n/a", "n/a", bookingId
      ];
    });

    console.log(`Sending ${mappedRows.length} bookings to Google Sheet...`);

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookings: mappedRows })
    });

    if (response.ok) {
        let jsonResponse;
        try {
            jsonResponse = await response.json();
            console.log("Successfully synced to Google Sheets!", jsonResponse);
        } catch (e) {
            await logCritical("Production Sync Error", "Failed to parse Google Apps script response", e);
            return;
        }

        // Add logging for Google Apps Script explicit errors
        if (jsonResponse.status === "error") {
            await logCritical("Production Sync App Error", "Google Apps Script returned an error", jsonResponse.message);
        } else {
            await logCritical("Production Sync Success", `Successfully synced ${mappedRows.length} bookings.`);
        }
    } else {
        const errText = await response.text();
        await logCritical("Production Sync Failed", `HTTP Status: ${response.status} from Google Apps Script`, errText);
    }

  } catch (error) {
    await logCritical("Production Sync Execution Error", "Error running 10 day sync function", error);
  }
}
