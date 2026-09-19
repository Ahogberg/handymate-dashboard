import { test, expect } from '@playwright/test'
import fs from 'fs'
import { autoInvoicePreview } from './helpers/auto-invoice-preview'
import { avdragsvaktSkal } from '../lib/invoices/auto-invoice-avdragsvakt'

/**
 * UI-bevis för avdragsvakten (spår 5, 2026-09-18).
 *
 * Källskanningen i tests/auto-faktura-avdragsvakt.spec.ts bevisar att skälet
 * FINNS. Det här beviset visar att det SYNS: den riktiga komponenten, riktig
 * Tailwind, 375 px. Utan det kan skälet renderas utanför skärmen eller aldrig
 * monteras — och då är vakten lika tyst som felet den stänger.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } }
    : {}),
})

test('avdragsvaktens skäl syns i 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.setContent(await autoInvoicePreview({
    invoices_created: 0,
    invoices: [],
    errors: [],
    skipped: [
      { customer_name: 'Familjen Lind', reason: avdragsvaktSkal() },
      { customer_name: 'Bolaget AB', reason: 'Alla ofakturerade tidrapporter saknar timpris — inget kunde faktureras utan att gissa ett pris.' },
    ],
  }))

  await page.getByRole('button').first().click()
  await expect(page.getByText('Inga fakturor skapades — se skälen nedan.')).toBeVisible()
  await expect(page.getByText('Familjen Lind')).toBeVisible()
  await expect(page.getByText(/fakturera dem för hand/)).toBeVisible()
  // Den gamla texten hade varit en lögn i det här läget.
  await expect(page.getByText('inga ofakturerade tidrapporter')).toHaveCount(0)

  fs.mkdirSync('/tmp/uibevis', { recursive: true })
  await page.screenshot({ path: '/tmp/uibevis/avdragsvakt-375.png', fullPage: true })
})

test('utan överhoppade kunder står den gamla, sanna texten kvar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.setContent(await autoInvoicePreview({
    invoices_created: 0, invoices: [], errors: [], skipped: [],
  }))
  await page.getByRole('button').first().click()
  await expect(page.getByText('Inga fakturor att skapa (inga ofakturerade tidrapporter)')).toBeVisible()
})
