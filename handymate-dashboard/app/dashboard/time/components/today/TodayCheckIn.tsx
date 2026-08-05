'use client'

import TimerWidget from '@/components/time/TimerWidget'

/**
 * TodayCheckIn — R4-A (tasks/resurs-masterplan.md). Incheckningsblocket.
 * Ren utflyttning ur TodayView.tsx (var "Stämpelklocka — inline card"),
 * oförändrad markup/beteende.
 */
interface TodayCheckInProps {
  onCheckInOut: () => void
}

export default function TodayCheckIn({ onCheckInOut }: TodayCheckInProps) {
  return <TimerWidget onCheckInOut={onCheckInOut} />
}
