import { useState } from 'react'
import { type DoctorPatientLink } from '../../lib/api'

interface PatientListProps {
  patients: DoctorPatientLink[]
  selectedPatientId: string | null
  onSelectPatient: (patientId: string) => void
  loading: boolean
}

export default function PatientList({
  patients,
  selectedPatientId,
  onSelectPatient,
  loading,
}: PatientListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredPatients = patients.filter(p => {
    const displayName = p.patient_display_name || 'Unknown Patient'
    return displayName.toLowerCase().includes(searchQuery.toLowerCase())
  })

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-nn-navy-light text-sm">Loading patients...</p>
      </div>
    )
  }

  if (patients.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 mb-3 text-nn-navy-light">
          <circle cx="7" cy="6" r="3" />
          <circle cx="14" cy="8" r="2.5" />
          <path d="M2 17v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M12 17v-1.5a3.5 3.5 0 0 1 3.5-3.5h0a3.5 3.5 0 0 1 3.5 3.5V17" strokeLinecap="round" />
        </svg>
        <p className="text-nn-navy-light text-sm">No patients connected</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-4 border-b border-nn-mist">
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-nn-navy-light"
          >
            <circle cx="9" cy="9" r="5" />
            <path d="M13 13l4 4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search patients..."
            className="w-full rounded-xl border border-nn-mist bg-white pl-9 pr-4 py-2 text-sm text-nn-navy placeholder-nn-navy-light focus:border-nn-deep-blue focus:outline-none"
          />
        </div>
      </div>

      {/* Patient list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredPatients.length === 0 ? (
          <p className="text-center text-nn-navy-light text-sm py-4">
            No patients found
          </p>
        ) : (
          filteredPatients.map(patient => {
            const displayName = patient.patient_display_name || 'Unknown Patient'
            const isSelected = selectedPatientId === patient.patient_id

            return (
              <button
                key={patient.patient_id}
                onClick={() => onSelectPatient(patient.patient_id)}
                className={[
                  'w-full text-left rounded-xl p-3 transition-all',
                  isSelected
                    ? 'bg-nn-deep-blue text-white shadow-sm'
                    : 'bg-white hover:bg-nn-pale-sky border border-nn-mist',
                ].join(' ')}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold flex-shrink-0',
                      isSelected ? 'bg-white/20 text-white' : 'bg-nn-deep-blue text-white',
                    ].join(' ')}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={[
                      'font-medium truncate',
                      isSelected ? 'text-white' : 'text-nn-navy',
                    ].join(' ')}>
                      {displayName}
                    </p>
                    <p className={[
                      'text-xs truncate',
                      isSelected ? 'text-white/80' : 'text-nn-navy-light',
                    ].join(' ')}>
                      Patient
                    </p>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
