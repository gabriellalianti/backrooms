# Test real catalogue data locally

This workflow keeps the Backrooms login in fixture mode while importing the real Sheet catalogue and public storefront metadata into the local D1 database. It does not deploy Backrooms, configure Google login, or access Gmail.

## 1. Generate the bridge secret

Generate a random secret locally:

```bash
openssl rand -hex 32
```

Keep the result temporarily. The same value goes into Apps Script Properties and the ignored `.dev.vars` file. Never put it in `Code.gs`, a screenshot, chat, or Git.

## 2. Create the Apps Script bridge

While signed into the sales Google account:

1. Open [script.google.com](https://script.google.com/) and create a new project named `Backrooms catalogue bridge`.
2. Replace `Code.gs` with the contents of this repository's `apps-script/Code.gs`.
3. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**. Replace that file with `apps-script/appsscript.json`. Its Advanced Sheets service lets the bridge use read-only spreadsheet permission.
4. Under **Project Settings → Script Properties**, add:

   | Property | Value |
   | --- | --- |
   | `SPREADSHEET_ID` | The identifier between `/d/` and `/edit` in the Sheet URL |
   | `SHEET_GID` | The numeric `gid` of the second Sheet tab |
   | `BACKROOMS_REQUEST_SECRET` | The random secret from step 1 |

5. Click **Deploy → New deployment → Web app**.
6. Set **Execute as** to **Me**. Set access to **Anyone** so the local Worker can make a server-to-server request. The HMAC signature is the endpoint's authentication layer.
7. Authorize the requested read-only Google Sheets permission and finish the deployment.
8. Copy the deployment URL ending in `/exec`. Do not copy the `/dev` test URL.

After changing `Code.gs` or `appsscript.json` later, update the live web app via **Deploy → Manage deployments → Edit → New version → Deploy**. Saving the project alone does not update an existing `/exec` deployment.

If the Google account does not offer the **Anyone** access option, its Workspace policy blocks this bridge model. Stop there rather than making the Sheet public.

## 3. Configure local Backrooms

Create `.dev.vars` from `.dev.vars.example` if it does not already exist. Keep fixture authentication and add the deployment URL and matching secret:

```text
APP_MODE=fixture
FIXTURE_USER_EMAIL=director@backrooms.local
GOOGLE_BRIDGE_URL=https://script.google.com/macros/s/your-deployment-id/exec
GOOGLE_BRIDGE_REQUEST_SECRET=your-random-secret
```

`.dev.vars` is ignored by Git. Do not send its contents to anyone.

Apply the latest local migration and restart the development server:

```bash
npm run db:migrate:local
npm run dev
```

## 4. Import and verify

Open **Admin** and select **Sync Sheet**. A successful import reports how many products were read and changed. It deactivates catalogue products missing from the latest snapshot but preserves cached metadata for products that still exist.

Then select **Refresh storefront listings**. Backrooms works through the catalogue in batches of eight so one request never fetches all product pages at once. For every listing it:

- derives a URL from the Sheet product name;
- allows only HTTPS pages on `store.createunsw.com.au`;
- confirms that the returned page is a product page and its title matches;
- extracts the current or sale price and the square main-product image;
- preserves previous metadata as `last known` if a later refresh fails.

Review the catalogue for product count, names, locker locations, images, prices, and unavailable listings. Columns C onward, notes, comments, formulas, and formatting are never returned by the bridge.

To restore the known fixture records at any point, run:

```bash
npm run db:seed:local
```

The seed restores the fixture records but does not delete newly imported products. Running **Sync Sheet** again restores the Sheet snapshot as the active catalogue.
