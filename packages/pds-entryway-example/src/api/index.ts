import { AppContext } from '@atproto/pds'
import { Server } from '../lexicon'
import comAtprotoIdentityUpdateHandle from './com/atproto/identity/updateHandle'
import comAtprotoServerCreateAccount from './com/atproto/server/createAccount'
import comAtprotoServerCreateSession from './com/atproto/server/createSession'
import comAtprotoServerGetSession from './com/atproto/server/getSession'

export default function (server: Server, ctx: AppContext, pdsUrls: string[]) {
  comAtprotoServerCreateAccount(server, ctx, pdsUrls)
  comAtprotoServerGetSession(server, ctx)
  comAtprotoServerCreateSession(server, ctx)
  comAtprotoIdentityUpdateHandle(server, ctx)

  return server
}
