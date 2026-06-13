import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import hearts from '../../assets/hearts.png'

interface DailyCheckupCTAProps {
  todayCheckupComplete: boolean
  todayCheckupCount?: number
}

export default function DailyCheckupCTA({ todayCheckupComplete, todayCheckupCount = 0 }: DailyCheckupCTAProps) {
  const navigate = useNavigate()
  const { role } = useAuth()

  // Hide checkup CTA for doctors
  if (role === 'doctor') {
    return null
  }

  if (todayCheckupComplete) {
    return (
      <div className="fade-up fade-up-3 rounded-3xl bg-emerald-50 border border-emerald-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400 shadow-sm">
            <svg viewBox="0 0 20 20" fill="white" className="h-5 w-5">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.17l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-emerald-800">
              {todayCheckupCount > 1 ? `${todayCheckupCount} check-ins today` : 'Checked in today'}
            </p>
            <p className="text-sm text-emerald-600">Materna remembers every session</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/checkup/results')}
          className="w-full rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
        >
          View latest results
        </button>
        <button
          onClick={() => navigate('/checkup')}
          className="mt-2 w-full rounded-xl border border-emerald-300 bg-white px-6 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          + Start another check-in
        </button>
      </div>
    )
  }

  return (
    <div className="fade-up fade-up-3 rounded-3xl bg-gradient-to-br from-nn-pale-sky to-nn-periwinkle p-6 border border-nn-periwinkle/50">
      <div className="flex items-center gap-3 mb-4">
        <img src={hearts} alt="" aria-hidden="true" className="h-10 w-10 rounded-2xl object-cover shadow-sm" />
        <div>
          <p className="font-semibold text-nn-navy">Start your morning with Materna</p>
          <p className="text-sm text-nn-navy-light">A 30-second voice + camera check-in</p>
        </div>
      </div>
      <button
        onClick={() => navigate('/checkup')}
        className="w-full rounded-xl bg-nn-deep-blue px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-nn-deep-blue-hover transition-colors"
      >
        Start Morning Check-In
      </button>
      <p className="mt-3 text-xs text-nn-navy-light text-center">
        Talk with Materna while your camera estimates heart &amp; breathing signals
      </p>
    </div>
  )
}
