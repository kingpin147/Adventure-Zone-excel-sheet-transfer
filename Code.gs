function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const bookings = payload.bookings || [];
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
    
    // Get all existing data
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    let data = [];
    if (lastRow > 1) {
      // Assuming row 1 is header
      data = sheet.getRange(2, 1, lastRow - 1, 22).getValues(); 
    }
    
    // Map existing Booking IDs to row numbers (Column V is index 21)
    const bookingIdMap = {}; // { "booking-id": rowNumber }
    for (let i = 0; i < data.length; i++) {
      const id = data[i][21]; // V
      if (id) {
        bookingIdMap[id] = i + 2; // +1 for header, +1 for 0-index
      }
    }
    
    // Process incoming bookings
    for (let i = 0; i < bookings.length; i++) {
      const bRow = bookings[i];
      const incomingId = bRow[21];
      
      if (bookingIdMap[incomingId]) {
        // UPDATE EXISTING ROW
        const rowNum = bookingIdMap[incomingId];
        const existingRow = sheet.getRange(rowNum, 1, 1, 22).getValues()[0];
        
        // Protect Manual Notes in Column C (index 2)
        // If Wix notes (bRow[2]) is empty, keep existing sheet note
        if (!bRow[2] || bRow[2].toString().trim() === "") {
          bRow[2] = existingRow[2]; 
        }
        
        sheet.getRange(rowNum, 1, 1, 22).setValues([bRow]);
        
      } else {
        // APPEND NEW ROW
        sheet.appendRow(bRow);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", parsedCount: bookings.length })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
