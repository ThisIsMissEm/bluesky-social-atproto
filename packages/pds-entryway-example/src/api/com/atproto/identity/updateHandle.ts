import { Agent } from '@atproto/api'
import { DAY, MINUTE, getPdsEndpoint } from '@atproto/common'
import { AppContext } from '@atproto/pds'
import { InternalServerError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
// import { httpLogger } from '../../../../logger'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.identity.updateHandle({
    auth: ctx.authVerifier.authorizationOrUserServiceAuth({
      checkTakedown: true,
      authorize: (permissions) => {
        permissions.assertIdentity({ attr: 'handle' })
      },
    }),
    rateLimit: [
      {
        durationMs: 5 * MINUTE,
        points: 10,
        calcKey: ({ auth }) => auth.credentials.did,
      },
      {
        durationMs: DAY,
        points: 50,
        calcKey: ({ auth }) => auth.credentials.did,
      },
    ],
    handler: async ({ auth, input }) => {
      // the full flow is:
      // -> entryway(identity.updateHandle) [update handle, submit plc op]
      // -> pds(admin.updateAccountHandle)  [track handle, sequence handle update]

      const requester = auth.credentials.did
      const handle = await ctx.accountManager.normalizeAndValidateHandle(
        input.body.handle,
        { did: requester },
      )

      // Pessimistic check to handle spam: also enforced by updateHandle() and the db.
      const account = await ctx.accountManager.getAccount(handle, {
        includeDeactivated: true,
      })

      if (!account) {
        if (requester.startsWith('did:plc:')) {
          await ctx.plcClient.updateHandle(
            requester,
            ctx.plcRotationKey,
            handle,
          )
        } else {
          const resolved = await ctx.idResolver.did.resolveAtprotoData(
            requester,
            true,
          )
          if (resolved.handle !== handle) {
            throw new InvalidRequestError(
              'DID is not properly configured for handle',
            )
          }
        }
        await ctx.accountManager.updateHandle(requester, handle)
      } else {
        // if we found an account with matching handle, check if it is the same as requester
        // if so emit an identity event, otherwise error.
        if (account.did !== requester) {
          throw new InvalidRequestError(`Handle already taken: ${handle}`)
        }
      }

      const didDoc = await ctx.idResolver.did.resolve(requester, false)
      if (didDoc === null) {
        throw new InternalServerError(
          `Failed to retrieve did document: ${requester}`,
        )
      }

      console.log({ didDoc, newHandle: handle }, 'updateHandle')

      const pdsEndpoint = getPdsEndpoint(didDoc)
      if (pdsEndpoint === undefined) {
        throw new InternalServerError(
          `Failed to retrieve pds endpoint from did document: ${requester}`,
        )
      }
      const pdsAgent = new Agent({
        service: pdsEndpoint,
      })

      // call pds and use admin.updateAccountHandle
      await pdsAgent.com.atproto.admin // .withProxy('atproto', pdsAgent.did)
        .updateAccountHandle(
          {
            did: requester,
            handle: handle,
          },
          {
            headers: {
              ...ctx.authVerifier.createAdminAuthHeader(),
              'atproto-proxy': `${pdsAgent.did}#atproto`,
            },
            encoding: 'application/json',
          },
        )
    },
  })
}
