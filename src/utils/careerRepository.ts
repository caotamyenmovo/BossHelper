import type { CareerWrite } from '../composables/useCareerWorkbench'
import { createCareerWorkbench } from '../composables/useCareerWorkbench'

type Api = Pick<typeof import('#imports').browser, 'runtime' | 'storage'>
export function registerCareerRepository(api: Api) {
  const repository = createCareerWorkbench({
    storageGet: async <T>(key: string, fallback: T) => ((await api.storage.local.get(key.replace(/^local:/, '')))[key.replace(/^local:/, '')] ?? fallback) as T,
    storageSet: (key, value) => api.storage.local.set({ [key.replace(/^local:/, '')]: value }),
  })
  api.runtime.onMessage.addListener((message: unknown, sender) => {
    const request = message as { type?: string; command?: CareerWrite }
    if (request?.type !== 'career-repository-write' || sender.id !== api.runtime.id || !sender.url?.startsWith(api.runtime.getURL('/options.html'))) return
    return (async () => {
      try {
        const command = request.command!
        let records: unknown
        switch (command.kind) {
          case 'profile': records = await repository.saveProfile(command.value); break
          case 'interview': records = await repository.saveInterview(command.value); break
          case 'advice': records = await repository.saveAdvice(command.value); break
          case 'delete-advice': records = await repository.deleteAdvice(command.id, command.revision); break
          case 'delete-profile': records = await repository.deleteProfile(command.id, command.revision); break
          case 'delete-interview': records = await repository.deleteInterview(command.id, command.revision); break
          default: throw new Error('无法识别的工作台保存操作。')
        }
        return { records }
      } catch (cause) { return { error: cause instanceof Error ? cause.message : String(cause) } }
    })()
  })
}
