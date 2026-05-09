# LifeSheets v1.2 [Beastmode] - Deployment Instructions

Follow these steps to deploy your Tactical Executive Function suite.

## 1. Import Modules
1. Download the 10 `.xlsx` files generated in this directory.
2. Open [Google Sheets](https://sheets.google.com).
3. For each module (e.g., `EF-Architecture.xlsx`):
   - Go to **File > Import**.
   - Upload the `.xlsx` file.
   - Select **Replace spreadsheet** or **Insert new sheet(s)**.
   - Click **Import data**.

## 2. Install the AI Engine
1. In each imported Google Sheet:
   - Go to **Extensions > Apps Script**.
   - Delete any existing code.
   - Copy the contents of `BYOK_Engine.gs` and paste them into the script editor.
   - Rename the project to `LifeSheets_Engine`.
   - Click the **Disk icon (Save)**.
   - Close the script editor and refresh your Google Sheet.

## 3. Configure API Keys
1. Go to the **Settings** tab in your sheet.
2. In cell **B2**, paste your **Anthropic API Key** (or your preferred AI key if you modified the script).
3. The script is pre-configured for Claude 3.5 Sonnet.

## 4. Activate Beastmode
1. You will see a new menu item: **🚀 LIFESHEETS**.
2. Select **UNLOCK BEASTMODE** to begin the activation protocol.
3. Use **Analyze Current Sheet** to trigger AI-driven tactical insights based on your data.

## UI Styling Note
The `.xlsx` files are pre-formatted with:
- **Background**: Jet Black (#000000)
- **Text**: Neon Green (#39FF14)
- **Headers**: Aqua (#00FFFF)
- **Footer**: Fuchsia (#FF00FF)

If formatting is lost during import, run the `applyBeastmodeStyling()` function from the Apps Script editor.

5. Master the System
Read the [LifeSheets_Master_Guide.md](file:///c:/Users/timot/.gemini/antigravity/scratch/options-grader/LifeSheets_Deployment_v1.2/LifeSheets_Master_Guide.md) for a deep dive into the philosophy and tactical use of each module. This guide is structured for potential KDP publication.

---
© 2026 Timothy Walton. All Rights Reserved.
