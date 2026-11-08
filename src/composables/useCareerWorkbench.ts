import { jsonClone } from '../utils/deepmerge'

export interface CareerExperience {
  id: string
  title: string
  organization: string
  period: string
  description: string
}

export interface ResumeProfile {
  id: string
  name: string
  location: string
  education: string
  workYears: string
  targetRoles: string[]
  workExperience: CareerExperience[]
  internshipExperience: CareerExperience[]
  educationExperience: CareerExperience[]
  projects: CareerExperience[]
  selfIntroduction: string
  updatedAt: number
}

export interface CareerInterviewSession {
  id: string
  profileId: string
  role: string
  company: string
  jobDescription: string
  answers: Array<{ question: string; answer: string }>
  review: string
  createdAt: number
  updatedAt: number
}

export interface CareerStorage {
  storageGet<T>(key: string, fallback: T): Promise<T>
  storageSet(key: string, value: unknown): Promise<unknown>
}

export const CAREER_PROFILES_KEY = 'local:career-workbench:profiles'
export const CAREER_INTERVIEWS_KEY = 'local:career-workbench:interviews'

export function createEmptyResumeProfile(): ResumeProfile {
  return {
    id: crypto.randomUUID(),
    name: '',
    location: '',
    education: '',
    workYears: '',
    targetRoles: [],
    workExperience: [],
    internshipExperience: [],
    educationExperience: [],
    projects: [],
    selfIntroduction: '',
    updatedAt: Date.now(),
  }
}

// Older saves could serialize Vue array proxies as numeric-keyed objects.
function storedArray<T>(value: T[]): T[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Object.keys(value).every((key) => /^\d+$/.test(key)))
    return Object.values(value) as T[]
  return []
}

export function createCareerWorkbench(storage: CareerStorage) {
  async function listProfiles(): Promise<ResumeProfile[]> {
    const profiles = await storage.storageGet<ResumeProfile[]>(CAREER_PROFILES_KEY, [])
    return profiles.map((profile) => ({
      ...profile,
      targetRoles: storedArray(profile.targetRoles),
      workExperience: storedArray(profile.workExperience),
      internshipExperience: storedArray(profile.internshipExperience),
      educationExperience: storedArray(profile.educationExperience),
      projects: storedArray(profile.projects),
    }))
  }

  async function saveProfile(profile: ResumeProfile): Promise<ResumeProfile[]> {
    const profiles = await listProfiles()
    const saved = jsonClone({ ...profile, updatedAt: Date.now() })
    const index = profiles.findIndex((item) => item.id === profile.id)
    if (index === -1) profiles.unshift(saved)
    else profiles.splice(index, 1, saved)
    await storage.storageSet(CAREER_PROFILES_KEY, profiles)
    return profiles
  }

  async function deleteProfile(id: string): Promise<ResumeProfile[]> {
    const profiles = (await listProfiles()).filter((profile) => profile.id !== id)
    await storage.storageSet(CAREER_PROFILES_KEY, profiles)
    return profiles
  }

  async function listInterviews(): Promise<CareerInterviewSession[]> {
    return storage.storageGet<CareerInterviewSession[]>(CAREER_INTERVIEWS_KEY, [])
  }

  async function saveInterview(session: CareerInterviewSession): Promise<CareerInterviewSession[]> {
    const sessions = await listInterviews()
    const saved = { ...session, updatedAt: Date.now() }
    const index = sessions.findIndex((item) => item.id === session.id)
    if (index === -1) sessions.unshift(saved)
    else sessions.splice(index, 1, saved)
    await storage.storageSet(CAREER_INTERVIEWS_KEY, sessions)
    return sessions
  }

  async function deleteInterview(id: string): Promise<CareerInterviewSession[]> {
    const sessions = (await listInterviews()).filter((session) => session.id !== id)
    await storage.storageSet(CAREER_INTERVIEWS_KEY, sessions)
    return sessions
  }

  return {
    listProfiles,
    saveProfile,
    deleteProfile,
    listInterviews,
    saveInterview,
    deleteInterview,
  }
}
