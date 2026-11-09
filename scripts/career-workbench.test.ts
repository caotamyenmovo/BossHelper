import { expect, test } from 'bun:test'

import { reactive } from 'vue'

import {
  CAREER_PROFILES_KEY,
  createCareerWorkbench,
  createEmptyResumeProfile,
} from '../src/composables/useCareerWorkbench'

function memoryStorage() {
  const values = new Map<string, unknown>()
  return {
    values,
    async storageGet<T>(key: string, fallback: T): Promise<T> {
      return structuredClone((values.get(key) as T | undefined) ?? fallback)
    },
    async storageSet(key: string, value: unknown) {
      values.set(key, structuredClone(value))
    },
  }
}

test('two workbench pages can save different profiles concurrently without losing records', async () => {
  const storage = memoryStorage()
  const first = createCareerWorkbench(storage)
  const second = createCareerWorkbench(storage)
  const a = { ...createEmptyResumeProfile(), name: 'Alice' }
  const b = { ...createEmptyResumeProfile(), name: 'Bob' }
  await Promise.all([first.saveProfile(a), second.saveProfile(b)])
  expect((await first.listProfiles()).map((item) => item.name).sort()).toEqual(['Alice', 'Bob'])
})

test('stale edits cannot overwrite another page or resurrect a deleted profile', async () => {
  const workbench = createCareerWorkbench(memoryStorage())
  const [saved] = await workbench.saveProfile(createEmptyResumeProfile())
  await workbench.saveProfile({ ...saved!, name: '另一页面修改' })
  await expect(workbench.saveProfile({ ...saved!, name: '旧编辑' })).rejects.toThrow('另一页面')
  const latest = (await workbench.listProfiles())[0]!
  await workbench.deleteProfile(latest.id, latest.revision)
  await expect(workbench.saveProfile(latest)).rejects.toThrow('删除')
  expect(await workbench.listProfiles()).toEqual([])
})

test('resume profiles persist, update, and delete through local storage', async () => {
  const storage = memoryStorage()
  const workbench = createCareerWorkbench(storage)
  const profile = createEmptyResumeProfile()
  profile.name = 'Lin'
  profile.targetRoles = ['前端开发']

  await workbench.saveProfile(profile)
  expect((await workbench.listProfiles()).map(({ name }) => name)).toEqual(['Lin'])

  await workbench.saveProfile({ ...profile, name: 'Lin Chen' })
  expect((await workbench.listProfiles()).map(({ name }) => name)).toEqual(['Lin Chen'])
  expect(storage.values.has(CAREER_PROFILES_KEY)).toBe(true)

  expect(await workbench.deleteProfile(profile.id)).toEqual([])
})

test('profile reads default to an empty local list', async () => {
  const workbench = createCareerWorkbench(memoryStorage())
  expect(await workbench.listProfiles()).toEqual([])
})

test('advice records preserve their resume and source evidence after reload and can be deleted', async () => {
  const storage = memoryStorage()
  const first = createCareerWorkbench(storage)
  const profile = createEmptyResumeProfile()
  profile.name = '分析时姓名'
  await first.saveAdvice({ id: 'advice-1', profileSnapshot: profile, role: '前端', model: '现有模型', kind: 'research', text: '建议改写', status: 'complete', sources: [{ title: '来源', author: '作者', url: 'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa', excerpt: '原文', contentKind: 'visible-note' }], createdAt: 1, updatedAt: 1, done: false })
  profile.name = '后来修改'
  const second = createCareerWorkbench(storage)
  const [record] = await second.listAdvice()
  expect(record?.profileSnapshot.name).toBe('分析时姓名')
  expect(record?.sources[0]?.excerpt).toBe('原文')
  await second.deleteAdvice('advice-1', record?.revision)
  expect(await first.listAdvice()).toEqual([])
})

test('interview answers and review persist locally and can be deleted', async () => {
  const workbench = createCareerWorkbench(memoryStorage())
  const session = {
    id: 'session-1',
    profileId: 'profile-1',
    role: '前端开发',
    company: '',
    jobDescription: '',
    answers: [{ question: '介绍一个项目', answer: '我负责了前端架构' }],
    review: '亮点：说明了自己的职责。',
    createdAt: 1,
    updatedAt: 1,
  }

  await workbench.saveInterview(session)
  expect(await workbench.listInterviews()).toMatchObject([
    { id: 'session-1', answers: session.answers, review: session.review },
  ])
  expect(await workbench.deleteInterview(session.id)).toEqual([])
})

test('legacy profiles gain an empty internship field without losing work history', async () => {
  const old = {
    ...createEmptyResumeProfile(),
    name: '张三',
    workExperience: [
      {
        id: 'old-work',
        title: '工程师',
        organization: '甲公司',
        period: '2020-2024',
        description: '负责开发',
      },
    ],
  }
  delete (old as Partial<typeof old>).internshipExperience
  let saved: unknown = [old]
  const workbench = createCareerWorkbench({
    storageGet: async <T>(_key: string, _fallback: T) => saved as T,
    storageSet: async (_key: string, value: unknown) => {
      saved = value
    },
  })
  const [profile] = await workbench.listProfiles()
  expect(profile?.internshipExperience).toEqual([])
  expect(profile?.workExperience[0]?.id).toBe('old-work')
  profile!.internshipExperience.push({
    id: 'intern',
    title: '开发实习生',
    organization: '乙公司',
    period: '2019-2020',
    description: '参与开发',
  })
  await workbench.saveProfile(profile!)
  expect((await workbench.listProfiles())[0]?.internshipExperience[0]?.title).toBe('开发实习生')
})

test('saving a reactive resume passes plain arrays to browser storage', async () => {
  const workbench = createCareerWorkbench(memoryStorage())
  const profile = reactive(createEmptyResumeProfile())
  profile.targetRoles = ['安全工程师', 'Java Developer']
  profile.internshipExperience.push({
    id: 'intern',
    title: '实习生',
    organization: '甲公司',
    period: '',
    description: '',
  })
  await workbench.saveProfile(profile)
  const [saved] = await workbench.listProfiles()
  expect(saved?.targetRoles).toEqual(['安全工程师', 'Java Developer'])
  expect(saved?.internshipExperience[0]?.title).toBe('实习生')
})

test('reads numeric-keyed arrays left by earlier reactive saves', async () => {
  const storage = memoryStorage()
  storage.values.set(CAREER_PROFILES_KEY, [
    {
      ...createEmptyResumeProfile(),
      targetRoles: { 0: '安全工程师', 1: 'Java Developer' },
      internshipExperience: {
        0: { id: 'old', title: '实习生', organization: '甲公司', period: '', description: '' },
      },
      workExperience: {},
    },
  ])
  const [profile] = await createCareerWorkbench(storage).listProfiles()
  expect(profile?.targetRoles).toEqual(['安全工程师', 'Java Developer'])
  expect(profile?.workExperience).toEqual([])
  expect(profile?.internshipExperience.map((item) => item.title)).toEqual(['实习生'])
})
