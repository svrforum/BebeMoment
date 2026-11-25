import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { FakeMediaClient } from '@bebe/media-client'
import { expect, it } from 'vitest'
import { getAssetForFamily } from './asset/get'
import { loadViewerBundle } from './asset/viewer-bundle'
import { listMyBookmarks } from './bookmark/list-mine'
import { listCooccurringPeople } from './people/cooccurrence'
import { countPeople, getPersonAssets, hasUnnamedPerson, listPeople } from './people/list'
import { listStoryEntries } from './story/list'
import { listTimeline } from './timeline/merged-list'

// 비밀 스토리 사진을 거르는 함수들은 viewerRole(과 그 필터가 읽는 prismaPublic)을 선택 인자로
// 받았다 — 빠뜨리면 거르지 않거나(스토리·인물·단일 사진) 함수마다 다른 쪽으로 기울었다. 다시 선택
// 인자가 되면 아래의 기대한 타입 에러가 사라져 typecheck 가 깨진다. 함수는 만들기만 하고 부르지 않는다.
it('자산을 내보내는 함수는 viewerRole 과 prismaPublic 을 반드시 받는다', () => {
  const omits = (pub: PrismaPublic, med: PrismaMedia) => {
    const m = new FakeMediaClient()
    const asset = { assetId: 'a', familyId: 'f' }
    // @ts-expect-error viewerRole 누락
    void getAssetForFamily(asset, med, m, pub)
    // @ts-expect-error prismaPublic 누락
    void getAssetForFamily({ ...asset, viewerRole: 'family' }, med, m)
    // @ts-expect-error viewerRole 누락
    void loadViewerBundle(asset, med, m, pub)
    // @ts-expect-error prismaPublic 누락
    void loadViewerBundle({ ...asset, viewerRole: 'family' }, med, m)
    // @ts-expect-error viewerRole 누락
    void listTimeline('f', {}, pub, med, m)
    // @ts-expect-error viewerRole 누락
    void listStoryEntries('f', {}, pub, med, m)
    // @ts-expect-error viewerRole 누락
    void listMyBookmarks('f', 'u', {}, pub, med, m)
    // @ts-expect-error viewerRole 누락
    void listPeople({ familyId: 'f' }, med, m, pub)
    // @ts-expect-error prismaPublic 누락
    void listPeople({ familyId: 'f', viewerRole: 'family' }, med, m)
    // @ts-expect-error viewerRole 누락
    void countPeople({ familyId: 'f' }, med, pub)
    // @ts-expect-error prismaPublic 누락
    void countPeople({ familyId: 'f', viewerRole: 'family' }, med)
    // @ts-expect-error viewerRole 누락
    void hasUnnamedPerson({ familyId: 'f' }, med, pub)
    // @ts-expect-error prismaPublic 누락
    void hasUnnamedPerson({ familyId: 'f', viewerRole: 'family' }, med)
    // @ts-expect-error viewerRole 누락
    void getPersonAssets({ familyId: 'f', personId: 'p' }, med, m, pub)
    // @ts-expect-error prismaPublic 누락
    void getPersonAssets({ familyId: 'f', personId: 'p', viewerRole: 'family' }, med, m)
    // @ts-expect-error viewerRole 누락
    void listCooccurringPeople({ familyId: 'f', personId: 'p' }, med, pub)
    // @ts-expect-error prismaPublic 누락
    void listCooccurringPeople({ familyId: 'f', personId: 'p', viewerRole: 'family' }, med)
  }
  expect(omits).toBeTypeOf('function')
})
