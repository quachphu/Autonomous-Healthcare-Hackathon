// ── Voice check-in types ──────────────────────────────────────────────────────

export interface VoiceCheckinQuestion {
  id: string
  question: string
  raw_transcript: string
  cleaned_answer: string
}

export interface SymptomReport {
  shortness_of_breath: boolean
  chest_pain: boolean
  dizziness: boolean
  severe_headache: boolean
  vision_changes: boolean
  heavy_bleeding: boolean
  reduced_fetal_movement: boolean
  fever_or_chills: boolean
  mood_concern: boolean
}

export interface VoiceCheckin {
  questions_asked: VoiceCheckinQuestion[]
  raw_full_transcript: string
  cleaned_note: string
  symptoms_reported: SymptomReport
  possible_context_for_metrics: string[]
  care_team_summary: string
  suggested_next_step: string
  requires_urgent_notice: boolean
  urgent_notice_reason: string | null
  ai_cleanup_skipped?: boolean
  ai_cleanup_reason?: string
}

export interface SessionNotesForUser {
  title: string
  summary: string
  cleaned_note: string
  care_team_summary: string
}

export interface SessionStorage {
  saved_local_json: boolean
  local_json_path: string
  saved_supabase: boolean
  supabase_table: string
  supabase_error?: string
  local_save_error?: string
}

// ── Start-session response ────────────────────────────────────────────────────

export interface VoiceQuestion {
  id: string
  question: string
}

export interface StartSessionResponse {
  session_id: string
  status: string
  max_duration_seconds: number
  questions: VoiceQuestion[]
}

export interface TranscribeResponse {
  question_id: string
  transcript: string
  next_question: VoiceQuestion | null
  questions_remaining: number
  all_questions_answered: boolean
  transcription_error?: string
}

export interface FinishSessionPayload {
  session_id: string
  rppg_result?: unknown
  duration_seconds?: number
  completed_reason?: string
  answers?: Array<{
    question_id: string
    question: string
    raw_transcript: string
  }>
}

// ── Legacy / backward-compat types ───────────────────────────────────────────
export type SignalQualityLabel = 'good' | 'medium' | 'low'
export type MethodAgreementLabel = 'good' | 'moderate' | 'poor' | 'insufficient'
export type PulseCategory = 'low' | 'normal' | 'elevated' | 'high' | 'unknown'
export type CheckInTrend = 'stable' | 'increasing' | 'decreasing' | 'variable'

export interface MethodResult {
  hr_bpm: number | null
  snr: number | null
  status: 'ok' | 'unavailable'
}

// ── New rich schema types ─────────────────────────────────────────────────────
export type PulseCategoryNew =
  | 'below_typical_resting_range'
  | 'typical_resting_range'
  | 'elevated_for_resting_checkin'

export type AgreementQuality = 'good' | 'medium' | 'low'
export type HRTrend = 'stable' | 'increasing' | 'decreasing' | 'variable'
export type WaveformStrength = 'good' | 'medium' | 'low' | 'unknown'
export type Confidence = 'good' | 'medium' | 'low'

export interface CheckupSummary {
  estimated_pulse_bpm: number | null
  pulse_category: PulseCategoryNew
  pulse_label: string
  confidence: Confidence
  retake_recommended: boolean
}

export interface HeartRateStatistics {
  primary_method: string
  backup_method: string
  baseline_method: string
  consensus_method: string
  heart_rate_by_method: { POS: number | null; CHROM: number | null; GREEN: number | null }
  consensus_heart_rate_bpm: number | null
  window_size_seconds: number
  window_values_bpm: number[]
  mean_window_bpm: number | null
  min_window_bpm: number | null
  max_window_bpm: number | null
  range_window_bpm: number | null
  std_window_bpm: number | null
  trend: HRTrend
}

export interface MethodAgreementStats {
  pos_chrom_difference_bpm: number | null
  pos_green_difference_bpm: number | null
  chrom_green_difference_bpm: number | null
  green_difference_from_consensus_bpm: number | null
  outlier_methods: string[]
  agreement_quality: AgreementQuality
}

export interface RPPGWaveformStatistics {
  waveform_available: boolean
  waveform_sample_count: number | null
  dominant_frequency_hz: number | null
  dominant_frequency_bpm: number | null
  peak_power: number | null
  average_band_power: number | null
  snr_like_score: number | null
  valid_window_count: number
}

export interface SignalQuality {
  overall: SignalQualityLabel
  method_agreement: AgreementQuality
  hr_stability: string
  waveform_strength: WaveformStrength
  face_detected: boolean
  multiple_faces_detected: boolean
  recording_duration_seconds: number
  estimated_fps: number
}

export interface RecordingQuality {
  face_detected: boolean
  multiple_faces_detected: boolean
  recording_duration_seconds: number
  frame_count: number
  estimated_fps: number
  resolution: string
  retake_recommended: boolean
  retake_reasons: string[]
}

export interface MaternalWellnessInterpretation {
  wellness_score: number
  score_label: string
  message: string
  suggested_next_step: string
  escalation_note: string
}

export interface FutureMetricRR {
  status: string
  value_breaths_per_min: number | null
  explanation: string
}
export interface FutureMetricBP {
  status: string
  systolic_mmHg: number | null
  diastolic_mmHg: number | null
  explanation: string
}
export interface FutureMetricPWV {
  status: string
  value: number | null
  explanation: string
}
export interface FutureMetricSpO2 {
  status: string
  value_percent: number | null
  explanation: string
}

// ── Experimental vitals types ─────────────────────────────────────────────────

export interface ExperimentalVitalsConfig {
  enable_experimental_rr: boolean
  enable_experimental_uncalibrated_bp: boolean
  enable_experimental_spo2_demo: boolean
  enable_experimental_pulse_timing: boolean
}

export type ExperimentalStatus =
  | 'experimental_estimate'
  | 'experimental_demo_estimate_uncalibrated'
  | 'experimental_estimate_calibrated_to_user_cuff'
  | 'surrogate_only_not_true_pwv'
  | 'disabled_or_requires_calibration'
  | 'disabled'
  | 'unavailable'
  | 'not_available_single_roi'
  | string

export interface ExperimentalRR {
  status: ExperimentalStatus
  value_breaths_per_min: number | null
  method: string | null
  confidence: string
  confidence_score: number | null
  valid_range_breaths_per_min: [number, number] | null
  notes: string[]
}

export interface ExperimentalBP {
  status: ExperimentalStatus
  systolic_mmHg: number | null
  diastolic_mmHg: number | null
  method: string | null
  confidence: string
  calibration_source?: string | null
  show_warning?: boolean
  notes: string[]
}

export interface ExperimentalSpO2 {
  status: ExperimentalStatus
  value_percent: number | null
  method: string | null
  confidence: string
  show_warning?: boolean
  notes: string[]
}

export interface ExperimentalPWV {
  status: ExperimentalStatus
  value_m_per_s: number | null
  pulse_arrival_delay_ms: number | null
  method: string | null
  confidence: string
  notes: string[]
}

export interface ExperimentalVitals {
  respiratory_rate: ExperimentalRR
  blood_pressure: ExperimentalBP
  spo2: ExperimentalSpO2
  pulse_wave_velocity: ExperimentalPWV
  disclaimer: string
}

export interface RawSignalTraces {
  stored_inline: boolean
  sample_count: number | null
  local_trace_path: string | null
  supabase_storage_path: string | null
  available_traces: string[]
}

// ── Combined result interface (new schema + legacy compat fields) ──────────────
export interface CheckupResult {
  session_id: string
  created_at: string

  // New rich schema (present in all results from the updated backend)
  source?: {
    pipeline: string
    mode: string
    methods_run: string[]
    ground_truth_used: boolean
  }
  checkup_summary?: CheckupSummary
  heart_rate_statistics?: HeartRateStatistics
  method_agreement?: MethodAgreementStats
  rppg_waveform_statistics?: RPPGWaveformStatistics
  signal_quality?: SignalQuality
  recording_quality?: RecordingQuality
  maternal_wellness_interpretation?: MaternalWellnessInterpretation
  future_or_unsupported_metrics?: {
    respiratory_rate: FutureMetricRR
    blood_pressure: FutureMetricBP
    pulse_wave_velocity: FutureMetricPWV
    spo2: FutureMetricSpO2
  }
  available_from_webcam?: {
    heart_rate: boolean
    heart_rate_trend: boolean
    rppg_waveform: boolean
    signal_quality: boolean
    recording_quality: boolean
    respiratory_rate: boolean
    blood_pressure: boolean
    spo2: boolean
    pulse_wave_velocity: boolean
  }
  medical_notice?: string

  // Experimental vitals (added in v2 — present when backend computes estimates)
  experimental_vitals_config?: ExperimentalVitalsConfig
  experimental_vitals?: ExperimentalVitals
  raw_signal_traces?: RawSignalTraces

  // Voice check-in overlay (present when session was a voice+rPPG session)
  voice_checkin?: VoiceCheckin
  session_notes_for_user?: SessionNotesForUser
  storage?: SessionStorage
  duration_seconds?: number
  completed_reason?: string
  _is_mock?: boolean

  // Legacy compat fields (always present)
  recording: {
    duration_seconds: number
    frame_count: number
    estimated_fps: number
    video_path: string
  }
  rppg_analysis: {
    methods: {
      pos: MethodResult
      chrom: MethodResult
      green: MethodResult
    }
    consensus: {
      estimated_pulse_bpm: number | null
      pulse_category: PulseCategory
      pulse_label: string
      method_agreement: MethodAgreementLabel | string
      retake_recommended: boolean
    }
    signal_quality: {
      label: SignalQualityLabel
      best_snr: number
      wellness_score: number
    }
    check_in_trend: CheckInTrend | string
  }
  safety: {
    not_diagnostic: boolean
    disclaimer: string
    urgent_notice: string
  }
  analysis_warnings?: Record<string, string>
}
