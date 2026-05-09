import xlsxwriter
import os
import shutil

PACKAGE_DIR = r"c:\Users\timot\.gemini\antigravity\scratch\options-grader\LifeSheets_Deployment_v1.2\LifeSheets_KDP_Package"
BASE_DIR = r"c:\Users\timot\.gemini\antigravity\scratch\options-grader\LifeSheets_Deployment_v1.2"

def create_lifesheet(filename, sheet_name, headers, sample_data):
    filepath = os.path.join(PACKAGE_DIR, filename)
    workbook = xlsxwriter.Workbook(filepath)
    
    # Define Formats
    black_bg = workbook.add_format({
        'bg_color': '#000000',
        'font_color': '#39FF14',
        'font_name': 'Roboto',
        'font_size': 10
    })
    
    header_format = workbook.add_format({
        'bg_color': '#000000',
        'font_color': '#00FFFF',
        'font_name': 'Roboto',
        'font_size': 10,
        'bold': True,
        'border': 1,
        'border_color': '#39FF14'
    })
    
    footer_format = workbook.add_format({
        'bg_color': '#000000',
        'font_color': '#FF00FF',
        'font_name': 'Roboto',
        'font_size': 8,
        'italic': True
    })

    # Main Sheet
    worksheet = workbook.add_worksheet(sheet_name)
    worksheet.set_column('A:Z', 20)
    
    # Fill background
    for r in range(101):
        worksheet.set_row(r, None, black_bg)
    
    # Add Headers
    for col_num, header in enumerate(headers):
        worksheet.write(0, col_num, header, header_format)
        
    # Add Sample Data
    for row_num, row_data in enumerate(sample_data):
        for col_num, cell_data in enumerate(row_data):
            worksheet.write(row_num + 1, col_num, cell_data, black_bg)
            
    # Add Footer at row 100
    worksheet.write(99, 0, "© 2026 Timothy Walton", footer_format)

    # Settings Sheet
    settings = workbook.add_worksheet('Settings')
    settings.set_column('A:B', 25)
    for r in range(50):
        settings.set_row(r, None, black_bg)
        
    settings.write(0, 0, 'SETTING', header_format)
    settings.write(0, 1, 'VALUE', header_format)
    settings.write(1, 0, 'BYOK (API Key)', black_bg)
    settings.write(1, 1, '', black_bg)
    settings.write(2, 0, 'Model', black_bg)
    settings.write(2, 1, 'claude-3-5-sonnet', black_bg)
    settings.write(99, 0, "© 2026 Timothy Walton", footer_format)

    workbook.close()
    print(f"Created {filename}")

modules = [
    ("EF-Architecture.xlsx", "Dashboard", ["Module", "Strategic Purpose", "Status", "Priority", "Action"], [
        ["Spoon Budgeter", "Visual energy/energy management for neurodivergent focus.", "Active", "High", "Manage Spoons"],
        ["Tactical Life OS", "Central daily planning and high-priority execution HUD.", "Standby", "Critical", "Execute P1"],
        ["Decision Solver", "Logic matrix for resolving complex binary or multi-path choices.", "Standby", "Medium", "Solve Logic"],
        ["ADHD SOP Builder", "Recursive task decomposition for overwhelming workflows.", "Active", "High", "Build SOP"],
        ["Cognitive RAM", "Asynchronous brain dump for rapid thought capture.", "Scanning", "Medium", "Dump RAM"],
        ["Habit Tracker", "Gamified habit loops with streak-based XP rewards.", "Active", "Medium", "Track Habits"],
        ["S3 Strain Index", "Biometric and psychological stress/strain monitor.", "Active", "High", "Check S3"],
        ["Whale Stalker", "Options flow and institutional market intelligence.", "Scanning", "Low", "Stalk Whales"],
        ["Sentinel Alerts", "Life-webhook log for critical external triggers.", "Active", "Medium", "View Alerts"],
        ["PRO Terminal", "Locked - Awaiting activation signal.", "LOCKED", "PRO", "UNLOCK"]
    ]),
    ("Spoon-Budgeter.xlsx", "Energy Log", ["Task", "Spoon Cost (1-5)", "Time Est", "Category", "Energy Remaining"], [
        ["Email Triage", 2, "30m", "Admin", 18],
        ["Deep Work Session", 5, "2h", "Creative", 13],
        ["Meeting", 3, "1h", "Social", 10]
    ]),
    ("Decision-Solver.xlsx", "Solver", ["Criteria", "Weight (1-10)", "Option A Score", "Option B Score", "Weighted A", "Weighted B"], [
        ["ROI", 10, 8, 6, 80, 60],
        ["Effort", 5, 2, 9, 10, 45],
        ["Fun", 3, 9, 4, 27, 12]
    ]),
    ("ADHD-SOP-Builder.xlsx", "Steps", ["Level", "Step Name", "Instruction", "Checklist", "AI Breakdown"], [
        ["1", "Start Coffee", "Go to kitchen", "[ ]", "Breakdown pending..."],
        ["2", "Grind Beans", "Use setting 4", "[ ]", ""],
        ["2", "Pour Water", "Up to line", "[ ]", ""]
    ]),
    ("Cognitive-RAM.xlsx", "Inbox", ["Entry", "Timestamp", "AI Category", "Status"], [
        ["Buy milk", "17:30", "Errand", "Pending"],
        ["Fix bug in OAuth", "17:35", "Work", "Urgent"],
        ["Call Mom", "18:00", "Personal", "Pending"]
    ]),
    ("Beastmode-Habit-Tracker.xlsx", "Habits", ["Habit", "Goal", "Frequency", "Current Streak", "Total XP"], [
        ["Morning Ritual", "Done", "Daily", 14, 1400],
        ["No Sugar", "Done", "Daily", 5, 500],
        ["Cold Plunge", "Fail", "Daily", 0, 120]
    ]),
    ("S3-Strain-Index.xlsx", "Daily Log", ["Date", "Sleep (0-10)", "Stress (0-10)", "Strain (0-10)", "Notes"], [
        ["2026-05-01", 8, 2, 4, "Good recovery"],
        ["2026-05-02", 4, 8, 9, "High stress day"],
        ["2026-05-03", 7, 5, 6, "Balanced"]
    ]),
    ("Tactical-Life-OS.xlsx", "Central HUD", ["Time", "Task", "Focus Level", "Status"], [
        ["08:00", "Review Architecture", "High", "DONE"],
        ["09:30", "Client Call", "Medium", "NEXT"],
        ["11:00", "SOP Generation", "High", "PENDING"]
    ]),
    ("Whale-Stalker-Lite.xlsx", "Market Flow", ["Ticker", "Type", "Strike", "Exp", "Premium", "Sentiment"], [
        ["SPY", "CALL", 520, "2026-06", "$1.2M", "Bullish"],
        ["TSLA", "PUT", 150, "2026-05", "$500k", "Bearish"],
        ["AAPL", "CALL", 190, "2026-07", "$2.1M", "Bullish"]
    ]),
    ("Sentinel-Alerts.xlsx", "Alert Log", ["Source", "Message", "Urgency", "Action Taken"], [
        ["Server", "Latency spike detected", "High", "Investigated"],
        ["Calendar", "Project Deadline", "Critical", "In Progress"],
        ["Email", "New Client Inquiry", "Medium", "Replied"]
    ])
]

def package_deployment():
    if not os.path.exists(PACKAGE_DIR):
        os.makedirs(PACKAGE_DIR)
        
    print(f"Packaging deployment to {PACKAGE_DIR}...")
    
    # 1. Generate Sheets
    for filename, sheet_name, headers, data in modules:
        create_lifesheet(filename, sheet_name, headers, data)
        
    # 2. Copy Manuscript
    manuscript_src = os.path.join(BASE_DIR, "Beastmode_Manuscript.md")
    if os.path.exists(manuscript_src):
        shutil.copy(manuscript_src, os.path.join(PACKAGE_DIR, "Beastmode_Manuscript.md"))
        print("Copied Beastmode_Manuscript.md")
        
    # 3. Copy Metadata
    metadata_src = os.path.join(BASE_DIR, "GooglePlayBooks_Metadata.csv")
    if os.path.exists(metadata_src):
        shutil.copy(metadata_src, os.path.join(PACKAGE_DIR, "GooglePlayBooks_Metadata.csv"))
        print("Copied GooglePlayBooks_Metadata.csv")
        
    print("Packaging Complete! 🚀")

if __name__ == "__main__":
    package_deployment()

