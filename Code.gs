function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const bookings = payload.bookings || [];

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
    
    // Force Columns A and B to be Plain Text to prevent auto-formatting of dates
    sheet.getRange("A:B").setNumberFormat("@");

    // 1. Run Cleanup (Remove past bookings)
    cleanupAndSortBookings();

    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 22);
    
    // Read all existing data into memory
    let fullData = [];
    if (lastRow > 1) {
      fullData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    }

    // Build ID map for fast lookup
    const bookingIdMap = {};
    for (let i = 0; i < fullData.length; i++) {
      const id = fullData[i][21]; // Column V (index 21)
      if (id) {
        bookingIdMap[id] = i;
      }
    }

    // 2. Process Incoming Bookings in memory
    bookings.forEach(bRow => {
      const incomingId = bRow[21];
      
      if (bookingIdMap[incomingId] !== undefined) {
        // UPDATE EXISTING ROW
        const index = bookingIdMap[incomingId];
        const existingRow = fullData[index];

        // Preserve Manual Notes in Column C (index 2)
        if (!bRow[2] || bRow[2].toString().trim() === "") {
          bRow[2] = existingRow[2];
        }

        // Replace existing row with incoming bRow to remove any old leftover columns
        fullData[index] = [...bRow];
      } else {
        // ADD NEW ROW
        fullData.push(bRow);
      }
    });

    // 3. Final Sort by Date (Column A)
    fullData.sort((a, b) => {
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      return dateA - dateB;
    });

    // 4. Batch Write back to the sheet
    if (fullData.length > 0) {
      // Find the maximum column width needed
      const maxCols = fullData.reduce((max, row) => Math.max(max, row.length), 0);
      
      // Pad all rows to match max width (required for setValues)
      const paddedData = fullData.map(row => {
        const newRow = [...row];
        while (newRow.length < maxCols) newRow.push("");
        return newRow;
      });

      // Clear the old data range (including any old extra columns) and write the new batch
      const currentLastRow = sheet.getLastRow();
      const currentLastCol = sheet.getLastColumn();
      if (currentLastRow > 1 && currentLastCol > 0) {
        sheet.getRange(2, 1, currentLastRow - 1, currentLastCol).clearContent();
      }
      sheet.getRange(2, 1, paddedData.length, maxCols).setValues(paddedData);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", count: bookings.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function cleanupAndSortBookings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return;

  const vancouverTodayStr = Utilities.formatDate(new Date(), "America/Vancouver", "yyyy-MM-dd");
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
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
}
