import { extendedBookings } from '@wix/bookings';
import { fetch } from 'wix-fetch';
import { auth } from '@wix/essentials';
import { getSecret } from 'wix-secrets-backend';

export async function export10DaysToGoogleSheets() {
  try {
    const GOOGLE_SCRIPT_URL = await getSecret("GOOGLE_SCRIPT_URL");
    const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);

    // Calculate dates
    const now = new Date();
    // Start of today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    // End of 10 days from now
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
            { "startDate": { "$lte": endWindow.toISOString() } }
          ]
        },
        cursorPaging: {
          limit: 100
        }
      };

      if (cursor) {
        q.cursorPaging.cursor = cursor;
      }

      const results = await elevatedQuery(q);
      allBookings = allBookings.concat(results.extendedBookings || []);
      
      // Fixed: PagingMetadataV2 uses cursors.next to determine if there are more items
      if (results.pagingMetadata && results.pagingMetadata.cursors && results.pagingMetadata.cursors.next) {


        cursor = results.pagingMetadata.cursors.next;
      } else {
        hasNext = false;
      }
    }

    if (allBookings.length === 0) {
      console.log("No bookings found in the next 10 days.");
      return;
    }

    console.log(`Found ${allBookings.length} bookings. Identifying forms and formatting data...`);

    const mappedRows = allBookings.map(rootBooking => {
      const b = rootBooking.booking || rootBooking;
      
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
        o = "n/a";
        p = "n/a";
        q = "n/a";
        r = "n/a";
        s = res["s_3040c0ca_b567_41a7_abed_e10fc090fc43"] || "";
      } else {
        h = res["s_8da98aba_a973_4da8_945b_4c7fde36fd53"] || ""; 
        k = res["s_ddc54cc9_58c2_4719_a624_dff45aece64e"] || "";
        l = res["s_3be35852_23cd_468a_8aa1_8cafa4fa73f2"] || "";
        m = res["s_d2afd821_b61a_49dd_88f6_0c875d4bf9c9"] || ""; 
        n = res["s_a123bb4c_cd17_40d7_b8c9_76418c40851b"] || "";
        // Booleans
        o = res["c_01196b47_1ce2_44e0_9ae6_745d814752f2"] ? "TRUE" : "FALSE";
        p = res["c_5951def1_1464_448e_97f3_d748c65c4c96"] ? "TRUE" : "FALSE";
        q = res["c_5e8ab05a_915d_4ff4_b7fc_1e336a3ff66c"] ? "TRUE" : "FALSE";
        r = res["c_aaeef4dc_6c8f_4c67_a4cc_6bf98deda30b"] ? "TRUE" : "FALSE";
        s = res["s_66923e81_1282_4689_bc32_08d3c020492c"] || "";
      }

      // Format Start / End Date
      const startDate = b.startDate || b.selectedSession?.start?.timestamp || "";
      const endDate = b.endDate || b.selectedSession?.end?.timestamp || "";
      
      const staffMember = b.bookedEntity?.tags?.find(t => t.tag === "STAFF")?.name || b.bookedEntity?.staffMember?.name || b.selectedSession?.staffMemberName || "";
      const internalNotes = b.adminNotes || b.internalNotes || b.notes || "";

      // Construct 22 column array (A to V)
      return [
        startDate, // A
        endDate,   // B
        internalNotes, // C
        staffMember, // D
        serviceName, // E
        b.contactDetails?.firstName || "", // F
        b.contactDetails?.lastName || "",  // G
        h, // H
        formattedPhone, // I
        b.contactDetails?.email || "", // J
        k, // K
        l, // L
        m, // M
        n, // N
        o, // O
        p, // P
        q, // Q
        r, // R
        s, // S
        "n/a", // T
        "n/a", // U
        bookingId // V
      ];
    });

    console.log(`Sending ${mappedRows.length} bookings to Google Sheet...`);

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookings: mappedRows })
    });

    if (response.ok) {
        const jsonResponse = await response.json();
        console.log("Successfully synced to Google Sheets!", jsonResponse);
    } else {
        console.error("Failed to sync to Google Sheets. Status:", response.status);
    }

  } catch (error) {
    console.error("Error running 10 day sync function:", error);
  }
}
