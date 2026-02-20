# Model Generation (results.js)

This document explains how `results.js` computes player rankings and scores, with a focus on **mathematics**, **statistics**, and the **order of operations**. It intentionally omits data fetching and sheet I/O mechanics except where needed to explain formulas.

## Purpose and modeling goal

The model’s goal is to **rank players by predicted tournament performance**, which is ultimately used to identify likely top finishers and winners. It does this by combining multiple performance signals into a single composite score, calibrated so that “better” performance consistently means “higher” scores.

### Baseline score from historical, similar‑course, and putting rounds

The baseline score is built from **per‑player metric averages** that come from three round categories:

- **Historical rounds**: general form and long‑term skill signal.
- **Similar‑course rounds**: event‑specific course fit signal.
- **Putting‑emphasis rounds**: targeted signal for putting‑heavy setups.

These categories are weighted to reflect course setup. For example, if the course historically rewards putting, putting‑specific rounds are weighted more heavily so putting metrics influence the baseline proportionally. This matters because **course setups are not uniform**: some events magnify approach accuracy, others emphasize putting variance, and many mix both. Blending these round categories anchors the baseline to the **event’s skill profile**, not just generic player strength.

### Approach trends and their role in the final score

Approach trends are applied **before** z‑scoring to adjust raw approach metrics for recent momentum. The trend adjustment is multiplicative and direction‑aware (inverted for “lower is better” metrics). This allows a player with improving recent approach performance to receive a higher effective metric value, while a player trending down is gently penalized. The adjusted metrics then feed into the same z‑score and group‑weight pipeline, so **trends influence group scores and the final weighted score**, rather than acting as a separate post‑hoc adjustment.

> File of record: `apps-scripts/Golf_Algorithm_Library/modelGeneration/results.js`

---

## 1) Data Objects Used During Computation

At the point `generatePlayerRankings()` begins scoring, each player is represented by these core structures:

- **Historical metrics (17 values)**: per‑round or per‑event averages of classic statistics (SG Total, driving, GIR, etc.).
- **Approach metrics (18 values)**: per‑shot approach skill buckets split by distance/lie (FW/Rough). Values include GIR rate, SG per shot, and proximity.
- **Derived metric**: Birdie Chances Created (BCC) inserted into the metrics array.
- **Trends**: per‑metric trends derived from historical rounds. Trends are applied multiplicatively with a dampening threshold.
- **Group definitions**: metric groups (Driving, Approach buckets, Putting, Scoring, Course Management) with weights and metric weights.

The scoring process transforms these raw inputs into **z‑scores**, aggregates them into **group scores**, and finally produces a **weighted composite ranking**. Additional adjustments (past performance, data coverage, WAR, delta scores) refine ranking.

---

## 2) Metric Normalization and Transformations

### 2.1 Transforming “lower is better” metrics

Certain metrics are “lower is better” (e.g., Proximity, Scoring Average, Poor Shots). Before z‑scoring, they are transformed so that **higher is always better**:

- **Scoring Average**:
  $$x' = \text{maxScore} - x$$

- **Poor Shots**:
  $$x' = \text{maxPoorShots} - x$$

- **Proximity metrics** (Fairway Prox, Rough Prox, Approach Prox):
  $$x' = \max(0, \text{maxProx} - x)$$

This ensures the z‑score direction is consistent across all metrics.

### 2.2 Z‑score computation per metric

For each metric within a group, the script computes:

$$z = \frac{x' - \mu}{\sigma}$$

Where:

- $x'$ is the transformed metric value
- $\mu$ and $\sigma$ are the **mean** and **standard deviation** of that metric across the field

If $\sigma = 0$, it uses a small fallback (e.g., $0.001$) to avoid division by zero.

### 2.3 Birdie Chances Created (BCC)

BCC is a derived metric inserted at index 14 in the metric array. It combines weighted GIR, approach SG, proximity, and putting:

1. **Weighted GIR** uses course setup weights and fairway/rough distributions:

$$\text{GIR}_{\text{weighted}} =
GIR_{<100}w_{<100}
+ GIR_{100-150}^{FW}w_{100-150}f
+ GIR_{100-150}^{R}w_{100-150}(1-f)
+ GIR_{150-200}^{FW}w_{150-200}f
+ GIR_{>150}^{R}(w_{150-200}+w_{>200})(1-f)
+ GIR_{>200}^{FW}w_{>200}f$$

2. **Weighted approach SG** uses the same weighting (after converting per‑shot SG to per‑round):

$$SG_{\text{weighted}} =
SG_{<100}w_{<100}
+ SG_{100-150}^{FW}w_{100-150}f
+ SG_{100-150}^{R}w_{100-150}(1-f)
+ SG_{150-200}^{FW}w_{150-200}f
+ SG_{>150}^{R}(w_{150-200}+w_{>200})(1-f)
+ SG_{>200}^{FW}w_{>200}f$$

3. **Weighted proximity** is similarly computed and used as a penalty term:

$$Prox_{\text{weighted}} = \text{weighted average by distance/lie}$$

4. **Final BCC formula**:

$$
\begin{aligned}
BCC &= 0.40 \cdot GIR_{\text{weighted}} \\
&+ 0.30 \cdot \left(SG_{\text{weighted}} - \frac{Prox_{\text{weighted}}}{30}\right) \\
&+ 0.25 \cdot SG_{putt} \\
&+ 0.05 \cdot (74 - \text{ScoringAvg})
\end{aligned}
$$

## 3) Group Statistics (Mean/StdDev)

For each metric in each group, the script builds distribution statistics **across the player field**:

- Collect valid values (after applying transformations).
- Compute:
  $$\mu = \frac{1}{N}\sum_{i=1}^{N} x_i$$
  $$\sigma = \sqrt{\frac{1}{N-1}\sum_{i=1}^{N} (x_i - \mu)^2}$$

These stats are then used for all z‑scoring.

If a metric has **zero valid samples**, fallback means/stddevs are used (especially for proximity metrics).

---

## 4) Trend Application

Trends are applied to the **raw metric values** before z‑scoring.

- Trend weight: $0.30$
- Trend threshold: $0.005$
- Applied multiplicatively:

$$x_{\text{adjusted}} = x \cdot (1 + 0.30 \cdot t)$$

Where $t$ is the trend for that metric. For “lower is better” metrics, the trend sign is inverted.

This yields **adjusted metrics** used in scoring.

---

## 5) Group Score Calculation

For each group:

1. Compute z‑scores for each metric.
2. Apply metric weights within the group.
3. Aggregate to a weighted mean:

$$\text{GroupScore} = \frac{\sum (z_i \cdot w_i)}{\sum |w_i|}$$

This yields a **normalized group score** for each group.

### 5.1 Dampening for low data coverage

If player data coverage is below $0.70$, z‑scores are dampened by:

$$d = e^{-1.5(1 - coverage)}$$

All group z‑scores are multiplied by $d$, then group scores are recomputed.

### 5.2 Scoring‑metric z‑score penalty

For metrics that include **Score**, **Birdie**, or **Par** in the name, extreme z‑scores are penalized:

$$
z \leftarrow z \cdot \left(\frac{|z|}{2}\right)^{0.75}\quad \text{when } |z| > 2
$$

This penalty is applied both in the main scoring pass and during the dampened re‑score pass.

---

## 6) Weighted Score

The **core ranking score** is a weighted sum of group scores:

$$
\text{WeightedScore} = \frac{\sum (GroupScore_g \cdot GroupWeight_g)}{\sum GroupWeight_g}
$$

Group weights are normalized to sum to 1.0 if needed.

---

## 7) Data Coverage and Confidence

Coverage is the fraction of metrics with actual data:

$$coverage = \frac{\text{metrics with data}}{\text{total metrics}}$$

Confidence is derived from coverage using `getCoverageConfidence()` (a smooth nonlinear mapping). Low‑coverage players are penalized.

The confidence function used in `results.js` is:

$$
Confidence(coverage) = 0.5 + 0.5\sqrt{coverage}
$$

A further multiplier is applied:

$$
CoverageMultiplier =
\begin{cases}
\max\Big(0.4,\ 0.7 + 0.3 \cdot \frac{coverage}{0.70}\Big), & coverage < 0.70 \\
1.0, & coverage \ge 0.70
\end{cases}
$$

Then:

$$\text{RefinedWeightedScore} = \text{WeightedScore} \cdot \text{Confidence} \cdot \text{CoverageMultiplier}$$

**Coverage definition details** (as implemented):

- Coverage is computed as the fraction of metrics that have **real data**, not just non‑null values.
- Historical/similar/putting metrics count as “present” if **any round** has a valid value (zeros are valid for most metrics except driving distance and scoring average).
- Approach metrics count as “present” only when the computed approach value is **non‑zero** (zeros are treated as padding).

---

## 8) Past Performance Multiplier

If enabled, past performance applies an **event‑weighted multiplier**. The script assigns per‑event impact based on finish position (wins > top‑5 > top‑10 > made cut, etc.) and applies a **recency decay** (roughly exponential, e.g., $0.5^k$). The final effect is a bounded multiplier that scales the refined score.

Course‑history samples are counted **only for years prior to the current season**, and the effective past‑performance weight is **capped** based on:

- available course‑history sample size,
- course‑type defaults, and
- an optional regression‑based course history weight when available.

> Note: This past‑performance multiplier is **separate** from the approach‑delta signal. The approach‑delta signal is computed upstream (in the modelCore pipeline) using **course‑setup‑aligned approach deltas**, then injected here as delta player scores.

---

## 9) Delta Scores and Notes

Delta scores (trend and predictive) are loaded per player and used in two ways. These deltas are **precomputed** in the modelCore pipeline using a gated approach: approach‑delta metrics are aligned to the **course setup weights**, producing a course‑specific recent‑form signal. That signal can offset baseline performance (good or bad) through WAR/tie‑break impacts.

1. **Delta notes**: label players as high, low, neutral, or missing.
2. **WAR adjustment**: predictive delta nudges WAR:

$$\Delta WAR = \text{clip}(\Delta Pred, -1, 1) \cdot 0.05$$

These scores do **not** change the core weighted score directly, but they influence tie‑breaking through WAR.

### 9.1 Bucket‑weighted delta bonus (pre‑refinement)

In addition to notes/WAR, the model applies a **small blended bonus** to the weighted score based on bucket‑level deltas that match the course setup distribution. For each bucket $b \in \{short, mid, long, veryLong\}$:

$$
BucketSignal_b = 0.7 \cdot \Delta Pred_b + 0.3 \cdot \Delta Trend_b
$$

These are aggregated using the course setup weights and capped:

$$
BucketBonus = clip\Big(\sum_b w_b \cdot BucketSignal_b, -0.10, 0.10\Big)
$$

If both overall delta scores are positive (predictive and trend), a small gated boost is added:

$$
GatedBoost =
\begin{cases}
0.05, & \Delta Pred > 0 \text{ and } \Delta Trend > 0 \\
0, & \text{otherwise}
\end{cases}
$$

Final pre‑refinement adjustment:

$$
WeightedScore \leftarrow WeightedScore + BucketBonus + GatedBoost
$$

This adjustment happens **before** coverage/confidence refinement.

### 9.2 Delta notes include bucket signal summary

Player notes include:

- **ΔPred / ΔTrend markers** (↑ / ↓ / → / ∅)
- **BucketSig** summary with z‑score and per‑bucket arrows

---

## 10) WAR and Tie‑Breaking

The model calculates a WAR‑like composite from key metrics (via transformed z‑scores). It is used as a **secondary tiebreaker** for players with similar refined scores. WAR is affected by delta predictive adjustment as shown above.

---

## 11) Final Ranking Order

Players are sorted by **RefinedWeightedScore**, with a **close‑score tiebreak** that blends weighted score and WAR. Output includes:

- Rank
- Weighted score
- Refined score
- WAR
- Delta scores
- Metrics and trends

### Close‑score tie‑break rule

If two players are within $0.05$ of each other, the model uses a composite score:

$$
CompositeScore = 0.7 \cdot WeightedScore + 0.3 \cdot WAR
$$

Exact ties on refined score still fall back to WAR directly.

---

# Detailed Order of Operations

1. **Initialize configuration**
   - Read group weights, metric weights, past performance settings, course setup weights, etc.

2. **Aggregate player metrics**
   - Assemble historical averages and approach metrics per player.

3. **Compute Birdie Chances Created (BCC)**
   - Derive BCC via weighted GIR, weighted SG, proximity penalty, and putting.

4. **Insert BCC into metric array**
   - Insert at index 14, shifting subsequent indices.

5. **Compute group statistics**
   - For each metric: compute mean/stddev across the field (after transformations).

6. **Apply trends to metrics**
   - Multiply raw metric values by trend factor (after thresholding).

7. **Calculate per‑metric z‑scores**
   - Apply transformations (lower‑is‑better, prox, scoring avg), then compute z‑scores.

8. **Compute group scores**
   - Weighted average of z‑scores within each group.

9. **Apply coverage dampening (if needed)**
   - If coverage < 0.70, dampen z‑scores and recompute group scores.

10. **Compute weighted score**
    - Weighted sum of group scores using group weights.

11. **Compute refined weighted score**
    - Apply confidence and coverage multipliers.

12. **Apply past performance multiplier (if enabled)**
    - Adjust the refined score based on historical finishes with recency weighting.

13. **Apply delta scores**
   - Attach delta trend/predictive scores and notes (including bucket signal).
   - Apply bucket‑weighted delta bonus and gated boost to weighted score.
   - Apply delta predictive WAR adjustment.

14. **Calculate WAR**
    - Compute WAR via transformed z‑scores of weighted KPIs.

15. **Final sorting and ranking**
    - Sort by refined score; break close ties using WAR.

16. **Output formatting**
   - Write metrics, trends, refined scores, WAR, deltas, and notes.

---

## Notes on Statistical Behavior

- Z‑scores make all metrics comparable regardless of units.
- Transformations guarantee higher values always represent better performance.
- Group weighting makes high‑importance skill clusters dominate the final score.
- Confidence and coverage reduce over‑ranking of thin‑data players.
- WAR provides a stable secondary signal for tie‑breaking, and delta predictive nudges it slightly.

---
