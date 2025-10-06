// catch errors that get thrown in async route handlers
// this is a relatively non-invasive change to express
// they get handled in the error.handler middleware
// leave at top of file before importing Routes
import 'express-async-errors'

import events from 'node:events'
import http from 'node:http'
import cors from 'cors'
import express from 'express'
import { HttpTerminator, createHttpTerminator } from 'http-terminator'
import { DAY, SECOND } from '@atproto/common'
import { PDS, ServerConfig, ServerSecrets } from '@atproto/pds'
import type * as pds from '@atproto/pds'
import apiRoutes from './api'
import { createServer } from './lexicon'
import { proxyHandler } from './pipethrough'

export { envToCfg, envToSecrets } from '@atproto/pds'

export type ServerEnvironment = pds.ServerEnvironment
export type AppContext = pds.AppContext

export class Entryway {
  public ctx: AppContext
  public app: express.Application
  public pds: PDS
  public server?: http.Server
  private terminator?: HttpTerminator

  constructor(opts: { ctx: AppContext; app: express.Application; pds: PDS }) {
    this.ctx = opts.ctx
    this.app = opts.app
    this.pds = opts.pds
  }

  static async create(
    cfg: ServerConfig,
    secrets: ServerSecrets,
    pdsUrls: string[],
  ): Promise<Entryway> {
    const pds = await PDS.create(cfg, secrets)
    const server = createServer({
      validateResponse: false,
      payload: {
        jsonLimit: 150 * 1024, // 150kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: cfg.service.blobUploadLimit,
      },
      catchall: proxyHandler(pds.ctx),
    })

    apiRoutes(server, pds.ctx, pdsUrls)

    const app = express()
    app.set('trust proxy', [
      // e.g. load balancer
      'loopback',
      'linklocal',
      'uniquelocal',
      // e.g. trust x-forwarded-for via entryway ip
      ...getTrustedIps(cfg),
    ])

    app.use(cors({ maxAge: DAY / SECOND }))
    app.use(server.xrpc.router)
    app.use(pds.app)

    return new Entryway({
      ctx: pds.ctx,
      app: app,
      pds: pds,
    })
  }

  async start(): Promise<http.Server> {
    await this.ctx.sequencer.start()
    const server = this.app.listen(this.ctx.cfg.service.port)
    this.server = server
    this.server.keepAliveTimeout = 90000
    this.terminator = createHttpTerminator({ server })
    await events.once(server, 'listening')
    return server
  }

  async destroy(): Promise<void> {
    await this.pds.destroy()
    await this.terminator?.terminate()
  }
}

const getTrustedIps = (cfg: ServerConfig) => {
  if (!cfg.rateLimits.enabled) return []
  return cfg.rateLimits.bypassIps ?? []
}
