# ORBITAL — Machine Learning Methodology & Evaluation Report

## 1. Objective

Predict whether a candidate Earth Observation satellite imaging request is **physically and operationally feasible** (`1 = Feasible`, `0 = Infeasible`) prior to combinatorial pass scheduling using **Classical Machine Learning (Random Forest Classifier)**.

---

## 2. Synthetic Dataset Generation (`seed = 42`)

- **Total Samples**: $N = 600$ historical pass requests across 20 global reference targets (glaciers, maritime chokepoints, agricultural deltas, wildfire perimeters, and tectonic rifts).
- **Train / Test Split**: Stratified 80% Training ($N_{\text{train}} = 480$) / 20% Testing ($N_{\text{test}} = 120$) with fixed seed `42`.
- **Physical Ground-Truth Governing Equations**:
  A historical observation request succeeds (`feasible = 1`) when its kinematic window slack is non-negative, reaction wheel slew rate is within torque limits ($\le 2.35^\circ/\text{s}$), sensor-adjusted cloud obscuration allows target discrimination (SAR C-Band penetrates cloud cover; Optical/Multispectral require clear skies and solar elevation $\ge 10^\circ$), and thermal/SSR write-bandwidth envelopes are respected, subject to realistic Gaussian sensor/weather uncertainty ($\sigma = 0.065$).

---

## 3. Feature Engineering Pipeline (13 Features)

| # | Feature Name | Formula / Physical Meaning | Unit |
| :- | :--- | :--- | :--- |
| 1 | `window_span` | $w_{\text{end}} - w_{\text{start}}$ | $\text{s}$ |
| 2 | `imaging_duration` | Sensor integration duration on target | $\text{s}$ |
| 3 | `slew_time` | Attitude control manoeuvre duration | $\text{s}$ |
| 4 | `slack_time` | $\text{window\_span} - (\text{imaging\_duration} + \text{slew\_time})$ | $\text{s}$ |
| 5 | `window_utilization_ratio` | $(\text{imaging\_duration} + \text{slew\_time}) / \text{window\_span}$ | ratio |
| 6 | `slew_rate_deg_per_sec` | $\theta_{\text{slew}} / \text{slew\_time}$ | $\text{deg/s}$ |
| 7 | `effective_cloud_cover` | $\text{cloud\_coverage} \times (0.22 \text{ if SAR else } 1.0)$ | $\%$ |
| 8 | `solar_elevation_deg` | Local sun elevation angle at target acquisition | $\text{deg}$ |
| 9 | `energy_cost` | Electrical energy required from EPS bus | $\text{Wh}$ |
| 10 | `storage_cost` | Onboard Solid-State Recorder volume | $\text{GB}$ |
| 11 | `ssr_write_rate_gb_s` | $\text{storage\_cost} / \text{imaging\_duration}$ | $\text{GB/s}$ |
| 12 | `priority` | Mission command priority tier | $1\text{–}10$ |
| 13 | `reward_per_energy` | $\text{base\_reward} / \text{energy\_cost}$ | $\text{pts/Wh}$ |

---

## 4. Model Architecture & Reproducible Evaluation

- **Model**: Classical Random Forest Classifier (`n_estimators = 45`, `max_depth = 7`, `min_samples_split = 4`, `criterion = "gini"`, `random_state = 42`).
- **Top Dominant Features (by Gini Impurity Reduction)**:
  1. `effective_cloud_cover`
  2. `slack_time`
  3. `window_utilization_ratio`
  4. `slew_rate_deg_per_sec`
  5. `solar_elevation_deg`
- **Synthetic Training Validation vs. Operational Pass Execution**:
  - **Synthetic Test Split Metrics** measure how accurately the Random Forest classifies individual candidate tasks in isolation on the held-out 20% test set.
  - **Operational Satellite Performance** measures the complete pass schedule when tasks compete for non-overlapping timeline slots, finite battery energy ($\text{Wh}$), and finite onboard SSR storage ($\text{GB}$).
