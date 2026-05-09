/**
 * LifeSheets Universal AI Engine v1.2 [Beastmode]
 * Proprietary SOP Architecture by Timothy Walton
 * 
 * INSTRUCTIONS:
 * 1. Open your Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code and save.
 * 4. Enter your API Key in the 'Settings' tab.
 */

const SYSTEM_ROLE = "ACT AS: LifeSheets SOP Specialist. Objective: Provide tactical, high-leverage executive function support. Format: Concise, actionable, 'Beastmode' intensity.";

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 LIFESHEETS')
      .addItem('Analyze Current Sheet', 'runModuleAnalysis')
      .addItem('Apply Beastmode Styling', 'applyBeastmodeStyling')
      .addSeparator()
      .addItem('UNLOCK BEASTMODE', 'unlockBeastmode')
      .addToUi();
}

/**
 * Main function to route analysis based on sheet name
 */
function runModuleAnalysis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const sheetName = sheet.getName();
  const settings = ss.getSheetByName('Settings');
  
  if (!settings) {
    SpreadsheetApp.getUi().alert('ERROR: Settings tab missing.');
    return;
  }
  
  const apiKey = settings.getRange('B2').getValue();
  if (!apiKey) {
    SpreadsheetApp.getUi().alert('ERROR: API Key missing in Settings tab (Cell B2).');
    return;
  }

  const dataRange = sheet.getDataRange();
  const data = dataRange.getValues();
  const headers = data[0];
  const lastRowData = data[sheet.getLastRow() - 1];

  let prompt = "";
  
  // Module-Specific Prompt Logic
  switch(sheetName) {
    case 'Dashboard':
      prompt = `Analyze this LifeSheets Dashboard: ${JSON.stringify(data)}. Identify the highest priority module that needs attention and suggest one 'Beastmode' action.`;
      break;
    case 'Energy Log':
      prompt = `Based on my current Spoon Budget: ${JSON.stringify(lastRowData)}. I have ${lastRowData[4]} energy left. Suggest a recovery activity or a low-energy task from my list.`;
      break;
    case 'Solver':
      prompt = `Evaluate this decision matrix: ${JSON.stringify(data)}. Which option is mathematically superior based on the weights? Provide a 1-sentence justification.`;
      break;
    case 'Steps':
      prompt = `Take this task: "${lastRowData[1]}" and break it down into recursive sub-steps using ADHD-friendly logic.`;
      break;
    case 'Inbox':
      prompt = `Categorize this brain dump entry: "${lastRowData[0]}". Suggest a priority level and a folder.`;
      break;
    case 'Habits':
      prompt = `Review my habit streak for "${lastRowData[0]}". Give me a high-intensity motivation boost to keep the streak alive.`;
      break;
    case 'Daily Log':
      prompt = `Analyze my S3 (Sleep/Stress/Strain) index: ${JSON.stringify(lastRowData)}. Is there a correlation? Should I push or pull back today?`;
      break;
    case 'Market Flow':
      prompt = `Analyze this market flow data: ${JSON.stringify(lastRowData)}. Is this 'Smart Money' or a trap? Give a sentiment score (0-100).`;
      break;
    default:
      prompt = `Analyze this tactical data and provide a Beastmode optimization: ${JSON.stringify(lastRowData)}`;
  }

  const response = callAI(apiKey, prompt);
  SpreadsheetApp.getUi().alert('BEASTMODE ANALYSIS:\n\n' + response);
}

/**
 * Universal AI Caller (Supports Claude-style API)
 */
function callAI(apiKey, prompt) {
  const url = "https://api.anthropic.com/v1/messages"; // Default to Claude
  
  const payload = {
    "model": "claude-3-5-sonnet-20240620",
    "max_tokens": 1024,
    "system": SYSTEM_ROLE,
    "messages": [
      {"role": "user", "content": prompt}
    ]
  };

  const options = {
    "method": "post",
    "headers": {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    if (json.content && json.content[0]) {
      return json.content[0].text;
    } else {
      return "Error: " + response.getContentText();
    }
  } catch (e) {
    return "Connection Error: " + e.toString();
  }
}

/**
 * Viral Trigger & Pro Unlock
 */
function unlockBeastmode() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const message = "TO UNLOCK PRO FEATURES:\n1. Copy the text below.\n2. Post it on X or Reddit.\n3. Return here and click 'I SHARED'.\n\nTEXT: 'Just deployed LifeSheets v1.2 [Beastmode]. My executive function is now Full Shield. 🚀 #LifeSheets #ADHD #Beastmode'";
  
  const response = ui.alert('ACTIVATE PRO PROTOCOL', message, ui.ButtonSet.OK_CANCEL);
  
  if (response == ui.Button.OK) {
    let proSheet = ss.getSheetByName('Pro');
    if (!proSheet) {
      proSheet = ss.insertSheet('Pro');
      proSheet.getRange("A1").setValue("PRO TERMINAL ACTIVATED").setFontWeight("bold").setFontSize(14);
      proSheet.getRange("A2").setValue("Advanced SOP logic and Market Intelligence enabled.");
      applyBeastmodeStyling(); // Re-style to include the new sheet
    }
    ui.alert('PRO STATUS: ACTIVATED\n\nThe hidden "Pro" tab has been revealed.');
  }
}

/**
 * Apply Beastmode Styling to ALL sheets (Helper)
 */
function applyBeastmodeStyling() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  sheets.forEach(sheet => {
    // Jet Black Background and Neon Green Text
    sheet.getRange("A1:Z100").setBackground("#000000").setFontColor("#39FF14").setFontFamily("Roboto").setFontSize(10);
    
    // Aqua Headers
    sheet.getRange("A1:Z1").setBackground("#000000").setFontColor("#00FFFF").setFontWeight("bold");
    
    // Fuchsia Footer at Row 100
    sheet.getRange("A100:Z100").setBackground("#000000").setFontColor("#FF00FF").setFontStyle("italic").setFontSize(8);
    sheet.getRange("A100").setValue("© 2026 Timothy Walton");
  });
  
  SpreadsheetApp.getUi().alert('BEASTMODE STYLING APPLIED TO ALL SHEETS.');
}