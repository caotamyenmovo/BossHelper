export interface PdfTextFragment {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

/** Group slightly different baselines without inserting spaces between Chinese glyphs. */
export function pdfTextToLines(items: PdfTextFragment[]) {
  const rows: Array<{ y: number; height: number; items: PdfTextFragment[] }> = []
  for (const item of [...items]
    .filter((item) => item.str.trim())
    .sort((a, b) => (b.transform[5] ?? 0) - (a.transform[5] ?? 0))) {
    const y = item.transform[5] ?? 0
    const height = Math.abs(item.height) || 10
    const row = rows.find(
      (candidate) =>
        Math.abs(candidate.y - y) <= Math.min(3, Math.min(height, candidate.height) * 0.3),
    )
    if (row) row.items.push(item)
    else rows.push({ y, height, items: [item] })
  }
  return rows
    .map((row) => {
      const fragments = row.items.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0))
      return fragments
        .reduce((line, fragment, index) => {
          const previous = fragments[index - 1]
          if (!previous) return fragment.str
          const gap = (fragment.transform[4] ?? 0) - (previous.transform[4] ?? 0) - previous.width
          const separator =
            /\s$/.test(line) || /^\s/.test(fragment.str)
              ? ''
              : gap > row.height * 1.5
                ? ' | '
                : gap > Math.max(1, row.height * 0.15)
                  ? ' '
                  : ''
          return line + separator + fragment.str
        }, '')
        .trim()
    })
    .join('\n')
}
