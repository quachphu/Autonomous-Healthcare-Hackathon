import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getAppointmentDoctors,
  createAppointment,
  listAppointments,
  type DoctorOption,
  type AppointmentRead,
} from '../lib/api'

const TIME_SLOTS = ['Morning (8am–12pm)', 'Afternoon (12pm–5pm)', 'Evening (5pm–8pm)']

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-700',
  rejected: 'bg-red-50 text-red-700',
}

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const { role } = useAuth()

  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [appointments, setAppointments] = useState<AppointmentRead[]>([])
  const [loading, setLoading] = useState(true)

  const [doctorId, setDoctorId] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (role === 'doctor') navigate('/dashboard', { replace: true })
  }, [role, navigate])

  async function refresh() {
    setLoading(true)
    try {
      const [docs, appts] = await Promise.all([
        getAppointmentDoctors().catch(() => [] as DoctorOption[]),
        listAppointments().catch(() => [] as AppointmentRead[]),
      ])
      setDoctors(docs)
      setAppointments(appts)
      if (docs.length && !doctorId) setDoctorId(docs[0].id)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!doctorId) {
      setError('Please choose a doctor.')
      return
    }
    setSubmitting(true)
    try {
      await createAppointment({
        doctor_id: doctorId,
        preferred_date: preferredDate || null,
        preferred_time_slot: timeSlot || null,
        reason: reason || null,
      })
      setSuccess('Your appointment request has been sent.')
      setReason('')
      setPreferredDate('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="fade-up mb-6">
          <h1 className="text-2xl font-bold text-nn-navy">Appointments</h1>
          <p className="mt-1 text-sm text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
            Request a visit with one of your connected doctors.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-6 shadow-sm">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-nn-periwinkle border-t-nn-deep-blue" />
            <p className="text-sm text-nn-navy-light">Loading…</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Request form */}
            <form onSubmit={handleSubmit} className="fade-up rounded-2xl bg-white p-5 shadow-sm border border-nn-mist space-y-4">
              <h2 className="text-sm font-bold text-nn-navy">Request an appointment</h2>

              {doctors.length === 0 ? (
                <p className="rounded-xl bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy-light">
                  You don't have any connected doctors yet. Connect with a doctor from the Messaging
                  page first, then come back to book.
                </p>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-nn-navy">Doctor</label>
                    <select
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                      className="w-full rounded-xl border border-nn-mist bg-white px-3 py-2.5 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
                    >
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>{d.display_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-nn-navy">Preferred date</label>
                      <input
                        type="date"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        className="w-full rounded-xl border border-nn-mist bg-white px-3 py-2.5 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-nn-navy">Preferred time</label>
                      <select
                        value={timeSlot}
                        onChange={(e) => setTimeSlot(e.target.value)}
                        className="w-full rounded-xl border border-nn-mist bg-white px-3 py-2.5 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
                      >
                        {TIME_SLOTS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-nn-navy">Reason (optional)</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="e.g. follow-up on swelling and blood pressure"
                      className="w-full resize-none rounded-xl border border-nn-mist bg-white px-3 py-2.5 text-sm text-nn-navy focus:border-nn-deep-blue focus:outline-none"
                      style={{ fontFamily: 'var(--font-body)' }}
                    />
                  </div>

                  {error && <p className="text-xs text-red-600">{error}</p>}
                  {success && <p className="text-xs font-semibold text-emerald-600">{success}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-nn-deep-blue px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-nn-deep-blue-hover transition-colors disabled:opacity-60"
                  >
                    {submitting ? 'Sending…' : 'Send appointment request'}
                  </button>
                </>
              )}
            </form>

            {/* Existing requests */}
            <div className="fade-up fade-up-1">
              <h2 className="mb-3 text-sm font-bold text-nn-navy">Your requests</h2>
              {appointments.length === 0 ? (
                <p className="rounded-2xl bg-white p-5 text-sm text-nn-navy-light shadow-sm">
                  No appointment requests yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a) => (
                    <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm border border-nn-mist">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-nn-navy">Dr. {a.doctor_display_name}</p>
                          <p className="mt-0.5 text-xs text-nn-navy-light">
                            {a.preferred_date || 'Flexible date'} · {a.preferred_time_slot || 'Any time'}
                          </p>
                          {a.reason && (
                            <p className="mt-1.5 text-xs text-nn-navy" style={{ fontFamily: 'var(--font-body)' }}>
                              {a.reason}
                            </p>
                          )}
                        </div>
                        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${STATUS_STYLE[a.status] || 'bg-nn-mist text-nn-navy-light'}`}>
                          {a.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
