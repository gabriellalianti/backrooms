# Google bridge

This Apps Script is deployed privately by the sales Google account. Its implemented action reads the configured Sheet tab and returns only displayed values from columns A and B, starting at row 2.

The web-app endpoint accepts only signed `catalogue` POST requests. Each request contains a five-minute timestamp, a single-use nonce, and an HMAC-SHA256 signature. Replayed, expired, malformed, or incorrectly signed requests are rejected.

The script deliberately cannot:

- select an arbitrary spreadsheet or Sheet tab from a request;
- read columns C onward;
- return formulas, notes, comments, or formatting;
- fetch arbitrary URLs;
- access Gmail.

The future Gmail importer will be added as a separate, explicitly scoped action after the catalogue integration is verified. Staff Google sign-in remains independent and never grants Backrooms access to a user's Google data.

All deployment configuration belongs in Apps Script Properties. Do not put it in `Code.gs`, the manifest, or Git:

```text
SPREADSHEET_ID
SHEET_GID
BACKROOMS_REQUEST_SECRET
```

See [../docs/local-integrations.md](../docs/local-integrations.md) for setup and testing.
