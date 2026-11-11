import { describe, it, expect } from 'vitest'
import { groupRuleLabel, isGroupMissing, minRequired } from './variations'
import { weekdaysLabel, servedToday, weekdayIn } from './weekdays'
import { coverCrop } from './imageFormats'
import { endOfTodayIso, isSoldOut } from './soldOut'

describe('regras dos grupos (marmita)', () => {
  const acomp = { allow_multiple: true, max_select: 4, min_select: 3, is_required: true }
  it('"Escolha de 3 a 4" e exige o mínimo', () => {
    expect(groupRuleLabel(acomp)).toBe('Escolha de 3 a 4')
    expect(isGroupMissing(acomp, 2)).toBe(true)
    expect(isGroupMissing(acomp, 3)).toBe(false)
    expect(minRequired(acomp, 0)).toBe(3)
  })
  it('grupo opcional com mínimo: pode pular, mas se escolher precisa do mínimo', () => {
    const salada = { allow_multiple: true, max_select: null, min_select: 2, is_required: false }
    expect(isGroupMissing(salada, 0)).toBe(false)
    expect(isGroupMissing(salada, 1)).toBe(true)
    expect(groupRuleLabel(salada)).toBe('Escolha pelo menos 2')
  })
  it('tamanho obrigatório de escolha única', () => {
    expect(groupRuleLabel({ allow_multiple: false, max_select: null })).toBe('Escolha 1')
    expect(isGroupMissing({ allow_multiple: false, max_select: null, is_required: true }, 0)).toBe(true)
  })
})

describe('dias da semana', () => {
  it('rótulos', () => {
    expect(weekdaysLabel([6])).toBe('sábado')
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('seg a sex')
    expect(weekdaysLabel([1, 3, 5])).toBe('seg, qua e sex')
    expect(weekdaysLabel(null)).toBe('todos os dias')
  })
  it('servido hoje no fuso da loja', () => {
    const sabado = new Date('2026-11-14T15:00:00Z') // sábado 12h em Brasília
    expect(weekdayIn('America/Sao_Paulo', sabado)).toBe(6)
    expect(servedToday([6], 'America/Sao_Paulo', sabado)).toBe(true)
    expect(servedToday([1, 2], 'America/Sao_Paulo', sabado)).toBe(false)
    expect(servedToday([], 'America/Sao_Paulo', sabado)).toBe(true)
  })
})

describe('acabou hoje e recorte', () => {
  it('volta à meia-noite de Brasília', () => {
    const now = new Date('2026-11-14T15:00:00Z')
    expect(endOfTodayIso('America/Sao_Paulo', now)).toBe('2026-11-15T03:00:00.000Z')
    expect(isSoldOut('2026-11-15T03:00:00.000Z', now)).toBe(true)
    expect(isSoldOut(null, now)).toBe(false)
  })
  it('recorte cobre a moldura e não sai da imagem', () => {
    // foto 4000x3000 numa moldura 400x300 (4:3) sem zoom: usa a foto inteira
    const c = coverCrop(4000, 3000, 400, 300, 1, 0, 0)
    expect([c.sx, c.sy, c.sw, c.sh]).toEqual([0, 0, 4000, 3000])
    // banner 8:3 numa foto quadrada: corta em cima/embaixo, arrastar demais é limitado
    const b = coverCrop(1000, 1000, 800, 300, 1, 0, -9999)
    expect(b.sw).toBe(1000)
    expect(b.sy + b.sh).toBeCloseTo(1000, 5)
  })
})
