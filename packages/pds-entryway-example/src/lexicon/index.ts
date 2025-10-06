/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  type Auth,
  type Options as XrpcOptions,
  Server as XrpcServer,
  type StreamConfigOrHandler,
  type MethodConfigOrHandler,
  createServer as createXrpcServer,
} from '@atproto/xrpc-server'
import { schemas } from './lexicons.js'
import * as ComAtprotoIdentityUpdateHandle from './types/com/atproto/identity/updateHandle.js'
import * as ComAtprotoServerCreateAccount from './types/com/atproto/server/createAccount.js'
import * as ComAtprotoServerCreateSession from './types/com/atproto/server/createSession.js'
import * as ComAtprotoServerGetSession from './types/com/atproto/server/getSession.js'

export function createServer(options?: XrpcOptions): Server {
  return new Server(options)
}

export class Server {
  xrpc: XrpcServer
  com: ComNS

  constructor(options?: XrpcOptions) {
    this.xrpc = createXrpcServer(schemas, options)
    this.com = new ComNS(this)
  }
}

export class ComNS {
  _server: Server
  atproto: ComAtprotoNS

  constructor(server: Server) {
    this._server = server
    this.atproto = new ComAtprotoNS(server)
  }
}

export class ComAtprotoNS {
  _server: Server
  identity: ComAtprotoIdentityNS
  server: ComAtprotoServerNS

  constructor(server: Server) {
    this._server = server
    this.identity = new ComAtprotoIdentityNS(server)
    this.server = new ComAtprotoServerNS(server)
  }
}

export class ComAtprotoIdentityNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  updateHandle<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      ComAtprotoIdentityUpdateHandle.QueryParams,
      ComAtprotoIdentityUpdateHandle.HandlerInput,
      ComAtprotoIdentityUpdateHandle.HandlerOutput
    >,
  ) {
    const nsid = 'com.atproto.identity.updateHandle' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class ComAtprotoServerNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  createAccount<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      ComAtprotoServerCreateAccount.QueryParams,
      ComAtprotoServerCreateAccount.HandlerInput,
      ComAtprotoServerCreateAccount.HandlerOutput
    >,
  ) {
    const nsid = 'com.atproto.server.createAccount' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  createSession<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      ComAtprotoServerCreateSession.QueryParams,
      ComAtprotoServerCreateSession.HandlerInput,
      ComAtprotoServerCreateSession.HandlerOutput
    >,
  ) {
    const nsid = 'com.atproto.server.createSession' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getSession<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      ComAtprotoServerGetSession.QueryParams,
      ComAtprotoServerGetSession.HandlerInput,
      ComAtprotoServerGetSession.HandlerOutput
    >,
  ) {
    const nsid = 'com.atproto.server.getSession' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}
