'use client'

import { useBusiness } from './BusinessContext'
import { PlanType, hasFeature, getFeatureLimit } from './feature-gates'

export function useBusinessPlan() {
  const business = useBusiness()
  const plan: PlanType = business.plan || 'starter'

  return {
    plan,
    hasFeature: (featureKey: string) => hasFeature(plan, featureKey),
    getLimit: (featureKey: string) => getFeatureLimit(plan, featureKey),
  }
}
