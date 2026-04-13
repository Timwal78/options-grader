# ⚖️ REPOSITORY CONSTITUTION - THE "REAL DATA" LAW

**Effective Date:** 2026-04-13
**Subject:** Options-Grader Institutional Data Integrity and Algorithmic Law.

This repository is governed by the **ScriptMasterLabs Master Integrity Law**. All future agents and developers are strictly bound by the following rules.

---

### LAW 1: NO SIMULATED DATA
No placeholders, "F" grades for unknown symbols, or faked "A+" setups.
- **Rule 1.1**: If Schwab or Yahoo data is missing, the grader MUST respond with an error or "Awaiting Data." NEVER invent contract prices or IVs.

### LAW 2: PARAMETERIZED GRADING FACTORS
All factor weights (Greeks, Risk/Reward, Liquidity, etc.) and grade thresholds MUST reside in `.env`.
- **Rule 2.1**: No magic multipliers (e.g. `const ratio >= 1.5 ? score += 8`) hidden inside `grader.cjs`. Every coefficient must be an auditable parameter.

### LAW 3: TRANSPARENT CALCULATIONS
- **Rule 3.1**: Probability of Profit (POP) and IV Percentile must be derived from the current chain context. If the context is insufficient, mark as "N/A" rather than faking a value.

### LAW 4: INSTITUTIONAL CADENCE
Maintain the Discovery Engine refresh rate (default 60s) to ensure data relevance without excessive API polling.

---
**REFERENCE:** `server/services/grader.cjs`
