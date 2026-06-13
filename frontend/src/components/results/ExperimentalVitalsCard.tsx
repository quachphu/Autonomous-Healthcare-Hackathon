import type {
  ExperimentalVitals,
  ExperimentalVitalsConfig,
  ExperimentalRR,
  ExperimentalBP,
  ExperimentalSpO2,
  ExperimentalPWV,
} from "../../types/checkup";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEstimated(status: string) {
  return (
    status === "experimental_estimate" ||
    status === "surrogate_only_not_true_pwv"
  );
}

function isDemo(status: string) {
  return (
    status === "experimental_demo_estimate_uncalibrated" ||
    status === "experimental_estimate_calibrated_to_user_cuff"
  );
}

function isUnavailable(status: string) {
  return (
    status === "disabled" ||
    status === "unavailable" ||
    status === "not_available_single_roi" ||
    status === "disabled_or_requires_calibration"
  );
}

function confidenceBadge(confidence: string) {
  switch (confidence) {
    case "high":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "low":
      return "bg-orange-50 text-orange-700 border-orange-100";
    case "very_low":
      return "bg-red-50 text-red-700 border-red-100";
    default:
      return "bg-nn-mist text-nn-navy-light border-nn-mist";
  }
}

function statusColor(status: string) {
  if (isEstimated(status)) return "text-nn-deep-blue";
  if (isDemo(status)) return "text-amber-700";
  return "text-nn-navy-light";
}

function methodLabel(method: string | null): string {
  if (!method || method === "not_available" || method === "disabled")
    return "—";
  return method.replace(/_/g, " ");
}

// ── Metric card shell ─────────────────────────────────────────────────────────

function MetricCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-nn-pale-sky p-4 flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-nn-navy-light uppercase tracking-wide">
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Respiratory Rate ──────────────────────────────────────────────────────────

function RRCard({ rr }: { rr: ExperimentalRR }) {
  const est = isEstimated(rr.status);
  const unavail = isUnavailable(rr.status);

  return (
    <MetricCard title="Respiratory Rate">
      {est && rr.value_breaths_per_min != null ? (
        <p className={`text-xl font-bold ${statusColor(rr.status)}`}>
          {rr.value_breaths_per_min}
          <span className="text-xs font-normal text-nn-navy-light ml-1">
            br/min
          </span>
        </p>
      ) : (
        <p className="text-sm font-semibold text-nn-navy-light">
          {unavail ? "Not measured" : "Unavailable"}
        </p>
      )}

      {est && rr.confidence !== "unavailable" && (
        <span
          className={`self-start rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize ${confidenceBadge(rr.confidence)}`}
        >
          {rr.confidence} confidence
        </span>
      )}

      <p className="text-[9px] text-nn-navy-light leading-snug">
        {est
          ? `Camera-derived estimate · ${methodLabel(rr.method)}`
          : unavail
            ? "Requires additional data or calibration"
            : "Estimation disabled"}
      </p>

      {est && rr.confidence_score != null && (
        <p className="text-[9px] text-nn-navy-light">
          Signal score: {(rr.confidence_score * 100).toFixed(0)}%
        </p>
      )}

      <span className="self-start mt-0.5 rounded-full bg-white px-2 py-0.5 text-[9px] text-nn-navy-light border border-nn-mist">
        Not diagnostic
      </span>
    </MetricCard>
  );
}

// ── Blood Pressure ────────────────────────────────────────────────────────────

function BPCard({ bp }: { bp: ExperimentalBP }) {
  const est = isEstimated(bp.status) || isDemo(bp.status);
  const unavail = isUnavailable(bp.status);
  const isCalibrated =
    bp.status === "experimental_estimate_calibrated_to_user_cuff";

  return (
    <MetricCard title="Blood Pressure">
      {est && bp.systolic_mmHg != null && bp.diastolic_mmHg != null ? (
        <>
          <p className={`text-xl font-bold ${statusColor(bp.status)}`}>
            {bp.systolic_mmHg}/{bp.diastolic_mmHg}
            <span className="text-xs font-normal text-nn-navy-light ml-1">
              mmHg
            </span>
          </p>
          {bp.show_warning && (
            <p className="text-[9px] text-amber-700 leading-snug font-medium">
              {isCalibrated
                ? "Anchored to your cuff reading"
                : "Proof-of-concept only — not validated"}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-nn-navy-light">
          Not measured from webcam
        </p>
      )}

      {est && bp.confidence !== "unavailable" && (
        <span
          className={`self-start rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize ${confidenceBadge(bp.confidence)}`}
        >
          {bp.confidence.replace("_", " ")} confidence
        </span>
      )}

      <p className="text-[9px] text-nn-navy-light leading-snug">
        {unavail
          ? "Use a validated cuff for blood pressure readings"
          : "Camera-only BP requires calibration"}
      </p>

      <span className="self-start mt-0.5 rounded-full bg-white px-2 py-0.5 text-[9px] text-nn-navy-light border border-nn-mist">
        Not diagnostic · Use a cuff
      </span>
    </MetricCard>
  );
}

// ── SpO2 ──────────────────────────────────────────────────────────────────────

function SpO2Card({ spo2 }: { spo2: ExperimentalSpO2 }) {
  const est = isDemo(spo2.status);
  const unavail = isUnavailable(spo2.status);

  return (
    <MetricCard title="SpO2 Estimate">
      {est && spo2.value_percent != null ? (
        <>
          <p className={`text-xl font-bold ${statusColor(spo2.status)}`}>
            {spo2.value_percent}
            <span className="text-xs font-normal text-nn-navy-light ml-0.5">
              %
            </span>
          </p>
          {spo2.show_warning && (
            <p className="text-[9px] text-amber-700 leading-snug font-medium">
              Not a pulse oximeter reading
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-nn-navy-light">
          Not measured from webcam
        </p>
      )}

      {est && spo2.confidence !== "unavailable" && (
        <span
          className={`self-start rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize ${confidenceBadge(spo2.confidence)}`}
        >
          {spo2.confidence.replace("_", " ")} confidence
        </span>
      )}

      <p className="text-[9px] text-nn-navy-light leading-snug">
        {unavail
          ? "Use a validated pulse oximeter"
          : "Color-ratio demo estimate only"}
      </p>

      <span className="self-start mt-0.5 rounded-full bg-white px-2 py-0.5 text-[9px] text-nn-navy-light border border-nn-mist">
        Not diagnostic · Use a pulse ox
      </span>
    </MetricCard>
  );
}

// ── Pulse Timing Surrogate ────────────────────────────────────────────────────

function PWVCard({ pwv }: { pwv: ExperimentalPWV }) {
  const est = pwv.status === "surrogate_only_not_true_pwv";
  const unavail = isUnavailable(pwv.status);

  return (
    <MetricCard title="Pulse Timing Surrogate">
      {est && pwv.pulse_arrival_delay_ms != null ? (
        <p className={`text-xl font-bold ${statusColor(pwv.status)}`}>
          {pwv.pulse_arrival_delay_ms}
          <span className="text-xs font-normal text-nn-navy-light ml-1">
            ms delay
          </span>
        </p>
      ) : (
        <p className="text-sm font-semibold text-nn-navy-light">
          {unavail ? "Requires multi-ROI" : "Not available"}
        </p>
      )}

      {est && pwv.confidence !== "unavailable" && (
        <span
          className={`self-start rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize ${confidenceBadge(pwv.confidence)}`}
        >
          {pwv.confidence} confidence
        </span>
      )}

      <p className="text-[9px] text-nn-navy-light leading-snug">
        {est
          ? "Facial ROI cross-correlation · not true PWV"
          : unavail
            ? "Needs two ROI signals or ECG/PPG timing"
            : "Disabled"}
      </p>

      <span className="self-start mt-0.5 rounded-full bg-white px-2 py-0.5 text-[9px] text-nn-navy-light border border-nn-mist">
        Surrogate only · Not diagnostic
      </span>
    </MetricCard>
  );
}

// ── Warning banner for demo-mode metrics ──────────────────────────────────────

function DemoWarningBanner({ vitals }: { vitals: ExperimentalVitals }) {
  const hasDemoValues =
    isDemo(vitals.blood_pressure.status) || isDemo(vitals.spo2.status);

  if (!hasDemoValues) return null;

  // return (
  //   // <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
  //   //   {/* <p className="text-[11px] font-semibold text-amber-800 mb-0.5">
  //   //     Proof-of-concept demo values are shown
  //   //   </p>
  //   //   <p className="text-[10px] text-amber-700 leading-snug" style={{ fontFamily: 'var(--font-body)' }}>
  //   //     These numeric estimates are uncalibrated proof-of-concept outputs.
  //   //     Do not use them for any health decisions.
  //   //     Use a validated cuff for blood pressure and a certified pulse oximeter for oxygen saturation.
  //   //   </p> */}
  //   // </div>
  // )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ExperimentalVitalsCard({
  vitals,
  config,
}: {
  vitals: ExperimentalVitals;
  config?: ExperimentalVitalsConfig;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-nn-pale-sky flex-shrink-0">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="#4663ac"
            strokeWidth="1.8"
            className="h-5 w-5"
          >
            <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Z" />
            <path d="M10 6v4l2.5 2.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-nn-navy">
            Experimental Wellness Signals
          </h2>
          <p className="text-xs text-nn-navy-light">
            Camera-derived estimates · proof-of-concept only
          </p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-violet-50 border border-violet-200 px-3 py-1 text-[11px] font-semibold text-violet-700">
          Experimental
        </span>
      </div>

      {/* Not diagnostic notice */}
      <div className="rounded-xl bg-nn-pale-sky/60 px-4 py-2.5">
        <p
          className="text-[10px] text-nn-navy leading-snug"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <strong>Not diagnostic.</strong> These are camera-derived wellness
          signals estimated from the rPPG session for proof-of-concept purposes
          only. They are not a replacement for a cuff, pulse oximeter, or
          medical evaluation. Share trends with your care team.
        </p>
      </div>

      {/* 2×2 metric grid */}
      <div className="grid grid-cols-2 gap-3">
        <RRCard rr={vitals.respiratory_rate} />
        <BPCard bp={vitals.blood_pressure} />
        <SpO2Card spo2={vitals.spo2} />
        <PWVCard pwv={vitals.pulse_wave_velocity} />
      </div>

      {/* Demo values warning */}
      <DemoWarningBanner vitals={vitals} />

      {/* Feature flag status */}
      {config && (
        <div className="rounded-xl bg-nn-pale-sky/40 border border-nn-mist px-4 py-3">
          <p className="text-[10px] font-semibold text-nn-navy mb-1.5">
            Estimation status
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Resp. Rate", on: config.enable_experimental_rr },
              {
                label: "BP Demo",
                on: config.enable_experimental_uncalibrated_bp,
              },
              { label: "SpO2 Demo", on: config.enable_experimental_spo2_demo },
              {
                label: "Pulse Timing",
                on: config.enable_experimental_pulse_timing,
              },
            ].map(({ label, on }) => (
              <span
                key={label}
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold border ${
                  on
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-nn-mist text-nn-navy-light border-nn-mist"
                }`}
              >
                {on ? "✓" : "○"} {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p
        className="text-[10px] text-nn-navy-light leading-relaxed"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {vitals.disclaimer} Seek urgent medical care for chest pain, trouble
        breathing, fainting, seizure, severe headache, vision changes, heavy
        bleeding, or reduced fetal movement.
      </p>
    </div>
  );
}
