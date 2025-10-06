// import assert from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import getPort from 'get-port'
import * as ui8 from 'uint8arrays'
import { Secp256k1Keypair, randomStr } from '@atproto/crypto'
import { SkeletonHandler } from '@atproto/pds'
import { TestEntryway } from './entryway'
import { TestFeedGen } from './feed-gen'
import { TestNetworkNoAppView } from './network-no-appview'
import { TestPds } from './pds'
import { TestPlc } from './plc'
import { SeedClient } from './seed/client'
import { TestServerParams } from './types'
import { mockNetworkUtilities } from './util'

const getPrivateHex = async (key: Secp256k1Keypair) => {
  return ui8.toString(await key.export(), 'hex')
}

export class TestNetworkEntryway extends TestNetworkNoAppView {
  feedGens: TestFeedGen[] = []
  constructor(
    public plc: TestPlc,
    public pds: TestPds,
    public entryway: TestEntryway,
  ) {
    super(plc, pds)
  }

  static async create(
    params: Partial<TestServerParams> = {},
  ): Promise<TestNetworkEntryway> {
    const entrywayPort = params.entryway?.port ?? (await getPort())

    const jwtSigningKey = await Secp256k1Keypair.create({ exportable: true })
    const plcRotationKey = await Secp256k1Keypair.create({ exportable: true })
    const plcRotationPriv = await getPrivateHex(plcRotationKey)
    const recoveryKey = (await Secp256k1Keypair.create()).did()

    const blobstoreLoc = path.join(os.tmpdir(), randomStr(8, 'base32'))
    const dataDirectory = path.join(os.tmpdir(), randomStr(8, 'base32'))
    await fs.mkdir(dataDirectory, { recursive: true })

    const plc = await TestPlc.create(params.plc ?? {})

    const pds = await TestPds.create({
      entrywayUrl: `http://localhost:${entrywayPort}`,
      entrywayDid: 'did:example:entryway',
      entrywayJwtVerifyKeyK256PublicKeyHex: jwtSigningKey.publicKeyStr('hex'),
      entrywayPlcRotationKey: plcRotationKey.did(),
      entrywayAdminToken: 'admin-pass',
      didPlcUrl: plc.url,
      plcRotationKeyK256PrivateKeyHex: plcRotationPriv,
      recoveryDidKey: recoveryKey,
      serviceDid: 'did:example:pds',
      ...params.pds,
    })

    const entryway = await TestEntryway.create({
      port: entrywayPort,
      pdsUrls: [pds.url],
      didPlcUrl: plc.url,
      serviceDid: 'did:example:entryway',
      plcRotationKeyK256PrivateKeyHex: plcRotationPriv,
      jwtSigningKeyK256PrivateKeyHex: await getPrivateHex(jwtSigningKey),
      recoveryDidKey: recoveryKey,
      dataDirectory: dataDirectory,
      blobstoreDiskLocation: blobstoreLoc,
    })

    console.log({
      jwtSigningKeyK256PrivateKeyHex: await getPrivateHex(jwtSigningKey),
    })

    mockNetworkUtilities(pds, undefined, entryway)

    return new TestNetworkEntryway(plc, pds, entryway)
  }

  async createFeedGen(
    feeds: Record<string, SkeletonHandler>,
  ): Promise<TestFeedGen> {
    const fg = await TestFeedGen.create(this.plc.url, feeds)
    this.feedGens.push(fg)
    return fg
  }

  getEntrywayClient() {
    return this.entryway.getClient()
  }

  getSeedClient(): SeedClient<typeof this> {
    const agent = this.entryway.getClient()
    return new SeedClient(this, agent)
  }

  async processAll() {
    await this.entryway.processAll()
    await this.pds.processAll()
  }

  async close() {
    await this.entryway.close()
    await this.pds.close()
    await this.plc.close()
  }
}
