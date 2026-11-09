import { expect, test } from 'bun:test'
import { createCareerAssistant } from '../src/composables/careerAi'
import { createCareerInterview } from '../src/composables/careerInterview'
import { createCareerWorkbench, createEmptyResumeProfile } from '../src/composables/useCareerWorkbench'

function fixture(complete: (prompt: string) => Promise<string> = async () => '第一题') {
  const values = new Map<string, unknown>()
  let fail = false
  const workbench = createCareerWorkbench({
    storageGet: async <T>(key: string, fallback: T): Promise<T> => structuredClone(values.get(key) ?? fallback) as T,
    storageSet: async (key, value) => {
      if (fail) throw new Error('磁盘写入失败')
      values.set(key, structuredClone(value))
    },
  })
  const assistant = createCareerAssistant(complete)
  return { workbench, assistant, flow: createCareerInterview(workbench, assistant), fail: (value: boolean) => { fail = value } }
}

test('a late question cannot enter another interview', async () => {
  let resolve!: (value: string) => void
  const f = fixture(() => new Promise<string>((done) => { resolve = done }))
  const pending = f.flow.start({ profile: createEmptyResumeProfile(), role: '前端', company: '', jobDescription: '' })
  while (!resolve) await new Promise((done) => setTimeout(done, 0))
  await f.flow.close()
  const second = { id: 'B', profileId: 'p', role: '后端', company: '', jobDescription: '', answers: [], review: '', createdAt: 1, updatedAt: 1 }
  await f.workbench.saveInterview(second)
  await f.flow.open((await f.workbench.listInterviews()).find((item) => item.id === 'B')!)
  resolve('A的迟到题目')
  await pending
  expect(f.flow.state.session?.id).toBe('B')
  expect(f.flow.state.session?.currentQuestion).toBe('')
})

test('question and answer draft survive reopening; failed submit preserves the answer', async () => {
  const f = fixture()
  await f.flow.start({ profile: createEmptyResumeProfile(), role: '前端', company: '甲', jobDescription: 'Vue' })
  f.flow.setAnswer('尚未提交的回答')
  await f.flow.flush()
  await f.flow.close()
  const restored = createCareerInterview(f.workbench, f.assistant)
  await restored.open((await f.workbench.listInterviews())[0]!)
  expect(restored.state.session?.currentQuestion).toBe('第一题')
  expect(restored.state.session?.draftAnswer).toBe('尚未提交的回答')
  f.fail(true)
  await restored.submit()
  expect(restored.state.session?.draftAnswer).toBe('尚未提交的回答')
  expect(restored.state.session?.answers).toEqual([])
  expect(restored.state.error).toContain('提交失败')
  f.fail(false)
  await restored.submit()
  expect((await f.workbench.listInterviews())[0]?.answers).toEqual([{ question: '第一题', answer: '尚未提交的回答' }])
})

test('interview questions keep their starting resume even when the source is edited', async () => {
  const prompts: string[] = []
  const f = fixture(async (prompt) => { prompts.push(prompt); return '问题' })
  const profile = createEmptyResumeProfile()
  profile.name = '开始时的姓名'
  await f.flow.start({ profile, role: '前端', company: '', jobDescription: '' })
  profile.name = '后来修改的姓名'
  f.flow.setAnswer('回答')
  await f.flow.submit()
  await f.flow.next()
  expect(prompts[1]).toContain('开始时的姓名')
  expect(prompts[1]).not.toContain('后来修改的姓名')
})

test('failed autosave prevents exit until the current answer can be saved', async () => {
  const f = fixture()
  await f.flow.start({ profile: createEmptyResumeProfile(), role: '前端', company: '', jobDescription: '' })
  f.fail(true)
  f.flow.setAnswer('不能丢失的回答')
  await f.flow.flush()
  expect(await f.flow.close()).toBe(false)
  expect(f.flow.state.session?.draftAnswer).toBe('不能丢失的回答')
  f.fail(false)
  expect(await f.flow.close()).toBe(true)
  expect((await f.workbench.listInterviews())[0]?.draftAnswer).toBe('不能丢失的回答')
})

test('fast typing followed by submit saves the latest answer without reviving its draft', async () => {
  const f = fixture()
  await f.flow.start({ profile: createEmptyResumeProfile(), role: '前端', company: '', jobDescription: '' })
  for (const answer of ['我', '我的', '我的完整回答']) f.flow.setAnswer(answer)
  await f.flow.submit()
  await f.flow.flush()
  const saved = (await f.workbench.listInterviews())[0]!
  expect(saved.answers).toEqual([{ question: '第一题', answer: '我的完整回答' }])
  expect(saved.draftAnswer).toBe('')
})
