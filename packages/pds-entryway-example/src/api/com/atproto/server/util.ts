import { DidDocument } from '@atproto/identity'
import { AppContext } from '@atproto/pds'

export const safeResolveDidDoc = async (
  ctx: AppContext,
  did: string,
  forceRefresh?: boolean,
): Promise<DidDocument | undefined> => {
  try {
    const didDoc = await ctx.idResolver.did.resolve(did, forceRefresh)
    return didDoc ?? undefined
  } catch (err) {
    console.warn({ err, did }, 'failed to resolve did doc')
  }
}

export const didDocForSession = async (
  ctx: AppContext,
  did: string,
  forceRefresh?: boolean,
): Promise<DidDocument | undefined> => {
  if (!ctx.cfg.identity.enableDidDocWithSession) return
  return safeResolveDidDoc(ctx, did, forceRefresh)
}

export enum AccountStatus {
  Active = 'active',
  Takendown = 'takendown',
  Suspended = 'suspended',
  Deleted = 'deleted',
  Deactivated = 'deactivated',
}

export const formatAccountStatus = (
  account: null | {
    takedownRef: string | null
    deactivatedAt: string | null
  },
) => {
  if (!account) {
    return { active: false, status: AccountStatus.Deleted } as const
  } else if (account.takedownRef) {
    return { active: false, status: AccountStatus.Takendown } as const
  } else if (account.deactivatedAt) {
    return { active: false, status: AccountStatus.Deactivated } as const
  } else {
    return { active: true, status: undefined } as const
  }
}
