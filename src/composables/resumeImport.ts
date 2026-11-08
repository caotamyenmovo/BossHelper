import mammoth from 'mammoth'

import { pdfTextToLines } from '../utils/pdfResumeText'

const MAX_RESUME_FILE_SIZE = 20 * 1024 * 1024

export async function extractResumeText(file: File): Promise<string> {
  if (!file.size) throw new Error('文件为空，请选择有效的简历文件。')
  if (file.size > MAX_RESUME_FILE_SIZE) throw new Error('文件超过 20 MB，请压缩后重新导入。')

  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  let text: string

  if (extension === 'txt') {
    const data = await file.arrayBuffer()
    const bytes = new Uint8Array(data)
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(data)
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(data)
    else {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data)
      } catch {
        text = new TextDecoder('gb18030').decode(data)
      }
    }
  } else if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer()
    const input =
      typeof window === 'undefined' ? { buffer: Buffer.from(arrayBuffer) } : { arrayBuffer }
    const result = await mammoth.extractRawText(input)
    text = result.value
  } else if (extension === 'pdf') {
    const [pdfjs, { default: workerUrl }] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
    const document = await loadingTask.promise
    try {
      const pages: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        pages.push(pdfTextToLines(content.items.filter((item) => 'str' in item)))
        page.cleanup()
      }
      text = pages.join('\n')
    } finally {
      await loadingTask.destroy()
    }
  } else if (extension === 'doc') {
    throw new Error('暂不支持 .doc 格式，请在 Word 中另存为 .docx 或 PDF 后导入。')
  } else {
    throw new Error('仅支持 PDF、DOCX 和 TXT 简历文件。')
  }

  const normalized = text.split(String.fromCharCode(0)).join('').trim()
  if (!normalized) {
    throw new Error(
      extension === 'pdf'
        ? 'PDF 中没有可提取的文字，可能是扫描件；请使用可复制文字的 PDF 或 TXT 文件。'
        : '未能从文件中提取文字，请确认文件内容后重试。',
    )
  }
  return normalized
}
