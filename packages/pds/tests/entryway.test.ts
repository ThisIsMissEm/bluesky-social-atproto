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

  // cite: https://bsky.app/profile/matthieu.bsky.team/post/3lzslgavvds2k
  it('does not allow PDS methods through the entryway', async () => {
    expect(async () => {
      await entrywayAgent.com.atproto.repo.describeRepo(
        {
          repo: alice,
        },
        {
          headers: SeedClient.getHeaders(accessToken),
        },
      )
    }).rejects.toThrow('Method Not Implemented')
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
