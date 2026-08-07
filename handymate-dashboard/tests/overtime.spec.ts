import { test, expect } from '@playwright/test'
import {
  calculateDailyOvertime,
  calculateWeeklyOvertime,
  formatMinutes,
} from '../lib/overtime'

test.describe('övertidsfacit — minuter som påverkar lönen', () => {
  test('åtta timmar är ordinarie tid — gränsen skapar inte övertid', () => {
    const [day] = calculateDailyOvertime([
      { work_date: '2026-08-03', duration_minutes: 8 * 60 },
    ])

    expect(day).toEqual({
      date: '2026-08-03',
      regular_minutes: 480,
      overtime_minutes: 0,
      total_minutes: 480,
    })
  })

  test('flera rapporter samma dag summeras innan övertiden avgörs', () => {
    const [day] = calculateDailyOvertime([
      { work_date: '2026-08-03', duration_minutes: 5 * 60 },
      { work_date: '2026-08-03', duration_minutes: 4 * 60 + 30 },
    ])

    expect(day.regular_minutes).toBe(480)
    expect(day.overtime_minutes).toBe(90)
    expect(day.total_minutes).toBe(570)
  })

  test('dagarna sorteras så löneunderlaget är stabilt oavsett indataordning', () => {
    const days = calculateDailyOvertime([
      { work_date: '2026-08-05', duration_minutes: 60 },
      { work_date: '2026-08-03', duration_minutes: 60 },
      { work_date: '2026-08-04', duration_minutes: 60 },
    ])

    expect(days.map(day => day.date)).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ])
  })

  test('daglig övertid räknas inte en gång till som veckoövertid', () => {
    const week = calculateWeeklyOvertime([
      { work_date: '2026-08-03', duration_minutes: 10 * 60 },
      { work_date: '2026-08-04', duration_minutes: 8 * 60 },
      { work_date: '2026-08-05', duration_minutes: 8 * 60 },
      { work_date: '2026-08-06', duration_minutes: 8 * 60 },
      { work_date: '2026-08-07', duration_minutes: 8 * 60 },
    ])

    expect(week.daily_overtime_minutes).toBe(120)
    expect(week.weekly_overtime_minutes).toBe(0)
    expect(week.total_overtime_minutes).toBe(120)
    expect(week.regular_minutes).toBe(40 * 60)
  })

  test('sjätte ordinarie arbetsdagen passerar veckogränsen och blir övertid', () => {
    const week = calculateWeeklyOvertime([
      { work_date: '2026-08-03', duration_minutes: 8 * 60 },
      { work_date: '2026-08-04', duration_minutes: 8 * 60 },
      { work_date: '2026-08-05', duration_minutes: 8 * 60 },
      { work_date: '2026-08-06', duration_minutes: 8 * 60 },
      { work_date: '2026-08-07', duration_minutes: 8 * 60 },
      { work_date: '2026-08-08', duration_minutes: 4 * 60 },
    ])

    expect(week.daily_overtime_minutes).toBe(0)
    expect(week.weekly_overtime_minutes).toBe(240)
    expect(week.total_overtime_minutes).toBe(240)
    expect(week.regular_minutes).toBe(40 * 60)
  })

  test('anpassade avtalsgränser används i både dags- och veckofacit', () => {
    const week = calculateWeeklyOvertime([
      { work_date: '2026-08-03', duration_minutes: 7 * 60 },
      { work_date: '2026-08-04', duration_minutes: 7 * 60 },
      { work_date: '2026-08-05', duration_minutes: 7 * 60 },
      { work_date: '2026-08-06', duration_minutes: 7 * 60 },
      { work_date: '2026-08-07', duration_minutes: 7 * 60 },
    ], 6, 30)

    expect(week.daily_overtime_minutes).toBe(5 * 60)
    expect(week.weekly_overtime_minutes).toBe(0)
    expect(week.regular_minutes).toBe(30 * 60)
  })

  test('veckan redovisar rätt ISO-vecka och datumspann', () => {
    const week = calculateWeeklyOvertime([
      { work_date: '2026-08-07', duration_minutes: 60 },
      { work_date: '2026-08-03', duration_minutes: 60 },
    ])

    expect(week.week_number).toBe(32)
    expect(week.year).toBe(2026)
    expect(week.start_date).toBe('2026-08-03')
    expect(week.end_date).toBe('2026-08-07')
  })

  test('minuter visas utan att ett negativt saldo får ett falskt minustecken', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(-90)).toBe('1h 30m')
  })
})
