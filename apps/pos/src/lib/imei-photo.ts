export type ImeiPhotoResult = { imei1: string; imei2: string; unlabelled: boolean }

// Never invent missing digits or substitute OCR letters for numbers.
export function extractImeis(text: string): ImeiPhotoResult {
  const result = { imei1: '', imei2: '', unlabelled: false }
  const extras: string[] = []
  let pending: 'imei1' | 'imei2' | null = null
  for (const line of text.split(/\r?\n/)) {
    if (/\b(?:PSN|S\/?N|SERIAL|ICCID|EID|MEID)\b/i.test(line)) { pending = null; continue }
    const label = /[I1l]ME[I1l]\s*\(?\s*([12])?\s*\)?\s*[:=.-]?\s*/i.exec(line)
    const slot: 'imei1' | 'imei2' | null = label ? (label[1] === '2' ? 'imei2' : 'imei1') : pending
    const content = label ? line.slice(label.index + label[0].length) : line
    const candidates = (content.match(/\d(?:[\d \t-]*\d)?/g) || [])
      .map(value => value.replace(/[ \t-]/g, '')).filter(value => /^\d{15}$/.test(value))
    if (slot && candidates.length) {
      if (!result[slot]) result[slot] = candidates[0]
      pending = null
    } else if (label) {
      pending = slot
    } else {
      extras.push(...candidates)
    }
  }
  for (const value of [...new Set(extras)]) {
    if (value === result.imei1 || value === result.imei2) continue
    if (!result.imei1) { result.imei1 = value; result.unlabelled = true }
    else if (!result.imei2) { result.imei2 = value; result.unlabelled = true }
  }
  return result
}

export function hasValidImeiChecksum(value: string): boolean {
  if (!/^\d{15}$/.test(value)) return false
  const sum = [...value].reduce((total, digit, index) => {
    const n = Number(digit) * (index % 2 ? 2 : 1)
    return total + (n > 9 ? n - 9 : n)
  }, 0)
  return sum % 10 === 0
}
