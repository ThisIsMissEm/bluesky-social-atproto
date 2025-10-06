import * as plc from '@did-plc/lib'
import { Agent } from '@atproto/api'
import { MINUTE } from '@atproto/common'
// import { Secp256k1Keypair } from '@atproto/crypto'
import { Secp256k1Keypair } from '@atproto/crypto'
import { AppContext, auth } from '@atproto/pds'
import { AuthScope } from '@atproto/pds/dist/auth-scope'
import {
  AuthRequiredError,
  InternalServerError,
  InvalidRequestError,
} from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { InputSchema as CreateAccountInput } from '../../../../lexicon/types/com/atproto/server/createAccount'

// Simple round robin assignment:
let pdsUrls: string[] = []
let pdsRoundRobin = 0
const getPds = (): string => {
  pdsRoundRobin = pdsRoundRobin++ % pdsUrls.length
  return pdsUrls[pdsRoundRobin]
}

// Simple pds to agent cache:
const agents = new Map<string, Agent>()
const getAgent = (pdsUrl): Agent => {
  let agent = agents.get(pdsUrl)
  if (!agent) {
    agent = new Agent({
      service: pdsUrl,
    })
  }

  agents.set(pdsUrl, agent)
  return agent
}

export default function (server: Server, ctx: AppContext, pdses: string[]) {
  pdsUrls = pdses
  server.com.atproto.server.createAccount({
    rateLimit: {
      durationMs: 5 * MINUTE,
      points: 100,
    },
    auth: ctx.authVerifier.userServiceAuthOptional,
    handler: async ({ input, auth: reqAuth }) => {
      const pdsUrl = getPds()
      const pdsAgent = getAgent(pdsUrl)

      const requester = reqAuth.credentials?.did ?? null
      const {
        did,
        handle,
        email,
        password,
        inviteCode,
        signingKey,
        plcOp,
        deactivated,
      } = await validateInputsForLocalPds(ctx, input.body, requester, pdsUrl)

      console.log({ signingKey })

      if (!plcOp) {
        throw new InvalidRequestError('Unsupported input: "plcOp" is null')
      }

      // await ctx.actorStore.create(did, signingKey)

      const result = await pdsAgent.com.atproto.server.createAccount({
        email,
        handle,
        did: did,
        password,
        plcOp: plcOp,
      })

      const tokens = await ctx.accountManager.createAccountAndSession({
        did,
        handle,
        email,
        password,
        inviteCode,
        deactivated,
      })

      if (!result.success) {
        throw new InternalServerError('Failed to create account')
      }

      console.log({ tokens, did })

      return {
        encoding: 'application/json',
        body: {
          handle,
          did: did,
          didDoc: result.data.didDoc,
          accessJwt: tokens.accessJwt,
          refreshJwt: tokens.refreshJwt,
        },
      }
    },
  })
}

const validateInputsForLocalPds = async (
  ctx: AppContext,
  input: CreateAccountInput,
  requester: string | null,
  pds: string,
) => {
  if (input.plcOp) {
    throw new InvalidRequestError('Unsupported input: "plcOp"')
  }

  if (!input.email) {
    throw new InvalidRequestError('Email is required')
  }

  // normalize & ensure valid handle
  const handle = await ctx.accountManager.normalizeAndValidateHandle(
    input.handle,
    { did: input.did },
  )

  const [byHandle, byEmail] = await Promise.all([
    ctx.accountManager.getAccount(handle, {
      includeDeactivated: true,
      includeTakenDown: true,
    }),
    ctx.accountManager.getAccountByEmail(input.email, {
      includeDeactivated: true,
      includeTakenDown: true,
    }),
  ])
  if (byEmail) {
    throw new InvalidRequestError(`Email already taken: ${input.email}`)
  } else if (byHandle) {
    throw new InvalidRequestError(`Handle already taken: ${handle}`)
  }

  const signingKey = await getSigningKey({ did: input.did }, pds)

  let did: string
  let plcOp: plc.Operation | null
  let deactivated = false
  if (input.did) {
    if (input.did !== requester) {
      throw new AuthRequiredError(
        `Missing auth to create account with did: ${input.did}`,
      )
    }
    did = input.did
    plcOp = null
    deactivated = true
  } else {
    const formatted = await formatDidAndPlcOp(
      ctx,
      handle,
      input,
      signingKey,
      pds,
    )
    did = formatted.did
    plcOp = formatted.plcOp
  }

  return {
    did,
    handle,
    email: input.email,
    password: input.password,
    inviteCode: input.inviteCode,
    signingKey,
    plcOp,
    deactivated,
  }
}

const getSigningKey = async (input: { did?: string }, pds: string) => {
  if (input.did) {
    const signingKey = await Secp256k1Keypair.create({ exportable: true })
    return signingKey.did()
  } else {
    const pdsAgent = getAgent(pds)
    const reserved = await pdsAgent.com.atproto.server.reserveSigningKey({})

    if (!reserved.success) {
      throw new InternalServerError('Failed to reserve signing key')
    }

    return reserved.data.signingKey
  }
}

const formatDidAndPlcOp = async (
  ctx: AppContext,
  handle: string,
  input: CreateAccountInput,
  signingKey: string,
  pds: string,
): Promise<{
  did: string
  plcOp: plc.Operation | null
}> => {
  // if the user is not bringing a DID, then we format a create op for PLC
  const rotationKeys = [ctx.plcRotationKey.did()]
  if (ctx.cfg.identity.recoveryDidKey) {
    rotationKeys.unshift(ctx.cfg.identity.recoveryDidKey)
  }
  if (input.recoveryKey) {
    rotationKeys.unshift(input.recoveryKey)
  }
  const plcCreate = await plc.createOp({
    signingKey,
    rotationKeys,
    handle,
    pds,
    signer: ctx.plcRotationKey,
  })
  return {
    did: plcCreate.did,
    plcOp: plcCreate.op,
  }
}
