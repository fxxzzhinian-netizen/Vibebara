import diff_match_patch from 'diff-match-patch'

/**
 * 基于 Google diff-match-patch 的改动高亮工具。
 *
 * - inlineSegments：字符级 inline diff，用于「字段 old → new」以及正文里
 *   「一删一增」替换行的行内高亮。
 * - parseUnifiedDiff：把后端生成的 unified diff 文本解析为可渲染行，
 *   并对相邻的删/增行做行内字符级高亮（类 GitHub 效果）。
 */

const dmp = new diff_match_patch()

// diff-match-patch 的操作码：删除 -1 / 相等 0 / 新增 1
export type SegOp = -1 | 0 | 1

export interface Seg {
  text: string
  op: SegOp
}

export interface InlinePair {
  left: Seg[]
  right: Seg[]
}

/** 字符级 inline diff：返回「旧串高亮段」与「新串高亮段」。 */
export function inlineSegments(oldStr: string, newStr: string): InlinePair {
  const diffs = dmp.diff_main(oldStr ?? '', newStr ?? '')
  dmp.diff_cleanupSemantic(diffs)

  const left: Seg[] = []
  const right: Seg[] = []
  for (const [op, text] of diffs) {
    if (op === 0) {
      left.push({ text, op: 0 })
      right.push({ text, op: 0 })
    } else if (op === -1) {
      left.push({ text, op: -1 })
    } else {
      right.push({ text, op: 1 })
    }
  }
  return { left, right }
}

export type DiffRowType = 'hunk' | 'context' | 'add' | 'del'

export interface DiffRow {
  type: DiffRowType
  text: string
  /** 替换对的行内高亮段；普通行为空。 */
  segs?: Seg[]
}

/**
 * 解析后端 unified diff 文本（已剔除 +++/--- 文件头，保留 @@ 块头）。
 * 对「一行删除紧跟一行新增」的替换对，额外计算行内字符级高亮。
 */
export function parseUnifiedDiff(diffText: string): DiffRow[] {
  const lines = (diffText || '').split('\n')
  const rows: DiffRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('@@')) {
      rows.push({ type: 'hunk', text: line })
      continue
    }

    if (line.startsWith('-')) {
      const delText = line.slice(1)
      const next = lines[i + 1]
      if (next !== undefined && next.startsWith('+')) {
        const addText = next.slice(1)
        const { left, right } = inlineSegments(delText, addText)
        rows.push({ type: 'del', text: delText, segs: left })
        rows.push({ type: 'add', text: addText, segs: right })
        i++
      } else {
        rows.push({ type: 'del', text: delText })
      }
      continue
    }

    if (line.startsWith('+')) {
      rows.push({ type: 'add', text: line.slice(1) })
      continue
    }

    // 上下文行以单个空格开头；跳过 split 产生的尾部空串
    if (line === '' && i === lines.length - 1) continue
    rows.push({ type: 'context', text: line.startsWith(' ') ? line.slice(1) : line })
  }

  return rows
}
