import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getUserHealthRecord, updateUserHealthRecord, type HealthRecord } from '../../lib/api'

interface PatientHealthFormProps {
  patientId: string
}

const MOCK_HEALTH_RECORD: HealthRecord = {
  user_id: 'demo-patient-1',
  data: {
    gestational_week: 33,
    due_date: '2026-07-15',
    blood_type: 'A+',
    care_team: 'Dr. Rivera, RN Johnson',
    risk_factors: ['Gestational diabetes'],
    allergies: ['Penicillin'],
    medications: ['Prenatal vitamins', 'Iron supplement'],
    notes: 'Patient is doing well. Monitoring glucose levels regularly.',
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export default function PatientHealthForm({ patientId }: PatientHealthFormProps) {
  const { isDemoMode } = useAuth()
  const [healthRecord, setHealthRecord] = useState<HealthRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form state
  const [gestationalWeek, setGestationalWeek] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [bloodType, setBloodType] = useState('')
  const [careTeam, setCareTeam] = useState('')
  const [riskFactors, setRiskFactors] = useState('')
  const [allergies, setAllergies] = useState('')
  const [medications, setMedications] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (isDemoMode) {
      setHealthRecord(MOCK_HEALTH_RECORD)
      const data = MOCK_HEALTH_RECORD.data || {}
      setGestationalWeek(data.gestational_week?.toString() || '')
      setDueDate(data.due_date || '')
      setBloodType(data.blood_type || '')
      setCareTeam(data.care_team || '')
      setRiskFactors(Array.isArray(data.risk_factors) ? data.risk_factors.join(', ') : '')
      setAllergies(Array.isArray(data.allergies) ? data.allergies.join(', ') : '')
      setMedications(Array.isArray(data.medications) ? data.medications.join(', ') : '')
      setNotes(data.notes || '')
      setLoading(false)
    } else {
      loadHealthRecord()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, isDemoMode])

  async function loadHealthRecord() {
    try {
      setLoading(true)
      const record = await getUserHealthRecord(patientId)
      setHealthRecord(record)

      // Populate form fields
      const data = record.data || {}
      setGestationalWeek(data.gestational_week?.toString() || '')
      setDueDate(data.due_date || '')
      setBloodType(data.blood_type || '')
      setCareTeam(data.care_team || '')
      setRiskFactors(Array.isArray(data.risk_factors) ? data.risk_factors.join(', ') : '')
      setAllergies(Array.isArray(data.allergies) ? data.allergies.join(', ') : '')
      setMedications(Array.isArray(data.medications) ? data.medications.join(', ') : '')
      setNotes(data.notes || '')
    } catch (err: any) {
      setError(err.message || 'Failed to load health record')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)
      setSuccessMessage(null)

      if (isDemoMode) {
        // Simulate save in demo mode
        await new Promise(resolve => setTimeout(resolve, 500))
        setSuccessMessage('Demo mode: Changes not saved (read-only)')
        setTimeout(() => setSuccessMessage(null), 3000)
        return
      }

      const data: Record<string, any> = {}

      if (gestationalWeek) data.gestational_week = parseInt(gestationalWeek)
      if (dueDate) data.due_date = dueDate
      if (bloodType) data.blood_type = bloodType
      if (careTeam) data.care_team = careTeam
      if (riskFactors) data.risk_factors = riskFactors.split(',').map(s => s.trim()).filter(Boolean)
      if (allergies) data.allergies = allergies.split(',').map(s => s.trim()).filter(Boolean)
      if (medications) data.medications = medications.split(',').map(s => s.trim()).filter(Boolean)
      if (notes) data.notes = notes

      await updateUserHealthRecord(patientId, data)
      setSuccessMessage('Health record updated successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update health record')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-nn-navy-light">Loading health record...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p className="text-emerald-800 text-sm">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gestational Week */}
        <div>
          <label className="block text-sm font-medium text-nn-navy mb-1">
            Gestational Week
          </label>
          <input
            type="number"
            value={gestationalWeek}
            onChange={e => setGestationalWeek(e.target.value)}
            placeholder="e.g. 33"
            className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
          />
        </div>

        {/* Due Date */}
        <div>
          <label className="block text-sm font-medium text-nn-navy mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
          />
        </div>

        {/* Blood Type */}
        <div>
          <label className="block text-sm font-medium text-nn-navy mb-1">
            Blood Type
          </label>
          <select
            value={bloodType}
            onChange={e => setBloodType(e.target.value)}
            className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
          >
            <option value="">Select blood type</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
          </select>
        </div>

        {/* Care Team */}
        <div>
          <label className="block text-sm font-medium text-nn-navy mb-1">
            Care Team
          </label>
          <input
            type="text"
            value={careTeam}
            onChange={e => setCareTeam(e.target.value)}
            placeholder="e.g. Dr. Rivera, RN Johnson"
            className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
          />
        </div>
      </div>

      {/* Risk Factors */}
      <div>
        <label className="block text-sm font-medium text-nn-navy mb-1">
          Risk Factors
        </label>
        <input
          type="text"
          value={riskFactors}
          onChange={e => setRiskFactors(e.target.value)}
          placeholder="Comma-separated, e.g. Gestational diabetes, High blood pressure"
          className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
        />
        <p className="text-xs text-nn-navy-light mt-1">
          Separate multiple factors with commas
        </p>
      </div>

      {/* Allergies */}
      <div>
        <label className="block text-sm font-medium text-nn-navy mb-1">
          Allergies
        </label>
        <input
          type="text"
          value={allergies}
          onChange={e => setAllergies(e.target.value)}
          placeholder="Comma-separated, e.g. Penicillin, Latex"
          className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
        />
        <p className="text-xs text-nn-navy-light mt-1">
          Separate multiple allergies with commas
        </p>
      </div>

      {/* Medications */}
      <div>
        <label className="block text-sm font-medium text-nn-navy mb-1">
          Medications
        </label>
        <input
          type="text"
          value={medications}
          onChange={e => setMedications(e.target.value)}
          placeholder="Comma-separated, e.g. Prenatal vitamins, Iron supplement"
          className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
        />
        <p className="text-xs text-nn-navy-light mt-1">
          Separate multiple medications with commas
        </p>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-nn-navy mb-1">
          Clinical Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Additional clinical notes or observations..."
          rows={4}
          className="w-full rounded-xl border border-nn-mist bg-white px-4 py-2 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none resize-none"
        />
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-nn-deep-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-nn-deep-blue-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
