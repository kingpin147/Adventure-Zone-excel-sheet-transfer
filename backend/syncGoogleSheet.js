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

export async function export10DaysToGoogleSheets(triggerMetadata) {
  const triggerSource = triggerMetadata ? "Scheduled Job" : "Manual/Direct Call";
  await logCritical("Sync Triggered", `Execution started via ${triggerSource} at ${new Date().toISOString()}`);
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
          ]
        },
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
      
      const fields = [];
      if (b.additionalFields && Array.isArray(b.additionalFields)) {
        fields.push(...b.additionalFields);
      }
      if (b.formInfo && Array.isArray(b.formInfo.formResponses)) {
        fields.push(...b.formInfo.formResponses);
      }
      if (b.formInfo && b.formInfo.extendedFormResponses) {
          Object.entries(b.formInfo.extendedFormResponses).forEach(([label, value]) => {
              if (!fields.some(f => f.label === label)) {
                fields.push({ label, value });
              }
          });
      }
      
      const usedFieldEntries = new Set();
      
      // Helper to find a field by ID or Label keywords
      function popField(id, keywords) {
          let found = null;
          for (let i = 0; i < fields.length; i++) {
              const f = fields[i];
              const fId = (f._id || "").toLowerCase();
              const fLabel = (f.label || "").toLowerCase();
              
              if (id && fId.includes(id.toLowerCase())) {
                  found = f;
                  usedFieldEntries.add(i);
                  break; 
              }
              if (keywords && keywords.some(k => fLabel.includes(k.toLowerCase()))) {
                  found = f;
                  usedFieldEntries.add(i);
              }
          }
          return found ? found.value : undefined;
      }

      const serviceName = b.bookedService?.name || b.bookedEntity?.title || "";
      const isGroupActivity = serviceName.toLowerCase().includes("group");

      // MAPPING LOGIC (Columns A-S standard)
      let h = "", k = "", l = "", m = "", n = "", o = "", p = "", q = "", r = "", s = "";

      if (isGroupActivity) {
          h = popField("ddc54cc9-58c2-4719-a624-dff45aece64e", ["organization"]); 
          k = popField("d2afd821-b61a-49dd-88f6-0c875d4bf9c9", ["age range"]); 
          l = "n/a";
          m = popField("18f379e7-7cb1-4d49-ab10-e58dde8c30d0", ["number of kids"]); 
          n = popField("f2fcf0ee-a161-4441-8774-9dcfd94d959e", ["number of adults"]);
          o = "n/a"; p = "n/a"; q = "n/a"; r = "n/a";
          s = popField("3040c0ca-b567-41a7-abed-e10fc090fc43", ["details", "anything else", "message"]);
      } else {
          h = popField("8da98aba-a973-4da8-945b-4c7fde36fd53", ["birthday child"]); 
          k = popField("ddc54cc9-58c2-4719-a624-dff45aece64e", ["age"]);
          l = popField("3be35852-23cd-468a-8aa1-8cafa4fa73f2", ["banner", "lettering"]);
          m = popField("d2afd821-b61a-49dd-88f6-0c875d4bf9c9", ["kids", "approximately"]); 
          n = popField("a123bb4c-cd17-40d7-b8c9-76418c40851b", ["adults"]);
          
          const goodyVal = popField("01196b47-1ce2-44e0-9ae6-745d814752f2", ["goody bags"]);
          o = (goodyVal === "Checked" || goodyVal === true) ? "TRUE" : "";
          
          const sandVal = popField("5951def1-1464-448e-97f3-d748c65c4c96", ["sand art"]);
          p = (sandVal === "Checked" || sandVal === true) ? "TRUE" : "";
          
          const pinataVal = popField("5e8ab05a-915d-4ff4-b7fc-1e336a3ff66c", ["pinata"]);
          q = (pinataVal === "Checked" || pinataVal === true) ? "TRUE" : "";
          
          const pastVal = popField("aaeef4dc-6c8f-4c67-a4cc-6bf98deda30b", ["booked with us"]);
          r = (pastVal === "Checked" || pastVal === true) ? "TRUE" : "";
          
          s = popField("66923e81-1282-4689-bc32-08d3c020492c", ["anything else", "message", "note"]);
      }

      // Collect EXTRA Fields (Any field not used in A-V mapping)
      const dynamicFields = [];
      fields.forEach((f, index) => {
          if (!usedFieldEntries.has(index)) {
              if (f.label && f.value !== undefined) {
                  dynamicFields.push(`${f.label}: ${f.value}`);
              }
          }
      });
      
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

      const startDate = formatVancouverDate(b.startDate || b.selectedSession?.start?.timestamp || "");
      const endDate = formatVancouverDate(b.endDate || b.selectedSession?.end?.timestamp || "");
      
      const tags = b.bookedEntity?.tags || [];
      const resourceNames = tags.filter(t => t.tag === "RESOURCE" || t.tag === "LOCATION").map(t => t.name).join(", ");
      const staffMember = b.bookedEntity?.slot?.resource?.name || resourceNames || tags.find(t => t.tag === "STAFF")?.name || b.bookedEntity?.staffMember?.name || b.selectedSession?.staffMemberName || "";
      const internalNotes = b.adminNotes || b.internalNotes || b.notes || "";

      // Column V (index 21) is always bookingId. Anything after it is dynamic.
      const row = [
        startDate, endDate, internalNotes, staffMember, serviceName,
        b.contactDetails?.firstName || "", b.contactDetails?.lastName || "", 
        h, formattedPhone, b.contactDetails?.email || "", k, l, m, n, o, p, q, r, s,
        "n/a", "n/a", bookingId
      ];

      if (dynamicFields.length > 0) {
          row.push(...dynamicFields);
      }

      return row;
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
