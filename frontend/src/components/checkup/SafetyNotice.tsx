export default function SafetyNotice() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex gap-2.5">
        <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 2L2 17h16L10 2Z" strokeLinejoin="round" />
          <path d="M10 8v4M10 14v.5" strokeLinecap="round" />
        </svg>
        <div>
          <p className="text-xs font-semibold text-amber-800">Important safety information</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
            This checkup estimates wellness signals from your camera.{' '}
            <strong>It is not a diagnosis.</strong> Seek <strong>urgent medical care</strong> if you
            experience chest pain, trouble breathing, fainting, seizure, severe headache, vision
            changes, heavy bleeding, or reduced fetal movement.
          </p>
        </div>
      </div>
    </div>
  )
}
