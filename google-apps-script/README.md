# PATEL SAHAB SPICES - GOOGLE SHEETS & APPS SCRIPT SETUP GUIDE

This guide walks you through connecting your Google Sheets with the **Patel Sahab Spices Production & Inventory Management System**.

---

## 1. Create the Google Spreadsheet
1. Go to [Google Sheets](https://sheets.new) in your web browser.
2. Name the spreadsheet: `PATEL SAHAB SPICES - PRODUCTION & INVENTORY`.
3. You can leave the sheet blank — the Apps Script will automatically create and format the 4 required tabs with dark-red headers on its first run:
   - `RAW_MATERIAL`
   - `PROCESSING`
   - `PACKAGING`
   - `ORDER_SALE`

---

## 2. Create the Google Apps Script Project
1. In your newly created Google Spreadsheet, click on the top menu: **Extensions** > **Apps Script**.
2. Rename the project at the top left from *Untitled project* to `Patel Spices Inventory API`.
3. In the code editor, delete any existing default code inside `Code.gs`.
4. Copy the entire contents of `google-apps-script/Code.gs` and paste it into the editor.
5. Click the **Save** icon (disk icon) or press `Ctrl + S`.

---

## 3. Deploy the Apps Script as a Web App
1. At the top right of the Apps Script window, click the blue **Deploy** button > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the deployment configuration:
   - **Description**: `Patel Sahab Spices Inventory API v1`
   - **Execute as**: `Me (your-email@gmail.com)`
   - **Who has access**: `Anyone` *(Crucial: This enables your mobile app to securely send inventory records without requiring individual Google logins on factory devices).*
4. Click **Deploy**.
5. When prompted for authorization:
   - Click **Authorize access**.
   - Select your Google account.
   - Click **Advanced** > **Go to Patel Spices Inventory API (unsafe)**.
   - Click **Allow**.
6. Google will provide you with a **Web app URL** (e.g. `https://script.google.com/macros/s/AKfycb.../exec`).
7. **Copy this Web App URL**.

---

## 4. Connect with the Patel Sahab Spices Application
1. Open the Patel Sahab Spices App on your device/browser.
2. Click the **Admin Panel** button in the dashboard or navigation bar.
3. Enter the Admin PIN (Default: `1234`).
4. Go to **Google Sheets Sync** settings tab.
5. Paste your copied **Web App URL** into the "Google Apps Script Web App URL" input field.
6. Click **Save Settings**.

---

## 5. Test the Connection
1. In the Admin Panel under **Google Sheets Sync**, click **Test Connection (Ping)**.
2. The application will immediately contact the Web App. You will see a green success alert confirming:
   `"Connection verified with Google Sheets: PATEL SAHAB SPICES - PRODUCTION & INVENTORY"`.
3. Check your Google Spreadsheet — the 4 tabs (`RAW_MATERIAL`, `PROCESSING`, `PACKAGING`, `ORDER_SALE`) will now appear with styled headers!

---

## 6. Testing the First Real Upload
1. Create a demo entry in **Raw Material Inward** (e.g., Haldi, 1000 KG, Batch HAL-001).
2. Look at the top navigation bar:
   - If online, the app uploads the entry automatically.
   - If offline, the pending counter will increment. Once online or upon clicking **Sync Now**, the pending records will upload.
3. Open your Google Spreadsheet under the `RAW_MATERIAL` tab and verify that the row with `HAL-001`, `1000 KG`, timestamp, and employee name has appeared!
