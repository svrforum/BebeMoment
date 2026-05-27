'use client'
import { DEFAULT_FEATURE_FLAGS, type FeatureFlag, type FeatureFlags } from '@bebe/core'
import { createContext, useContext } from 'react'

const Ctx = createContext<FeatureFlags>(DEFAULT_FEATURE_FLAGS)

export function FeaturesProvider({
  value,
  children,
}: {
  value: FeatureFlags
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFeatures(): FeatureFlags {
  return useContext(Ctx)
}

export function useFeature(flag: FeatureFlag): boolean {
  return useContext(Ctx)[flag]
}
