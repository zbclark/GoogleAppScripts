# Documentation Audit: Overlap & Consolidation Opportunities

## File Inventory

| File | Type | Size | Purpose |
|------|------|------|---------|
| README.md | Root | 133 lines | Repo setup, clasp workflows, pulling/pushing scripts |
| PHASE_1_SETUP_GUIDE.md | Root | 150 lines | How to classify tournaments & run template generation (OLD) |
| TOURNAMENT_ANALYSIS_GUIDE.md | Root | 212 lines | Post-tournament validation framework (OUTDATED) |
| TOURNAMENT_RESULTS_VALIDATION.md | Root | 181 lines | How validation integrates with tournament results (OBSOLETE) |
| VALIDATION_SETUP.md | Root | 215 lines | Algorithm validation module setup (OBSOLETE) |
| WEIGHT_VALIDATION_APPROACH.md | Root | 100 lines | Plan for testing scoring/management weights (PLANNING) |
| VALIDATION_FRAMEWORK.md | Root | 371 lines | **NEW** 6-phase complete validation framework |
| IMPROVEMENT_CHECKLIST.md | Golf_Algo_Validation | 199 lines | Manual diagnostic checklist (OPERATIONAL) |
| MODEL_IMPROVEMENT_GUIDE.md | Golf_Algo_Validation | 307 lines | Strategic improvement workflow (OPERATIONAL) |

**Total: 1,868 lines across 9 files**

---

## Major Findings

### 1. OBSOLETE FILES (Can Be Deleted)

#### ❌ TOURNAMENT_RESULTS_VALIDATION.md
**Status:** OBSOLETE
**Why:** Describes automatic validation integration added to `tournamentResults.js`, but:
- Refers to code structure that may have changed
- Describes functionality that's now part of broader validation system
- No longer referenced in current workflows
- Content superseded by VALIDATION_FRAMEWORK.md Phase 1

**Recommendation:** DELETE - Not needed for current work

---

#### ❌ TOURNAMENT_ANALYSIS_GUIDE.md
**Status:** OUTDATED
**Why:** 
- Describes `tournamentAnalysis.js` and old menu structure ("‼️ Model Tools")
- References functions that may not match current implementation
- Describes individual tournament validation (now deprecated)
- Overlaps with VALIDATION_FRAMEWORK.md Phase 2 objectives

**Content Worth Preserving:**
- Example output format (tables showing correlation, RMSE, accuracy)
- Concept of tournament-by-tournament breakdown

**Recommendation:** DELETE - Replace with VALIDATION_FRAMEWORK.md Phase 2 section

---

#### ⚠️ VALIDATION_SETUP.md
**Status:** SEMI-OBSOLETE
**Why:**
- Describes `algorithmValidation.js` setup, but this is old validation framework
- Functions listed (`validatePredictions()`, `compareAlgorithmVersions()`) may exist but aren't active workflow
- Configuration Sheet references (rows 48-55) outdated
- Manual validation approach superseded by automated metric correlation analysis

**Content Worth Preserving:**
- Understanding of correlation/RMSE/MAE metrics
- Structure of validation results storage

**Recommendation:** DELETE - These functions are now part of Golf_Algo_Validation automated analysis

---

### 2. OUTDATED FILES (Needs Update or Consolidation)

#### ⚠️ PHASE_1_SETUP_GUIDE.md
**Status:** PARTIALLY OUTDATED
**Why:**
- Describes old template generation approach (classifying tournaments manually, generating weights)
- References rows 30-50 for storing results (probably outdated)
- Two-phase approach (classify, then generate) vs current automated approach
- Still has useful classification concepts

**Content Worth Preserving:**
- Course type definitions (POWER, TECHNICAL, BALANCED)
- How to manually classify tournaments (G10 cell)

**Recommendation:** CONSOLIDATE
- Extract course type definitions → Keep in main VALIDATION_FRAMEWORK.md glossary
- Manual classification can be reference docs
- Focus on: current automated courseTypeClassification.gs function, not manual generation

---

#### ⚠️ WEIGHT_VALIDATION_APPROACH.md
**Status:** PARTIALLY INTEGRATED
**Why:**
- Planning document for "Option 3" weight validation
- Now integrated into VALIDATION_FRAMEWORK.md as planned future feature
- Serves as planning document only, not operational

**Content Status:**
- Problem statement: ✅ Valid (scoring weights orphaned)
- Solution approach: ✅ Valid (needs Phase 2 testing first)
- Implementation details: ⏳ Future work

**Recommendation:** KEEP AS PLANNING REFERENCE
- Archive or reference from VALIDATION_FRAMEWORK.md Phase 2
- Not needed for day-to-day work, but valuable for future implementation

---

### 3. OPERATIONAL GUIDES (Keep, May Reorganize)

#### ✅ IMPROVEMENT_CHECKLIST.md
**Status:** OPERATIONAL - Still useful
**Content:**
- Pre-analysis checklist
- Phase-by-phase analysis steps
- Diagnostic questions
- Common improvement patterns

**Issue:** Refers to old functions (`analyzePostTournamentCalibration()`, `analyzeMetricCorrelations()`)
- These functions exist and are used in current Golf_Algo_Validation

**Recommendation:** KEEP but cross-reference
- Add note: "See VALIDATION_FRAMEWORK.md for Phase 1-2 context"
- This is tactical/checklist version
- MODEL_IMPROVEMENT_GUIDE.md is strategic version

---

#### ✅ MODEL_IMPROVEMENT_GUIDE.md
**Status:** OPERATIONAL - Still useful
**Content:**
- 4-Phase strategic framework (UNDERSTAND → IDENTIFY → CLASSIFY → VALIDATE)
- Detailed diagnostic questions
- Weekly/monthly workflows
- Example analysis walkthrough

**How it Relates to VALIDATION_FRAMEWORK.md:**
- This is WORKFLOW-focused (how to use analysis results)
- VALIDATION_FRAMEWORK.md is TECHNICAL-focused (what functions to build)
- Both are complementary

**Recommendation:** KEEP but clarify relationship
- Add preface: "This describes HOW TO USE the analysis from VALIDATION_FRAMEWORK.md"
- Cross-reference phases: "This aligns with VALIDATION_FRAMEWORK.md Phases 1-3"

---

#### ✅ README.md
**Status:** ESSENTIAL - Keep unchanged
**Content:**
- Repo setup (clasp authentication)
- How to pull scripts locally
- How to push changes back to production
- Development workflow

**Recommendation:** KEEP - No changes needed

---

### 4. NEW/MASTER DOCUMENTS

#### ✅ VALIDATION_FRAMEWORK.md
**Status:** COMPREHENSIVE MASTER DOCUMENT
**Content:**
- Complete 6-phase validation system
- Functions to build for each phase
- Expected outputs and sheets
- Data flow diagrams
- Success criteria per phase
- Implementation roadmap

**Covers:**
- Phase 1 ✅ (current analysis - done)
- Phase 2 🎯 (accuracy testing - next)
- Phases 3-6 (future: sensitivity, iteration, optimization, documentation)

**Recommendation:** This is the NEW MASTER DOCUMENT
- Central reference for all validation work
- All tactical documents should cross-reference this
- Should be your "source of truth"

---

## Consolidation Plan

### Recommended Structure

```
Root Level Documentation (Purpose: Orientation & Setup)
├── README.md (setup, dev workflow) ✅ KEEP
├── VALIDATION_FRAMEWORK.md (complete validation system) ✅ KEEP - MASTER DOC
└── [DELETE: TOURNAMENT_RESULTS_VALIDATION.md, TOURNAMENT_ANALYSIS_GUIDE.md, VALIDATION_SETUP.md]

Reference Documents (Purpose: Detailed implementation guidance)
├── PHASE_1_SETUP_GUIDE.md → Archive or consolidate course type definitions
├── WEIGHT_VALIDATION_APPROACH.md → Keep as planning reference (Phase 2 extension)

Operational Guides (Purpose: How to use the system)
├── IMPROVEMENT_CHECKLIST.md → Update to cross-reference VALIDATION_FRAMEWORK.md
├── MODEL_IMPROVEMENT_GUIDE.md → Keep, clarify as "workflow companion" to VALIDATION_FRAMEWORK.md
```

---

## Content Deduplication Map

### Topic: "Course Type Classification" (POWER/TECHNICAL/BALANCED)
| Document | Content | Status |
|-----------|---------|--------|
| PHASE_1_SETUP_GUIDE.md | Course type definitions | ✅ Keep as reference |
| MODEL_IMPROVEMENT_GUIDE.md | How types affect metrics | ✅ Keep (in context) |
| VALIDATION_FRAMEWORK.md | Phase 5: Type optimization | ✅ Master reference |

**Action:** Cross-reference all three when discussing course types

---

### Topic: "Prediction Accuracy & Validation"
| Document | Content | Status |
|-----------|---------|--------|
| TOURNAMENT_ANALYSIS_GUIDE.md | Tournament-by-tournament validation | ❌ DELETE |
| TOURNAMENT_RESULTS_VALIDATION.md | Integration with results display | ❌ DELETE |
| VALIDATION_SETUP.md | Manual validation setup | ❌ DELETE |
| VALIDATION_FRAMEWORK.md | Phase 2: Automated accuracy testing | ✅ MASTER |

**Action:** All validation discussion → VALIDATION_FRAMEWORK.md Phase 2

---

### Topic: "Weight Improvement Workflow"
| Document | Content | Status |
|-----------|---------|--------|
| IMPROVEMENT_CHECKLIST.md | Tactical checklist | ✅ KEEP |
| MODEL_IMPROVEMENT_GUIDE.md | Strategic workflow | ✅ KEEP |
| VALIDATION_FRAMEWORK.md | Phases 3-4: Sensitivity & iteration | ✅ MASTER |

**Action:** All three are complementary. Use together: Framework (what), Guide (how), Checklist (checklist)

---

### Topic: "Metric Correlation Analysis"
| Document | Content | Status |
|-----------|---------|--------|
| IMPROVEMENT_CHECKLIST.md | Phase 2: Run analysis | ✅ Reference |
| MODEL_IMPROVEMENT_GUIDE.md | Phase 2: Identify metrics | ✅ Reference |
| VALIDATION_FRAMEWORK.md | Phase 1: Correlation functions | ✅ MASTER |

**Action:** Framework is master, others reference it

---

## Recommended Actions

### IMMEDIATE (Delete/Archive)
```bash
# Files to delete - content fully superseded
rm /workspaces/GoogleAppScripts/TOURNAMENT_RESULTS_VALIDATION.md
rm /workspaces/GoogleAppScripts/TOURNAMENT_ANALYSIS_GUIDE.md
rm /workspaces/GoogleAppScripts/VALIDATION_SETUP.md

# Files to consider archiving (keep if reference value)
# Moved to ARCHIVE/ folder:
# - PHASE_1_SETUP_GUIDE.md
# - WEIGHT_VALIDATION_APPROACH.md
```

### SHORT-TERM (Update & Clarify)
1. **IMPROVEMENT_CHECKLIST.md**
   - Add header: "Tactical companion to VALIDATION_FRAMEWORK.md Phases 1-3"
   - Update function references to match current codebase
   - Add cross-references to VALIDATION_FRAMEWORK.md sections

2. **MODEL_IMPROVEMENT_GUIDE.md**
   - Add header: "Strategic workflow for using VALIDATION_FRAMEWORK.md analysis"
   - Clarify: This describes HOW TO USE the outputs from the framework
   - Update function names to match current implementation

3. **README.md**
   - Add section linking to VALIDATION_FRAMEWORK.md as "Main validation guide"
   - Keep repo setup content unchanged

### LONG-TERM (As You Build Phases)
- As you implement Phase 2 functions, update VALIDATION_FRAMEWORK.md with actual function names/locations
- Create separate docs for each major function/module as they're built
- Keep VALIDATION_FRAMEWORK.md as master index

---

## File Size Summary

**Before Consolidation:**
- 9 files, 1,868 lines
- ~500 lines duplicative
- ~300 lines obsolete

**After Consolidation:**
- ~5-6 core files
- ~1,200 lines total
- Clear deduplication
- Better organization

---

## Document Relationships (After Consolidation)

```
README.md
  ↓ "For validation strategy, see:"
VALIDATION_FRAMEWORK.md (MASTER - all phases)
  ↓
  ├─→ "For tactical checklist, see:"
  │   IMPROVEMENT_CHECKLIST.md (COMPANION)
  │
  └─→ "For strategic workflow, see:"
      MODEL_IMPROVEMENT_GUIDE.md (COMPANION)

PHASE_1_SETUP_GUIDE.md (ARCHIVE/REFERENCE - historical context only)
WEIGHT_VALIDATION_APPROACH.md (ARCHIVE/REFERENCE - Phase 2 extension planning)
```

---

## Summary Table

| File | Current | Recommended | Action |
|------|---------|-------------|--------|
| README.md | Keep | Keep | No change |
| VALIDATION_FRAMEWORK.md | New | Master Doc | Promote to primary reference |
| IMPROVEMENT_CHECKLIST.md | Keep | Keep + Update | Cross-reference VALIDATION_FRAMEWORK.md |
| MODEL_IMPROVEMENT_GUIDE.md | Keep | Keep + Clarify | Position as "workflow companion" |
| PHASE_1_SETUP_GUIDE.md | Outdated | Archive | Move to ARCHIVE/ folder |
| WEIGHT_VALIDATION_APPROACH.md | Planning | Archive | Move to ARCHIVE/ folder |
| TOURNAMENT_RESULTS_VALIDATION.md | Obsolete | Delete | Remove |
| TOURNAMENT_ANALYSIS_GUIDE.md | Outdated | Delete | Remove |
| VALIDATION_SETUP.md | Obsolete | Delete | Remove |

**Total Change: 9 → 6 active files, delete 3, archive 2**

