import { useState } from "react";
import { useAppContext } from "../../contexts/AppContext";
import { mockCheckupResult } from "../../data/mockData";
import type { CheckupResult } from "../../types/checkup";
import ExperimentalVitalsCard from "./ExperimentalVitalsCard";

// ── Color helpers ─────────────────────────────────────────────────────────────

function qualityColor(label: string) {
  if (label === "good") return "text-emerald-600";
  if (label === "medium") return "text-amber-600";
  return "text-red-500";
}

function pulseCategoryColor(cat: string) {
  if (cat === "typical_resting_range" || cat === "normal")
    return "text-emerald-600";
  if (
    cat === "elevated_for_resting_checkin" ||
    cat === "elevated" ||
    cat === "low" ||
    cat === "below_typical_resting_range"
  )
    return "text-amber-600";
  if (cat === "high") return "text-red-500";
  return "text-nn-navy-light";
}

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

function trendIcon(trend: string) {
  if (trend === "stable") return "→";
  if (trend === "increasing") return "↑";
  if (trend === "decreasing") return "↓";
  return "↕";
}

function trendColor(trend: string) {
  if (trend === "stable") return "text-emerald-600";
  if (trend === "increasing" || trend === "decreasing") return "text-amber-600";
  return "text-red-500";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  sub,
  color,
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  color?: string;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl bg-nn-pale-sky p-4">
      <p className="text-xs font-medium text-nn-navy-light">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-nn-navy"}`}>
        {value}
        {unit && (
          <span className="text-sm font-normal text-nn-navy-light ml-1">
            {unit}
          </span>
        )}
      </p>
      {sub && (
        <p className="mt-0.5 text-[10px] text-nn-navy-light leading-tight">
          {sub}
        </p>
      )}
      {badge && (
        <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] text-nn-navy-light">
          {badge}
        </span>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-bold text-nn-navy">{title}</p>
      {children}
    </div>
  );
}

function FutureMetricRow({
  label,
  explanation,
}: {
  label: string;
  explanation: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-nn-pale-sky/50 px-4 py-3">
      <div className="mt-0.5 flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-nn-mist">
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="#7a8fb0"
          strokeWidth="1.4"
          className="h-3 w-3"
        >
          <path d="M6 1v5M6 8v1" strokeLinecap="round" />
          <circle cx="6" cy="6" r="5" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-nn-navy">{label}</p>
        <p className="text-[10px] text-nn-navy-light leading-snug mt-0.5">
          {explanation}
        </p>
      </div>
      <span className="flex-shrink-0 rounded-full bg-nn-mist px-2 py-0.5 text-[9px] font-medium text-nn-navy-light">
        Not available
      </span>
    </div>
  );
}

// ── Real results (new rich schema) ────────────────────────────────────────────

function RealResultsSummary({ r }: { r: CheckupResult }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Prefer new schema fields; fall back to legacy rppg_analysis
  const cs = r.checkup_summary;
  const hrs = r.heart_rate_statistics;
  const ma = r.method_agreement;
  const sq = r.signal_quality;
  const rq = r.recording_quality;
  const mwi = r.maternal_wellness_interpretation;
  const wf = r.rppg_waveform_statistics;
  const future = r.future_or_unsupported_metrics;

  const hrBpm =
    cs?.estimated_pulse_bpm ?? r.rppg_analysis.consensus.estimated_pulse_bpm;
  const pulseCategory =
    cs?.pulse_category ?? r.rppg_analysis.consensus.pulse_category;
  const pulseLabel = cs?.pulse_label ?? r.rppg_analysis.consensus.pulse_label;
  const overallQuality = sq?.overall ?? r.rppg_analysis.signal_quality.label;
  const trend = hrs?.trend ?? r.rppg_analysis.check_in_trend;
  const wellnessScore =
    mwi?.wellness_score ?? r.rppg_analysis.signal_quality.wellness_score;
  const retake =
    rq?.retake_recommended ?? r.rppg_analysis.consensus.retake_recommended;
  const retakeReasons = rq?.retake_reasons ?? [];
  const agreementQuality = ma?.agreement_quality ?? "unknown";
  const confidence = cs?.confidence ?? "medium";

  // Per-method HRs
  const posHr =
    hrs?.heart_rate_by_method?.POS ?? r.rppg_analysis.methods.pos.hr_bpm;
  const chromHr =
    hrs?.heart_rate_by_method?.CHROM ?? r.rppg_analysis.methods.chrom.hr_bpm;
  const greenHr =
    hrs?.heart_rate_by_method?.GREEN ?? r.rppg_analysis.methods.green.hr_bpm;

  const posChromDiff = ma?.pos_chrom_difference_bpm;
  const outliers = ma?.outlier_methods ?? [];

  const duration =
    rq?.recording_duration_seconds ?? r.recording.duration_seconds;
  const fps = rq?.estimated_fps ?? r.recording.estimated_fps;
  const frameCount = rq?.frame_count ?? r.recording.frame_count;
  const resolution = rq?.resolution ?? "—";
  const faceDetected = rq?.face_detected ?? true;
  const multipleFaces = rq?.multiple_faces_detected ?? false;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-nn-pale-sky">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="#4663ac"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path d="M10 17S2 11.5 2 7a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 18 7c0 4.5-8 10-8 10Z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-nn-navy">
              Camera-Based Wellness Signal
            </h2>
            <p className="text-xs text-nn-navy-light">
              Session {r.session_id} · {frameCount} frames · {fps.toFixed(1)}{" "}
              fps
            </p>
          </div>
          {/* Confidence badge */}
          <span
            className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold capitalize border ${
              confidence === "good"
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : confidence === "medium"
                  ? "bg-amber-50 text-amber-700 border-amber-100"
                  : "bg-red-50 text-red-700 border-red-100"
            }`}
          >
            {confidence} confidence
          </span>
        </div>

        {/* ── 6 stat cards (3 × 2) ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* 1. Estimated Pulse */}
          <StatCard
            label="Estimated Pulse"
            value={hrBpm != null ? hrBpm.toFixed(1) : "N/A"}
            unit="bpm"
            sub={pulseLabel}
            color={pulseCategoryColor(pulseCategory)}
            badge="Camera-based wellness signal"
          />

          {/* 2. Signal Quality */}
          <StatCard
            label="Signal Quality"
            value={
              overallQuality.charAt(0).toUpperCase() + overallQuality.slice(1)
            }
            sub={`SNR ${wf?.snr_like_score?.toFixed(3) ?? r.rppg_analysis.signal_quality.best_snr.toFixed(3)}`}
            color={qualityColor(overallQuality)}
            badge={sq ? `Waveform: ${sq.waveform_strength}` : "rPPG signal"}
          />

          {/* 3. Wellness Score */}
          <StatCard
            label="Wellness Score"
            value={`${wellnessScore}`}
            unit="/ 100"
            sub="Estimated check-in score"
            color={scoreColor(wellnessScore)}
            badge="Not a medical risk score"
          />

          {/* 4. HR Trend */}
          <div className="rounded-2xl bg-nn-pale-sky p-4">
            <p className="text-xs font-medium text-nn-navy-light">HR Trend</p>
            <p
              className={`mt-1 text-xl font-bold ${trendColor(trend as string)}`}
            >
              {trendIcon(trend as string)}{" "}
              {(trend as string).charAt(0).toUpperCase() +
                (trend as string).slice(1)}
            </p>
            {hrs?.window_values_bpm && hrs.window_values_bpm.length > 0 && (
              <p className="mt-0.5 text-[10px] text-nn-navy-light">
                {hrs.min_window_bpm?.toFixed(1)} –{" "}
                {hrs.max_window_bpm?.toFixed(1)} bpm range
              </p>
            )}
            <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] text-nn-navy-light">
              Check-in trend
            </span>
          </div>

          {/* 5. Recording */}
          <div className="rounded-2xl bg-nn-pale-sky p-4">
            <p className="text-xs font-medium text-nn-navy-light">Recording</p>
            <p className="mt-1 text-xl font-bold text-nn-navy">
              {duration.toFixed(0)}s
            </p>
            <p className="mt-0.5 text-[10px] text-nn-navy-light">
              {fps.toFixed(1)} fps · {resolution}
            </p>
            <span
              className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] border ${
                faceDetected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : "bg-red-50 text-red-700 border-red-100"
              }`}
            >
              {faceDetected ? "Face detected" : "No face detected"}
            </span>
          </div>

          {/* 6. Retake */}
          <div
            className={`rounded-2xl p-4 border ${retake ? "bg-amber-50 border-amber-200" : "bg-nn-pale-sky border-transparent"}`}
          >
            <p className="text-xs font-medium text-nn-navy-light">Retake</p>
            <p
              className={`mt-1 text-xl font-bold ${retake ? "text-amber-700" : "text-emerald-600"}`}
            >
              {retake ? "Recommended" : "Not needed"}
            </p>
            {retakeReasons.length > 0 ? (
              <p className="mt-0.5 text-[10px] text-amber-700 leading-tight">
                {retakeReasons[0]}
              </p>
            ) : (
              <p className="mt-0.5 text-[10px] text-nn-navy-light">
                Signal acceptable
              </p>
            )}
            <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] text-nn-navy-light">
              {retakeReasons.length} reason
              {retakeReasons.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ── Wellness message ── */}
        {mwi && (
          <div className="mt-4 rounded-2xl bg-nn-pale-sky/60 px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-nn-navy">
              What this means for you
            </p>
            <p
              className="text-xs text-nn-navy leading-relaxed"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {mwi.message}
            </p>
            <p className="text-xs text-nn-deep-blue font-medium">
              → {mwi.suggested_next_step}
            </p>
          </div>
        )}

        {/* ── Per-method breakdown ── */}
        <div className="mt-4 rounded-2xl border border-nn-mist bg-nn-pale-sky/50 px-4 py-3">
          <SectionHeader title="Per-Method Estimates" />
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            {[
              { name: "POS", bpm: posHr, primary: true },
              { name: "CHROM", bpm: chromHr, primary: true },
              { name: "GREEN", bpm: greenHr, primary: false },
            ].map(({ name, bpm, primary }) => {
              const isOutlier = outliers.includes(name);
              return (
                <div
                  key={name}
                  className={`rounded-xl px-2 py-2 ${isOutlier ? "bg-amber-50 border border-amber-200" : "bg-white"}`}
                >
                  <p className="text-[10px] text-nn-navy-light font-medium">
                    {name}
                  </p>
                  <p className="text-sm font-bold text-nn-navy">
                    {bpm != null ? bpm.toFixed(1) : "—"}
                  </p>
                  <p className="text-[9px] text-nn-navy-light">bpm</p>
                  {isOutlier && (
                    <span className="text-[8px] text-amber-700 font-medium">
                      outlier
                    </span>
                  )}
                  {!primary && (
                    <span className="text-[8px] text-nn-navy-light">
                      baseline
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {posChromDiff != null && (
            <div className="flex items-center gap-4 text-xs text-nn-navy-light">
              <span>
                POS/CHROM diff:{" "}
                <strong className="text-nn-navy">
                  {posChromDiff.toFixed(2)} bpm
                </strong>
              </span>
              <span>
                Agreement:{" "}
                <strong
                  className={`capitalize ${qualityColor(agreementQuality)}`}
                >
                  {agreementQuality}
                </strong>
              </span>
              {outliers.length > 0 && (
                <span>
                  Outliers:{" "}
                  <strong className="text-amber-700">
                    {outliers.join(", ")}
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Advanced stats toggle ── */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-nn-mist bg-nn-pale-sky/30 px-4 py-2.5 text-xs font-semibold text-nn-navy hover:bg-nn-pale-sky transition-colors"
        >
          Advanced signal statistics
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          >
            <path
              d="M4 6l4 4 4-4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3">
            {/* HR window values */}
            {hrs && hrs.window_values_bpm.length > 0 && (
              <div className="rounded-xl bg-nn-pale-sky/50 px-4 py-3">
                <p className="text-xs font-semibold text-nn-navy mb-2">
                  Window HR Values ({hrs.window_size_seconds}s windows)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {hrs.window_values_bpm.map((v, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-nn-navy"
                    >
                      {v.toFixed(1)}
                    </span>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-5 gap-2 text-center text-[10px]">
                  {[
                    ["Mean", hrs.mean_window_bpm?.toFixed(1)],
                    ["Min", hrs.min_window_bpm?.toFixed(1)],
                    ["Max", hrs.max_window_bpm?.toFixed(1)],
                    ["Range", hrs.range_window_bpm?.toFixed(1)],
                    ["Std", hrs.std_window_bpm?.toFixed(2)],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="rounded-lg bg-white px-1 py-1.5">
                      <p className="text-nn-navy-light">{lbl}</p>
                      <p className="font-bold text-nn-navy">{val ?? "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Waveform stats */}
            {wf && (
              <div className="rounded-xl bg-nn-pale-sky/50 px-4 py-3">
                <p className="text-xs font-semibold text-nn-navy mb-2">
                  rPPG Waveform Statistics
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                  {[
                    [
                      "Dominant freq",
                      wf.dominant_frequency_hz != null
                        ? `${wf.dominant_frequency_hz.toFixed(3)} Hz`
                        : "—",
                    ],
                    [
                      "Dominant BPM",
                      wf.dominant_frequency_bpm != null
                        ? `${wf.dominant_frequency_bpm.toFixed(2)} bpm`
                        : "—",
                    ],
                    [
                      "SNR-like score",
                      wf.snr_like_score != null
                        ? wf.snr_like_score.toFixed(4)
                        : "—",
                    ],
                    ["Valid windows", wf.valid_window_count.toString()],
                    [
                      "Waveform samples",
                      wf.waveform_sample_count?.toLocaleString() ?? "—",
                    ],
                    ["Peak power", wf.peak_power?.toExponential(2) ?? "—"],
                  ].map(([lbl, val]) => (
                    <div
                      key={lbl}
                      className="flex justify-between border-b border-nn-mist/60 py-0.5"
                    >
                      <span className="text-nn-navy-light">{lbl}</span>
                      <span className="font-medium text-nn-navy">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recording details */}
            <div className="rounded-xl bg-nn-pale-sky/50 px-4 py-3">
              <p className="text-xs font-semibold text-nn-navy mb-2">
                Recording Details
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                {[
                  ["Duration", `${duration.toFixed(1)}s`],
                  ["Frame count", frameCount.toLocaleString()],
                  ["Estimated FPS", fps.toFixed(1)],
                  ["Resolution", resolution],
                  ["Face detected", faceDetected ? "Yes" : "No"],
                  ["Multiple faces", multipleFaces ? "Yes ⚠" : "No"],
                ].map(([lbl, val]) => (
                  <div
                    key={lbl}
                    className="flex justify-between border-b border-nn-mist/60 py-0.5"
                  >
                    <span className="text-nn-navy-light">{lbl}</span>
                    <span
                      className={`font-medium ${
                        lbl === "Face detected" && val === "No"
                          ? "text-red-600"
                          : lbl === "Multiple faces" && val.includes("Yes")
                            ? "text-amber-700"
                            : "text-nn-navy"
                      }`}
                    >
                      {val}
                    </span>
                  </div>
                ))}
              </div>
              {multipleFaces && (
                <p className="mt-2 text-[10px] text-amber-700">
                  Multiple faces may reduce signal accuracy. Ensure only one
                  person is in frame.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {/* ── Experimental vitals (new) or future/unsupported (legacy fallback) ── */}
      {r.experimental_vitals ? (
        <ExperimentalVitalsCard
          vitals={r.experimental_vitals}
          config={r.experimental_vitals_config}
        />
      ) : (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <SectionHeader title="Future & Unsupported Metrics">
            <span className="text-[10px] text-nn-navy-light">
              Not available in this prototype
            </span>
          </SectionHeader>
          <div className="space-y-2">
            <FutureMetricRow
              label="Respiratory Rate"
              explanation={
                future?.respiratory_rate.explanation ??
                "May require a supervised multitask model such as BigSmall or additional validated signal processing."
              }
            />
            <FutureMetricRow
              label="Blood Pressure"
              explanation={
                future?.blood_pressure.explanation ??
                "Camera-only blood pressure estimation requires validated calibration/modeling or cuff integration."
              }
            />
            <FutureMetricRow
              label="SpO2 (Blood Oxygen)"
              explanation={
                future?.spo2.explanation ??
                "SpO2 requires a validated optical sensor or calibrated model. Do not present it as measured from webcam."
              }
            />
            <FutureMetricRow
              label="Pulse Wave Velocity"
              explanation={
                future?.pulse_wave_velocity.explanation ??
                "Requires timing between multiple pulse sites or additional sensors."
              }
            />
          </div>
          <p
            className="mt-3 text-[10px] text-nn-navy-light leading-relaxed"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {r.safety.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Mock fallback (no real result) ────────────────────────────────────────────

function MockResultsSummary() {
  const r = mockCheckupResult;
  const metrics = [
    {
      label: "Estimated Pulse",
      value: `${r.heartRate} bpm`,
      badge: "Camera-based wellness signal",
      color: "text-nn-deep-blue",
    },
    {
      label: "Signal Quality",
      value: r.signalQuality,
      badge: r.lightingNote,
      color: "text-emerald-600",
    },
    {
      label: "Check-in Trend",
      value: r.trend,
      badge: "vs. 7-day baseline",
      color: "text-nn-navy",
    },
    {
      label: "Wellness Score",
      value: "82 / 100",
      badge: "Estimated only",
      color: "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="#10b981"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path
                d="M5 10l3.5 3.5L15 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="10" r="8" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-nn-navy">
              Camera-Based Wellness Signal
            </h2>
            <p className="text-xs text-nn-navy-light">
              Completed {r.completedAt} · {r.method}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map(({ label, value, badge, color }) => (
            <div key={label} className="rounded-2xl bg-nn-pale-sky p-4">
              <p className="text-xs font-medium text-nn-navy-light">{label}</p>
              <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
              <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] text-nn-navy-light">
                {badge}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-nn-mist bg-nn-pale-sky/50 px-4 py-3 text-xs text-nn-navy-light">
          <p>
            <strong className="text-nn-navy">Recording:</strong>{" "}
            {r.recordingLengthSeconds}s ·{" "}
            <strong className="text-nn-navy">Method:</strong> {r.method}
          </p>
          <p className="mt-0.5">
            <strong className="text-nn-navy">Notes:</strong> {r.motionNote}
          </p>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-nn-navy mb-3">
          Future &amp; Unsupported Metrics
        </p>
        <div className="space-y-2">
          <FutureMetricRow
            label="Respiratory Rate"
            explanation="May require a supervised multitask model such as BigSmall or additional validated signal processing."
          />
          <FutureMetricRow
            label="Blood Pressure"
            explanation="Camera-only blood pressure estimation requires validated calibration/modeling or cuff integration."
          />
          <FutureMetricRow
            label="SpO2 (Blood Oxygen)"
            explanation="Requires a validated optical sensor or calibrated model. Not available from webcam alone."
          />
          <FutureMetricRow
            label="Pulse Wave Velocity"
            explanation="Requires timing between multiple pulse sites or additional sensors."
          />
        </div>
      </div>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function ResultsSummary() {
  const { checkupResult } = useAppContext();
  if (checkupResult) return <RealResultsSummary r={checkupResult} />;
  return <MockResultsSummary />;
}
