import getPort from 'get-port'
import * as ui8 from 'uint8arrays'
import { AtpAgent } from '@atproto/api'
import * as entryway from '@atproto/pds-entryway-example'
import { ADMIN_PASSWORD } from './const'
import { EntrywayConfig } from './types'

export class TestEntryway {
  constructor(
    public url: string,
    public port: number,
    public server: entryway.Entryway,
  ) {}

  static async create(config: EntrywayConfig): Promise<TestEntryway> {
    const port = config.port || (await getPort())
    const url = `http://localhost:${port}`

    const env: entryway.ServerEnvironment = {
      devMode: true,
      port,
      adminPassword: ADMIN_PASSWORD,
      entrywayAdminToken: 'admin-pass',
      bskyAppViewUrl: 'https://appview.invalid',
      bskyAppViewDid: 'did:example:invalid',
      bskyAppViewCdnUrlPattern: 'http://cdn.appview.com/%s/%s/%s',
      modServiceUrl: 'https://moderator.invalid',
      modServiceDid: 'did:example:invalid',
      inviteRequired: false,
      disableSsrfProtection: true,
      ...config,
    }

    const cfg = entryway.envToCfg(env)
    const secrets = entryway.envToSecrets(env)

    const server = await entryway.Entryway.create(
      cfg,
      secrets,
      config.pdsUrls ?? [],
    )

    await server.start()

    return new TestEntryway(url, port, server)
  }

  get ctx(): entryway.AppContext {
    return this.server.ctx
  }

  getClient(): AtpAgent {
    return new AtpAgent({ service: this.url })
  }

  adminAuth(): string {
    return (
      'Basic ' +
      ui8.toString(
        ui8.fromString(`admin:${ADMIN_PASSWORD}`, 'utf8'),
        'base64pad',
      )
    )
  }

  adminAuthHeaders() {
    return {
      authorization: this.adminAuth(),
    }
  }

  // jwtSecretKey() {
  //   return createSecretKeyObject(JWT_SECRET)
  // }

  async processAll() {
    await this.ctx.backgroundQueue.processAll()
  }

  async close() {
    await this.server.destroy()
  }
}
