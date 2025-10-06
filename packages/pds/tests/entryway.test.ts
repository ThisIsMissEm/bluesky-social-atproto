import * as plcLib from '@did-plc/lib'
import { AtpAgent } from '@atproto/api'
import { Secp256k1Keypair } from '@atproto/crypto'
import { SeedClient, TestNetworkEntryway } from '@atproto/dev-env'

describe('entryway', () => {
  let network: TestNetworkEntryway
  let entrywayAgent: AtpAgent
  let pdsAgent: AtpAgent
  let alice: string
  let accessToken: string

  beforeAll(async () => {
    network = await TestNetworkEntryway.create({})
    entrywayAgent = network.getEntrywayClient()
    pdsAgent = network.pds.getClient()

    console.log(network)

    // const jwtSigningKey = await Secp256k1Keypair.create({ exportable: true })
    // const plcRotationKey = await Secp256k1Keypair.create({ exportable: true })
    // const entrywayPort = await getPort()
    // plc = await TestPlc.create({})
    // pds = await TestPds.create({
    //   entrywayUrl: `http://localhost:${entrywayPort}`,
    //   entrywayDid: 'did:example:entryway',
    //   entrywayJwtVerifyKeyK256PublicKeyHex: getPublicHex(jwtSigningKey),
    //   entrywayPlcRotationKey: plcRotationKey.did(),
    //   adminPassword: 'admin-pass',
    //   serviceHandleDomains: [],
    //   didPlcUrl: plc.url,
    //   serviceDid: 'did:example:pds',
    //   inviteRequired: false,
    // })
    // entryway = await createEntryway({
    //   dbPostgresSchema: 'entryway',
    //   port: entrywayPort,
    //   adminPassword: 'admin-pass',
    //   jwtSigningKeyK256PrivateKeyHex: await getPrivateHex(jwtSigningKey),
    //   plcRotationKeyK256PrivateKeyHex: await getPrivateHex(plcRotationKey),
    //   inviteRequired: false,
    //   serviceDid: 'did:example:entryway',
    //   didPlcUrl: plc.url,
    // })
    // mockResolvers(pds.ctx.idResolver, pds)
    // mockResolvers(entryway.ctx.idResolver, pds)
    // await entryway.ctx.db.db
    //   .insertInto('pds')
    //   .values({
    //     did: pds.ctx.cfg.service.did,
    //     host: new URL(pds.ctx.cfg.service.publicUrl).host,
    //     weight: 1,
    //   })
    //   .execute()
    // pdsAgent = pds.getClient()
    // entrywayAgent = new AtpAgent({
    //   service: entryway.ctx.cfg.service.publicUrl,
    // })
  })

  afterEach(async () => {
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('creates account.', async () => {
    try {
      const res = await entrywayAgent.com.atproto.server.createAccount({
        email: 'alice@test.com',
        handle: 'alice.test',
        password: 'test123',
      })
      alice = res.data.did
      accessToken = res.data.accessJwt
    } catch (err) {
      console.log(err)
    }

    console.log({ alice, accessToken })

    const account = await network.pds.ctx.accountManager.getAccount(alice)
    expect(account?.did).toEqual(alice)
    expect(account?.handle).toEqual('alice.test')
  })

  it('auths with both services.', async () => {
    console.log({ accessToken })
    console.log('entryway getSession')
    const entrywaySession = await entrywayAgent.com.atproto.server.getSession(
      undefined,
      {
        headers: SeedClient.getHeaders(accessToken),
      },
    )
    console.log('entryway Session', entrywaySession.data)
    console.log('pds getSession')
    const pdsSession = await pdsAgent.com.atproto.server.getSession(undefined, {
      headers: SeedClient.getHeaders(accessToken),
    })
    console.log('pds Session', pdsSession.data)
    expect(entrywaySession.data).toEqual(pdsSession.data)
  })

  it('updates handle from pds.', async () => {
    await pdsAgent.com.atproto.identity.updateHandle(
      { handle: 'alice2.test' },
      {
        headers: SeedClient.getHeaders(accessToken),
        encoding: 'application/json',
      },
    )
    const doc = await network.pds.ctx.idResolver.did.resolve(alice)
    const handleToDid =
      await network.pds.ctx.idResolver.handle.resolve('alice2.test')
    const accountFromPds =
      await network.pds.ctx.accountManager.getAccount(alice)
    const accountFromEntryway =
      await network.entryway.ctx.accountManager.getAccount(alice)

    console.log('pds updateHandle', {
      alice,
      doc,
      handleToDid,
      accountFromPds,
      accountFromEntryway,
    })

    expect(doc?.alsoKnownAs).toEqual(['at://alice2.test'])
    expect(handleToDid).toEqual(alice)
    expect(accountFromPds?.handle).toEqual('alice2.test')
    expect(accountFromEntryway?.handle).toEqual('alice2.test')
  })

  it('updates handle from entryway.', async () => {
    await entrywayAgent.com.atproto.identity.updateHandle(
      { handle: 'alice3.test' },
      await network.pds.ctx.serviceAuthHeaders(
        alice,
        'did:example:entryway',
        'com.atproto.identity.updateHandle',
      ),
    )
    const doc = await network.entryway.ctx.idResolver.did.resolve(alice, true)
    const handleToDid =
      await network.entryway.ctx.idResolver.handle.resolve('alice3.test')
    const accountFromPds =
      await network.pds.ctx.accountManager.getAccount(alice)
    const accountFromEntryway =
      await network.entryway.ctx.accountManager.getAccount(alice)

    console.log('entryway updateHandle', {
      alice,
      doc,
      handleToDid,
      accountFromPds,
      accountFromEntryway,
    })

    expect(doc?.alsoKnownAs).toEqual(['at://alice3.test'])
    expect(handleToDid).toEqual(alice)
    expect(accountFromPds?.handle).toEqual('alice3.test')
    expect(accountFromEntryway?.handle).toEqual('alice3.test')
  })

  it('does not allow bringing own op to account creation.', async () => {
    const {
      data: { signingKey },
    } = await pdsAgent.com.atproto.server.reserveSigningKey({})
    const rotationKey = await Secp256k1Keypair.create()
    const plcCreate = await plcLib.createOp({
      signingKey,
      rotationKeys: [
        rotationKey.did(),
        network.entryway.ctx.plcRotationKey.did(),
      ],
      handle: 'weirdalice.test',
      pds: network.pds.ctx.cfg.service.publicUrl,
      signer: rotationKey,
    })
    const tryCreateAccount = pdsAgent.com.atproto.server.createAccount({
      did: plcCreate.did,
      plcOp: plcCreate.op,
      handle: 'weirdalice.test',
    })
    await expect(tryCreateAccount).rejects.toThrow('invalid plc operation')

    await network.processAll()
  })
})

// const createEntryway = async (
//   config: pdsEntryway.ServerEnvironment & {
//     adminPassword: string
//     jwtSigningKeyK256PrivateKeyHex: string
//     plcRotationKeyK256PrivateKeyHex: string
//   },
// ) => {
//   const signingKey = await Secp256k1Keypair.create({ exportable: true })
//   const recoveryKey = await Secp256k1Keypair.create({ exportable: true })
//   const env: pdsEntryway.ServerEnvironment = {
//     isEntryway: true,
//     recoveryDidKey: recoveryKey.did(),
//     serviceHandleDomains: ['.test'],
//     dbPostgresUrl: process.env.DB_POSTGRES_URL,
//     blobstoreDiskLocation: path.join(os.tmpdir(), randomStr(8, 'base32')),
//     bskyAppViewUrl: 'https://appview.invalid',
//     bskyAppViewDid: 'did:example:invalid',
//     bskyAppViewCdnUrlPattern: 'http://cdn.appview.com/%s/%s/%s',
//     jwtSecret: randomStr(8, 'base32'),
//     repoSigningKeyK256PrivateKeyHex: await getPrivateHex(signingKey),
//     modServiceUrl: 'https://mod.invalid',
//     modServiceDid: 'did:example:invalid',
//     ...config,
//   }
//   const cfg = pdsEntryway.envToCfg(env)
//   const secrets = pdsEntryway.envToSecrets(env)
//   const server = await pdsEntryway.PDS.create(cfg, secrets)
//   await server.ctx.db.migrateToLatestOrThrow()
//   await server.start()
//   // patch entryway access token verification to handle internal service auth pds -> entryway
//   const origValidateAccessToken =
//     server.ctx.authVerifier.validateAccessToken.bind(server.ctx.authVerifier)
//   server.ctx.authVerifier.validateAccessToken = async (req, scopes) => {
//     const jwt = req.headers.authorization?.replace('Bearer ', '') ?? ''
//     const claims = decodeJwt(jwt)
//     if (claims.aud === 'did:example:entryway') {
//       assert(claims.lxm === parseReqNsid(req), 'bad lxm claim in service auth')
//       assert(claims.aud, 'missing aud claim in service auth')
//       assert(claims.iss, 'missing iss claim in service auth')
//       return {
//         artifacts: jwt,
//         credentials: {
//           type: 'access',
//           scope: 'com.atproto.access' as any,
//           audience: claims.aud,
//           did: claims.iss,
//         },
//       }
//     }
//     return origValidateAccessToken(req, scopes)
//   }
//   // @TODO temp hack because entryway teardown calls signupActivator.run() by mistake
//   server.ctx.signupActivator.run = server.ctx.signupActivator.destroy
//   return server
// }

// const getPublicHex = (key: Secp256k1Keypair) => {
//   return key.publicKeyStr('hex')
// }

// const getPrivateHex = async (key: Secp256k1Keypair) => {
//   return ui8.toString(await key.export(), 'hex')
// }
