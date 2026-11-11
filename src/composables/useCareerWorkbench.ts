import { jsonClone } from '../utils/deepmerge'
import type { PublicCareerSource } from './publicResearch'

export interface CareerExperience {
  id: string
  title: string
  organization: string
  period: string
  description: string
}

export interface ResumeProfile {
  revision?: number
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
  revision?: number
  id: string
  profileId: string
  role: string
  company: string
  jobDescription: string
  answers: Array<{ question: string; answer: string }>
  review: string
  createdAt: number
  updatedAt: number
  currentQuestion?: string
  draftAnswer?: string
  profileSnapshot?: ResumeProfile
}

export interface CareerStorage {
  storageGet<T>(key: string, fallback: T): Promise<T>
  storageSet(key: string, value: unknown): Promise<unknown>
  careerWrite?(command: CareerWrite): Promise<unknown>
}

export interface CareerAdviceRecord {
  jobDescription?: string
  id: string
  revision?: number
  kind: 'analysis' | 'research'
  profileSnapshot: ResumeProfile
  role: string
  model: string
  sources: PublicCareerSource[]
  text: string
  status: 'complete' | 'partial'
  done: boolean
  createdAt: number
  updatedAt: number
}

export type CareerWrite = { kind: 'profile'; value: ResumeProfile } | { kind: 'interview'; value: CareerInterviewSession } | { kind: 'advice'; value: CareerAdviceRecord } | { kind: 'delete-profile' | 'delete-interview' | 'delete-advice'; id: string; revision?: number }
const queues = new WeakMap<CareerStorage, Promise<unknown>>()
function serial<T>(storage: CareerStorage, action: () => Promise<T>): Promise<T> {
  const result = (queues.get(storage) ?? Promise.resolve()).then(action, action)
  queues.set(storage, result.catch(() => undefined))
  return result
}
function checkRevision(existing: { revision?: number } | undefined, incoming: { revision?: number }) {
  if (incoming.revision !== undefined && (!existing || (existing.revision ?? 0) !== incoming.revision))
    throw new Error('记录已在另一页面修改或删除，请刷新后重新打开，当前输入仍保留。')
}

export const CAREER_PROFILES_KEY = 'local:career-workbench:profiles'
export const CAREER_INTERVIEWS_KEY = 'local:career-workbench:interviews'
export const CAREER_ADVICE_KEY = 'local:career-workbench:advice'

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
  async function writeRecord<T extends { id: string; revision?: number; updatedAt: number }>(key: string, list: () => Promise<T[]>, record: T): Promise<T[]> {
    const records = await list()
    const index = records.findIndex((item) => item.id === record.id)
    checkRevision(records[index], record)
    const saved = jsonClone({ ...record, revision: (records[index]?.revision ?? 0) + 1, updatedAt: Date.now() })
    if (index === -1) records.unshift(saved)
    else records.splice(index, 1, saved)
    await storage.storageSet(key, records)
    return records
  }
  async function removeRecord<T extends { id: string; revision?: number }>(key: string, list: () => Promise<T[]>, id: string, revision?: number): Promise<T[]> {
    const records = await list()
    if (revision !== undefined) checkRevision(records.find((item) => item.id === id), { revision })
    const next = records.filter((item) => item.id !== id)
    await storage.storageSet(key, next)
    return next
  }
  async function listProfiles(): Promise<ResumeProfile[]> {
    const profiles = await storage.storageGet<ResumeProfile[]>(CAREER_PROFILES_KEY, [])
    return storedArray(profiles).map((profile) => ({
      ...profile,
      revision: profile.revision ?? 0,
      targetRoles: storedArray(profile.targetRoles),
      workExperience: storedArray(profile.workExperience),
      internshipExperience: storedArray(profile.internshipExperience),
      educationExperience: storedArray(profile.educationExperience),
      projects: storedArray(profile.projects),
    }))
  }

  function writeProfile(profile: ResumeProfile) {
    return writeRecord(CAREER_PROFILES_KEY, listProfiles, profile)
  }

  function removeProfile(id: string, revision?: number) {
    return removeRecord(CAREER_PROFILES_KEY, listProfiles, id, revision)
  }

  async function listInterviews(): Promise<CareerInterviewSession[]> {
    const sessions = await storage.storageGet<CareerInterviewSession[]>(CAREER_INTERVIEWS_KEY, [])
    return storedArray(sessions).map((session) => ({ ...session, revision: session.revision ?? 0, answers: storedArray(session.answers), currentQuestion: session.currentQuestion ?? '', draftAnswer: session.draftAnswer ?? '' }))
  }

  function writeInterview(session: CareerInterviewSession) {
    return writeRecord(CAREER_INTERVIEWS_KEY, listInterviews, session)
  }

  function removeInterview(id: string, revision?: number) {
    return removeRecord(CAREER_INTERVIEWS_KEY, listInterviews, id, revision)
  }
  async function listAdvice(): Promise<CareerAdviceRecord[]> {
    return storedArray(await storage.storageGet<CareerAdviceRecord[]>(CAREER_ADVICE_KEY, [])).map((item) => ({ ...item, revision: item.revision ?? 0, sources: storedArray(item.sources) }))
  }
  function writeAdvice(record: CareerAdviceRecord) {
    return writeRecord(CAREER_ADVICE_KEY, listAdvice, record)
  }
  function removeAdvice(id: string, revision?: number) {
    return removeRecord(CAREER_ADVICE_KEY, listAdvice, id, revision)
  }

  return {
    listProfiles,
    saveProfile: (profile: ResumeProfile) => storage.careerWrite ? storage.careerWrite({ kind: 'profile', value: jsonClone(profile) }) as Promise<ResumeProfile[]> : serial(storage, () => writeProfile(profile)),
    deleteProfile: (id: string, revision?: number) => storage.careerWrite ? storage.careerWrite({ kind: 'delete-profile', id, revision }) as Promise<ResumeProfile[]> : serial(storage, () => removeProfile(id, revision)),
    listInterviews,
    listAdvice,
    saveAdvice: (record: CareerAdviceRecord) => storage.careerWrite ? storage.careerWrite({ kind: 'advice', value: jsonClone(record) }) as Promise<CareerAdviceRecord[]> : serial(storage, () => writeAdvice(record)),
    deleteAdvice: (id: string, revision?: number) => storage.careerWrite ? storage.careerWrite({ kind: 'delete-advice', id, revision }) as Promise<CareerAdviceRecord[]> : serial(storage, () => removeAdvice(id, revision)),
    saveInterview: (session: CareerInterviewSession) => storage.careerWrite ? storage.careerWrite({ kind: 'interview', value: jsonClone(session) }) as Promise<CareerInterviewSession[]> : serial(storage, () => writeInterview(session)),
    deleteInterview: (id: string, revision?: number) => storage.careerWrite ? storage.careerWrite({ kind: 'delete-interview', id, revision }) as Promise<CareerInterviewSession[]> : serial(storage, () => removeInterview(id, revision)),
  }
}
