function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const bookings = payload.bookings || [];

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Ensures it targets Sheet1
    const sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];

    // Get all existing data (Columns A to V are 22 columns)
    const lastRow = sheet.getLastRow();
    let data = [];
    if (lastRow > 1) {
      data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
    }

    // Map existing Booking IDs to row numbers (Column V is index 21)
    const bookingIdMap = {};
    for (let i = 0; i < data.length; i++) {
      const id = data[i][21]; // Column V
      if (id) {
        bookingIdMap[id] = i + 2;
      }
    }

    // Process incoming bookings — update existing rows or append new ones
    for (let i = 0; i < bookings.length; i++) {
      const bRow = bookings[i];
      
      // Convert date strings to real Date objects so Sheets can sort/format them correctly
      if (bRow[0]) bRow[0] = new Date(bRow[0]);
      if (bRow[1]) bRow[1] = new Date(bRow[1]);

      const incomingId = bRow[21];

      if (bookingIdMap[incomingId]) {
        // UPDATE EXISTING ROW in A-V
        const rowNum = bookingIdMap[incomingId];
        const existingRow = sheet.getRange(rowNum, 1, 1, 22).getValues()[0];

        // Protect Manual Notes in Column C (index 2)
        if (!bRow[2] || bRow[2].toString().trim() === "") {
          bRow[2] = existingRow[2];
        }

        sheet.getRange(rowNum, 1, 1, 22).setValues([bRow]);

      } else {
        // APPEND NEW ROW to the bottom of A-V
        sheet.appendRow(bRow);
      }
    }

    // Cleanup and Sort after syncing
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
 * Then sorts all data (A2:V) by Column A ascending.
 */
function cleanupAndSortBookings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return; // No data to process

  // 1. CLEAR PAST BOOKINGS
  // Determine "today" in Vancouver time (yyyy-MM-dd)
  const vancouverTodayStr = Utilities.formatDate(new Date(), "America/Vancouver", "yyyy-MM-dd");
  const vancouverToday = new Date(vancouverTodayStr + "T00:00:00"); 

  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues(); // Get Column A only
  
  // Iterate backwards when deleting rows to keep indices correct
  for (let i = data.length - 1; i >= 0; i--) {
    let rowVal = data[i][0];
    if (!rowVal) continue;

    let rowDate;
    if (rowVal instanceof Date) {
      rowDate = rowVal;
    } else {
      rowDate = new Date(rowVal);
    }

    if (!isNaN(rowDate.getTime())) {
      // Compare the date part only
      const rowDateStr = Utilities.formatDate(rowDate, "America/Vancouver", "yyyy-MM-dd");
      if (rowDateStr < vancouverTodayStr) {
        sheet.deleteRow(i + 2); // +2 because index i starts at 0 for row 2
      }
    }
  }

  // 2. SORT REMAINING DATA
  const newLastRow = sheet.getLastRow();
  if (newLastRow > 1) {
    const sortRange = sheet.getRange(2, 1, newLastRow - 1, 22); // Columns A to V
    sortRange.sort({column: 1, ascending: true});
  }
}
