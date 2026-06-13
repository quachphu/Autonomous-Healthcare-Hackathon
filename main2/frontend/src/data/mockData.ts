export const mockUser = {
  name: 'Teresa',
  email: 'teresa@materna.app',
  gestationalWeek: 33,
  dueDate: '2026-07-15',
  careTeam: 'Dr. Rivera',
  riskFactors: ['Prior hypertension'],
  preferredLanguage: 'English',
  emergencyContact: 'John Nguyen  •  +1 (555) 012-3456',
  lastManualBP: '118/76 mmHg',
  lastBPDate: '2026-05-14',
}

export const mockStreak = {
  count: 1,
  lastCheckupDate: '2026-05-15',
  weeklyGoal: 7,
}

export const completedDates: string[] = [
  '2026-05-01', '2026-05-02', '2026-05-04', '2026-05-05',
  '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09',
  '2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13',
  '2026-05-14', '2026-05-15', '2026-05-16',
]

// Always reflects the actual local calendar date
export const today = new Date().toLocaleDateString('en-CA')

export const mockVitals = {
  heartRate: 91,
  respiratoryRate: 18,
  signalQuality: 'Good' as const,
  trend: 'Stable' as const,
  weeklyCompletion: 86,
  lastCheckupDate: '2026-05-15',
}

export const mockCheckupResult = {
  heartRate: 91,
  respiratoryRate: 18,
  signalQuality: 'Good' as const,
  recordingLengthSeconds: 120,
  method: 'rPPG webcam analysis',
  lightingNote: 'Good lighting detected',
  motionNote: 'Minimal motion — clean signal',
  trend: 'Similar to your weekly baseline',
  completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
}

export const mockTrendData = [
  { label: 'Mon', heartRate: 88, respiratoryRate: 17 },
  { label: 'Tue', heartRate: 90, respiratoryRate: 18 },
  { label: 'Wed', heartRate: 87, respiratoryRate: 16 },
  { label: 'Thu', heartRate: 92, respiratoryRate: 19 },
  { label: 'Fri', heartRate: 89, respiratoryRate: 17 },
  { label: 'Sat', heartRate: 91, respiratoryRate: 18 },
  { label: 'Sun', heartRate: 91, respiratoryRate: 18 },
]

export interface ChatMessage {
  id: string
  sender: 'user' | 'doctor' | 'ai'
  name: string
  text: string
  time: string
}

export const mockDoctorMessages: ChatMessage[] = [
  {
    id: 'd1',
    sender: 'doctor',
    name: 'Dr. Rivera',
    text: 'Hi Teresa, I reviewed your last checkup — your estimated heart rate and respiratory rate look stable. Keep up the daily scans!',
    time: '9:02 AM',
  },
  {
    id: 'd2',
    sender: 'user',
    name: 'Teresa',
    text: "I've been feeling a bit short of breath after climbing stairs. Should I be worried?",
    time: '9:15 AM',
  },
  {
    id: 'd3',
    sender: 'doctor',
    name: 'Dr. Rivera',
    text: 'Some breathlessness is common in the third trimester as the baby grows. However, if it comes on suddenly at rest or with chest pain or dizziness, contact us right away or go to the ER.',
    time: '9:18 AM',
  },
]

export const mockAIMessages: ChatMessage[] = [
  {
    id: 'a1',
    sender: 'ai',
    name: 'Materna AI',
    text: "Hello Teresa! I have access to your recent checkup history and the care plan from Dr. Rivera. How can I support you today?",
    time: '10:00 AM',
  },
  {
    id: 'a2',
    sender: 'user',
    name: 'Teresa',
    text: 'Why does respiratory rate matter during pregnancy?',
    time: '10:02 AM',
  },
  {
    id: 'a3',
    sender: 'ai',
    name: 'Materna AI',
    text: "Respiratory rate can change when the body is under stress or when circulation is affected. During pregnancy, symptoms like persistent shortness of breath, chest pain, dizziness, or fainting should be reported to your care team promptly. Based on your recent checkups, your respiratory rate has been 16–19 breaths/min — within a typical range. I can help summarize your data and care notes, but I cannot diagnose. If you're concerned, please contact Dr. Rivera.",
    time: '10:02 AM',
  },
]

export const mockRAGContext = {
  gestationalWeek: 33,
  riskFactors: ['Prior hypertension'],
  lastCheckup: { heartRate: 91, respiratoryRate: 18, signalQuality: 'Good' },
  providerInstruction:
    'Contact care team if: shortness of breath at rest, chest pain, severe headache, vision changes, or BP ≥ 140/90.',
}
