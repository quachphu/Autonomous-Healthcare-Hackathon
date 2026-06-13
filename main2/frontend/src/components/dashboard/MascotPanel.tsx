// Anime baby mascot — replaces capybara

const SKIN = '#FFE8D5'
const SKIN_EAR = '#FED7B8'
const HAIR = '#2C1810'
const EYE_IRIS = '#1D4ED8'
const EYE_DARK = '#0F172A'
const CHEEK = '#FCA5A5'
const JERSEY = '#1D4ED8'

type Mood = 'superHappy' | 'happy' | 'sad' | 'superSad'

function Eyes({ mood }: { mood: Mood }) {
  if (mood === 'superHappy') {
    return (
      <g>
        <path d="M49 86 Q63 72 77 86" stroke={HAIR} strokeWidth="5.5" fill="none" strokeLinecap="round"/>
        <path d="M103 86 Q117 72 131 86" stroke={HAIR} strokeWidth="5.5" fill="none" strokeLinecap="round"/>
      </g>
    )
  }
  if (mood === 'superSad') {
    return (
      <g>
        <path d="M49 80 Q63 93 77 80" stroke={HAIR} strokeWidth="5.5" fill="none" strokeLinecap="round"/>
        <path d="M103 80 Q117 93 131 80" stroke={HAIR} strokeWidth="5.5" fill="none" strokeLinecap="round"/>
        <path d="M56 88 Q53 98 56 106 Q59 98 56 88Z" fill="#93C5FD"/>
        <path d="M62 90 Q59 99 62 106 Q65 99 62 90Z" fill="#93C5FD" opacity="0.65"/>
        <path d="M118 88 Q115 98 118 106 Q121 98 118 88Z" fill="#93C5FD"/>
        <path d="M124 90 Q121 99 124 106 Q127 99 124 90Z" fill="#93C5FD" opacity="0.65"/>
      </g>
    )
  }
  const droopy = mood === 'sad'
  return (
    <g>
      {/* Left eye */}
      <ellipse cx="63" cy="84" rx="15" ry={droopy ? 14 : 17} fill="white"/>
      <circle cx="63" cy="85" r="10.5" fill={EYE_IRIS}/>
      <circle cx="63" cy="85" r="6" fill={EYE_DARK}/>
      <circle cx="68" cy="80" r="3.5" fill="white"/>
      <circle cx="59" cy="87" r="1.5" fill="white" opacity="0.6"/>
      <path d={droopy ? 'M49 80 Q63 73 77 82' : 'M49 79 Q63 72 77 79'}
            stroke={HAIR} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {droopy && <path d="M55 93 Q52 102 55 109 Q58 102 55 93Z" fill="#93C5FD"/>}

      {/* Right eye */}
      <ellipse cx="117" cy="84" rx="15" ry={droopy ? 14 : 17} fill="white"/>
      <circle cx="117" cy="85" r="10.5" fill={EYE_IRIS}/>
      <circle cx="117" cy="85" r="6" fill={EYE_DARK}/>
      <circle cx="122" cy="80" r="3.5" fill="white"/>
      <circle cx="113" cy="87" r="1.5" fill="white" opacity="0.6"/>
      <path d={droopy ? 'M103 80 Q117 73 131 82' : 'M103 79 Q117 72 131 79'}
            stroke={HAIR} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </g>
  )
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === 'superHappy') {
    return (
      <g>
        <path d="M66 117 Q90 140 114 117" fill="#E85D75"/>
        <path d="M69 119 Q90 134 111 119" fill="white"/>
        <path d="M66 117 Q90 140 114 117" stroke="#C4375A" strokeWidth="2" fill="none" strokeLinecap="round"/>
      </g>
    )
  }
  if (mood === 'happy') {
    return <path d="M72 118 Q90 132 108 118" stroke="#E85D75" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
  }
  if (mood === 'sad') {
    return <path d="M74 122 Q90 112 106 122" stroke="#E85D75" strokeWidth="3" fill="none" strokeLinecap="round"/>
  }
  return (
    <g>
      <path d="M68 126 Q90 110 112 126" stroke="#E85D75" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <path d="M78 131 Q90 127 102 131" stroke="#E85D75" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6"/>
    </g>
  )
}

function AnimeBaby({ mood }: { mood: Mood }) {
  const celebrating = mood === 'superHappy'
  return (
    <svg viewBox="0 0 180 210" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {celebrating && (
        <>
          <circle cx="22" cy="48" r="5" fill="#F59E0B" opacity="0.85"/>
          <circle cx="18" cy="40" r="2.5" fill="#F59E0B" opacity="0.5"/>
          <circle cx="158" cy="35" r="6" fill="#F59E0B" opacity="0.85"/>
          <circle cx="163" cy="43" r="3" fill="#F59E0B" opacity="0.5"/>
          <circle cx="12" cy="130" r="4" fill="#93C5FD" opacity="0.7"/>
          <circle cx="168" cy="125" r="4" fill="#FB7185" opacity="0.7"/>
          <circle cx="8" cy="108" r="3" fill="#FCD34D" opacity="0.6"/>
          <circle cx="172" cy="100" r="3" fill="#A78BFA" opacity="0.6"/>
        </>
      )}

      {/* Ears */}
      <ellipse cx="20" cy="95" rx="17" ry="20" fill={SKIN_EAR}/>
      <ellipse cx="20" cy="95" rx="10" ry="13" fill="#FFB89A"/>
      <ellipse cx="160" cy="95" rx="17" ry="20" fill={SKIN_EAR}/>
      <ellipse cx="160" cy="95" rx="10" ry="13" fill="#FFB89A"/>

      {/* Head */}
      <ellipse cx="90" cy="93" rx="71" ry="67" fill={SKIN}/>

      {/* Hair */}
      <path d="M26 78 Q32 28 90 26 Q148 28 154 78 Q138 46 90 44 Q42 46 26 78Z" fill={HAIR}/>
      <path d="M60 36 Q70 30 82 34" stroke="#4A2E1F" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.45"/>

      {/* Athletic headband */}
      <path d="M28 72 Q90 62 152 72" stroke={JERSEY} strokeWidth="9" fill="none" strokeLinecap="round"/>
      <path d="M28 72 Q90 62 152 72" stroke="#60A5FA" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="8 6"/>

      {/* Cheeks */}
      <ellipse cx="47" cy="107" rx="16" ry="9.5" fill={CHEEK} fillOpacity="0.58"/>
      <ellipse cx="133" cy="107" rx="16" ry="9.5" fill={CHEEK} fillOpacity="0.58"/>

      {/* Nose */}
      <circle cx="90" cy="106" r="3.5" fill="#E8966E"/>

      <Eyes mood={mood}/>
      <Mouth mood={mood}/>

      {/* Arms */}
      {celebrating ? (
        <>
          <path d="M30 162 Q15 140 20 118" stroke={SKIN_EAR} strokeWidth="15" strokeLinecap="round" fill="none"/>
          <path d="M150 162 Q165 140 160 118" stroke={SKIN_EAR} strokeWidth="15" strokeLinecap="round" fill="none"/>
        </>
      ) : (
        <>
          <path d="M30 162 Q18 150 22 138" stroke={SKIN_EAR} strokeWidth="15" strokeLinecap="round" fill="none"/>
          <path d="M150 162 Q162 150 158 138" stroke={SKIN_EAR} strokeWidth="15" strokeLinecap="round" fill="none"/>
        </>
      )}

      {/* Jersey */}
      <path d="M30 162 L18 148 L44 140 L90 155 L136 140 L162 148 L150 162 Q90 180 30 162Z" fill={JERSEY}/>
      <path d="M64 143 L64 160" stroke="#93C5FD" strokeWidth="2" fill="none" opacity="0.55"/>
      <path d="M116 143 L116 160" stroke="#93C5FD" strokeWidth="2" fill="none" opacity="0.55"/>
      <text x="90" y="171" textAnchor="middle" fontSize="17" fontWeight="bold" fill="white" fontFamily="Arial, Helvetica, sans-serif">1</text>

      {/* Hands */}
      {celebrating ? (
        <>
          <circle cx="18" cy="118" r="10" fill={SKIN_EAR}/>
          <circle cx="162" cy="118" r="10" fill={SKIN_EAR}/>
        </>
      ) : (
        <>
          <circle cx="20" cy="137" r="10" fill={SKIN_EAR}/>
          <circle cx="160" cy="137" r="10" fill={SKIN_EAR}/>
        </>
      )}
    </svg>
  )
}

function getMood(mascotHealth: number): { mood: Mood; message: string } {
  if (mascotHealth <= 25) return { mood: 'superSad',   message: "Mia needs your check-in..." }
  if (mascotHealth <= 50) return { mood: 'sad',        message: "Mia misses you!" }
  if (mascotHealth <= 75) return { mood: 'happy',      message: "Mia is cheering for you!" }
  return                         { mood: 'superHappy', message: "Mia is so proud of you!" }
}

interface MascotPanelProps {
  mascotHealth: number
}

// Still exported for legacy callers
export function getCapybaraState(mascotHealth: number) {
  const { mood, message } = getMood(mascotHealth)
  return { image: '', alt: 'Mia the anime baby', message, mood }
}

export default function MascotPanel({ mascotHealth }: MascotPanelProps) {
  const { mood, message } = getMood(mascotHealth)

  return (
    <div className="fade-up fade-up-1 flex flex-col items-center text-center">
      <div className="w-full max-w-[260px]">
        <AnimeBaby mood={mood}/>
      </div>
      <p
        className="mt-3 text-2xl text-nn-deep-blue leading-snug px-2"
        style={{ fontFamily: "'Caveat', cursive", fontWeight: 700 }}
      >
        {message}
      </p>
      <div className="mt-2 w-full max-w-[200px]">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-700 transition-all duration-500"
            style={{ width: `${mascotHealth}%` }}
          />
        </div>
        <p className="text-xs text-nn-navy-light mt-1">Mia's health: {mascotHealth}/100</p>
      </div>
    </div>
  )
}
