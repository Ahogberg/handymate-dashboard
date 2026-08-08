import type { DemoStep } from '@/lib/demo/story'

export interface PresenterGate {
  businessId: string | null | undefined
  demoBusinessId: string | null | undefined
  isOwnerOrAdmin: boolean
  userLoading: boolean
}

export function canRenderDemoPresenter(gate: PresenterGate): boolean {
  return Boolean(
    !gate.userLoading
      && gate.isOwnerOrAdmin
      && gate.demoBusinessId
      && gate.businessId === gate.demoBusinessId,
  )
}

export function resolveTalkingPoint(
  step: DemoStep,
  amountKr: number | null | undefined,
  formatAmount: (amount: number) => string,
): string {
  if (!step.talkingPoint.includes('{amount}')) return step.talkingPoint
  const amount = typeof amountKr === 'number' && amountKr > 0
    ? formatAmount(amountKr)
    : 'beloppet i underlaget'
  return step.talkingPoint.replace('{amount}', amount)
}
