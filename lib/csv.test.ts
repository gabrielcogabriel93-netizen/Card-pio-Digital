import { describe, it, expect } from 'vitest'
import { escapeCsvCell } from './csv'

describe('escapeCsvCell', () => {
  it('neutralizes spreadsheet formulas in text cells', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(escapeCsvCell('+5511999')).toBe("'+5511999")
    expect(escapeCsvCell('-cmd')).toBe("'-cmd")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('keeps real numbers and normal text untouched', () => {
    expect(escapeCsvCell(-10)).toBe('-10')
    expect(escapeCsvCell('Ana Souza')).toBe('Ana Souza')
  })

  it('quotes cells with separators, quotes or line breaks', () => {
    expect(escapeCsvCell('a;b')).toBe('"a;b"')
    expect(escapeCsvCell('linha\nnova')).toBe('"linha\nnova"')
  })
})
