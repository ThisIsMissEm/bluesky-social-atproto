import { DAY, MINUTE } from '@atproto/common'
import { AppContext } from '@atproto/pds'
import { INVALID_HANDLE } from '@atproto/syntax'
import { AuthRequiredError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { didDocForSession, formatAccountStatus } from './util'

export const OLD_PASSWORD_MAX_LENGTH = 512

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.server.createSession({
    rateLimit: [
      {
        durationMs: DAY,
        points: 300,
        calcKey: ({ input, req }) => `${input.body.identifier}-${req.ip}`,
      },
      {
        durationMs: 5 * MINUTE,
        points: 30,
        calcKey: ({ input, req }) => `${input.body.identifier}-${req.ip}`,
      },
    ],
    handler: async ({ input }) => {
      console.log('entryway: com.atproto.server.createSession', input)

      if (input.body.password.length > OLD_PASSWORD_MAX_LENGTH) {
        throw new AuthRequiredError(
          'Password too long. Consider resetting your password.',
        )
      }

      const { user, isSoftDeleted, appPassword } =
        await ctx.accountManager.login(input.body)

      if (!input.body.allowTakendown && isSoftDeleted) {
        throw new AuthRequiredError(
          'Account has been taken down',
          'AccountTakedown',
        )
      }

      const [{ accessJwt, refreshJwt }, didDoc] = await Promise.all([
        ctx.accountManager.createSession(user.did, appPassword, isSoftDeleted),
        didDocForSession(ctx, user.did),
      ])

      const { status, active } = formatAccountStatus(user)

      return {
        encoding: 'application/json',
        body: {
          did: user.did,
          didDoc,
          handle: user.handle ?? INVALID_HANDLE,
          email: user.email ?? undefined,
          emailConfirmed: !!user.emailConfirmedAt,
          accessJwt,
          refreshJwt,
          active,
          status,
        },
      }
    },
  })
}
