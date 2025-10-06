import { ComAtprotoServerGetSession } from '@atproto/api'
import { AppContext, AuthScope, authOutput } from '@atproto/pds'
import { INVALID_HANDLE } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { didDocForSession, formatAccountStatus } from './util'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.server.getSession({
    auth: ctx.authVerifier.authorizationOrUserServiceAuth({
      additional: [AuthScope.SignupQueued],
      authorize: () => {
        // Always allowed. "email" access is checked in the handler.
      },
    }),
    handler: async ({ auth }) => {
      const did = auth.credentials.did
      const [user, didDoc] = await Promise.all([
        ctx.accountManager.getAccount(did, { includeDeactivated: true }),
        didDocForSession(ctx, did),
      ])
      if (!user) {
        throw new InvalidRequestError(
          `Could not find user info for account: ${did}`,
        )
      }

      const { status, active } = formatAccountStatus(user)

      return {
        encoding: 'application/json',
        body: output(auth, {
          handle: user.handle ?? INVALID_HANDLE,
          did: user.did,
          email: user.email ?? undefined,
          didDoc,
          emailConfirmed: !!user.emailConfirmedAt,
          active,
          status,
        }),
      }
    },
  })
}

function output(
  {
    credentials,
  }:
    | authOutput.UserServiceAuthOutput
    | authOutput.OAuthOutput
    | authOutput.AccessOutput,
  data: ComAtprotoServerGetSession.OutputSchema,
): ComAtprotoServerGetSession.OutputSchema {
  if (
    credentials.type === 'oauth' &&
    !credentials.permissions.allowsAccount({ attr: 'email', action: 'read' })
  ) {
    const { email, emailAuthFactor, emailConfirmed, ...rest } = data
    return rest
  }

  return data
}
