function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const bookings = payload.bookings || [];

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Ensures it targets Sheet1
    const sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];

    // 1. RUN CLEANUP FIRST (Remove past bookings)
    cleanupAndSortBookings();

    const lastRow = sheet.getLastRow();
    
    // Build ID map from Column V (index 21)
    const bookingIdMap = {};
    if (lastRow > 1) {
      // Always read at least 22 columns to be safe for the ID column
      const readCols = Math.max(sheet.getLastColumn(), 22);
      const data = sheet.getRange(2, 1, lastRow - 1, readCols).getValues();
      for (let i = 0; i < data.length; i++) {
        const id = data[i][21]; // Column V (index 21) is our primary key
        if (id) {
          bookingIdMap[id] = i + 2;
        }
      }
    }

    // 2. PROCESS INCOMING BOOKINGS
    for (let i = 0; i < bookings.length; i++) {
      const bRow = bookings[i];
      
      // Convert date strings to real Date objects so Sheets can sort/format them correctly
      if (bRow[0]) bRow[0] = new Date(bRow[0].toString());
      if (bRow[1]) bRow[1] = new Date(bRow[1].toString());

      const incomingId = bRow[21];
      const incomingCols = bRow.length;

      if (bookingIdMap[incomingId]) {
        // UPDATE EXISTING ROW
        const rowNum = bookingIdMap[incomingId];
        const currentRowCols = sheet.getLastColumn();
        const targetCols = Math.max(currentRowCols, incomingCols);

        // Ensure sheet is wide enough for the target range
        const currentSheetMax = sheet.getMaxColumns();
        if (targetCols > currentSheetMax) {
          sheet.insertColumnsAfter(currentSheetMax, targetCols - currentSheetMax);
        }

        // Fetch existing row to preserve columns not provided or manually edited
        const existingRow = sheet.getRange(rowNum, 1, 1, targetCols).getValues()[0];

        // 1. Protect Manual Notes in Column C (index 2)
        if (!bRow[2] || bRow[2].toString().trim() === "") {
          bRow[2] = existingRow[2];
        }

        // 2. Expand bRow if existing row has more columns
        for (let j = 0; j < targetCols; j++) {
            if (bRow[j] === undefined) {
                bRow[j] = existingRow[j] || "";
            }
        }

        sheet.getRange(rowNum, 1, 1, bRow.length).setValues([bRow]);

      } else {
        // APPEND NEW ROW
        sheet.appendRow(bRow);
      }
    }

    // Final Sort and Cleanup
    cleanupAndSortBookings();

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", parsedCount: bookings.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Removes rows where the date in Column A is before today.
 * Then sorts all data by Column A ascending.
 */
function cleanupAndSortBookings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return; // No data to process

  // Determine "today" in Vancouver time
  const vancouverTodayStr = Utilities.formatDate(new Date(), "America/Vancouver", "yyyy-MM-dd");

  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues(); // Get Column A only
  
  // Iterate backwards when deleting rows to keep indices correct
  for (let i = data.length - 1; i >= 0; i--) {
    let rowVal = data[i][0];
    if (!rowVal) continue;

    let rowDate = (rowVal instanceof Date) ? rowVal : new Date(rowVal.toString());

    if (!isNaN(rowDate.getTime())) {
      const rowDateStr = Utilities.formatDate(rowDate, "America/Vancouver", "yyyy-MM-dd");
      if (rowDateStr < vancouverTodayStr) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  // SORT REMAINING DATA
  const newLastRow = sheet.getLastRow();
  if (newLastRow > 1) {
    const sortRange = sheet.getRange(2, 1, newLastRow - 1, sheet.getLastColumn());
    sortRange.sort({column: 1, ascending: true});
  }
}
