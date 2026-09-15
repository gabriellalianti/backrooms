var MAX_REQUEST_AGE_SECONDS = 300;

function doPost(event) {
  try {
    var input = JSON.parse(event.postData && event.postData.contents || "{}");
    authorizeRequest_(input);
    if (input.action !== "catalogue") {
      throw new Error("Unsupported bridge action");
    }
    return jsonResponse_({
      ok: true,
      version: 1,
      generatedAt: new Date().toISOString(),
      rows: readCatalogueRows_()
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ ok: false, error: "The catalogue request was rejected." });
  }
}

function authorizeRequest_(input) {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("BACKROOMS_REQUEST_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("BACKROOMS_REQUEST_SECRET is not configured");
  }
  if (input.action !== "catalogue"
      || typeof input.timestamp !== "string"
      || typeof input.nonce !== "string"
      || typeof input.signature !== "string") {
    throw new Error("Invalid request shape");
  }
  if (!/^[0-9]+$/.test(input.timestamp) || !/^[A-Za-z0-9_-]{20,100}$/.test(input.nonce)) {
    throw new Error("Invalid timestamp or nonce");
  }
  var nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(input.timestamp)) > MAX_REQUEST_AGE_SECONDS) {
    throw new Error("Expired request");
  }

  var message = input.action + "\n" + input.timestamp + "\n" + input.nonce;
  var expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8)
  ).replace(/=+$/, "");
  if (!constantTimeEqual_(input.signature, expected)) {
    throw new Error("Invalid request signature");
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var nonceKey = "BRIDGE_NONCE_" + input.nonce;
    if (properties.getProperty(nonceKey)) throw new Error("Replayed request");
    properties.setProperty(nonceKey, input.timestamp);
    var storedProperties = properties.getProperties();
    Object.keys(storedProperties).forEach(function (key) {
      if (key.indexOf("BRIDGE_NONCE_") === 0
          && nowSeconds - Number(storedProperties[key]) > MAX_REQUEST_AGE_SECONDS * 2) {
        properties.deleteProperty(key);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function readCatalogueRows_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  var sheetGidText = properties.getProperty("SHEET_GID");
  if (!spreadsheetId || !sheetGidText || !/^[0-9]+$/.test(sheetGidText)) {
    throw new Error("SPREADSHEET_ID or SHEET_GID is not configured");
  }
  var sheetGid = Number(sheetGidText);

  var spreadsheet = Sheets.Spreadsheets.get(spreadsheetId, {
    fields: "sheets.properties(sheetId,title)"
  });
  var targetSheet = (spreadsheet.sheets || []).filter(function (sheet) {
    return sheet.properties && sheet.properties.sheetId === sheetGid;
  })[0];
  if (!targetSheet) throw new Error("Configured Sheet tab was not found");

  // The Advanced Sheets API supports the read-only OAuth scope. The range is fixed
  // here, so request input can never select columns C onward or another spreadsheet.
  var escapedTitle = "'" + targetSheet.properties.title.replace(/'/g, "''") + "'";
  var response = Sheets.Spreadsheets.Values.get(spreadsheetId, escapedTitle + "!A2:B", {
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE"
  });
  return (response.values || []).map(function (row) {
    return [String(row[0] || ""), String(row[1] || "")];
  });
}

function constantTimeEqual_(left, right) {
  var difference = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
