import { IncomingHttpHeaders, ServerResponse } from 'node:http'
import { PassThrough, Readable, finished } from 'node:stream'
import { Request } from 'express'
import { Dispatcher } from 'undici'
import { Agent } from '@atproto/api'
import {
  decodeStream,
  getPdsEndpoint,
  getServiceEndpoint,
  omit,
  streamToNodeBuffer,
} from '@atproto/common'
import { RpcPermissionMatch } from '@atproto/oauth-scopes'
import { ResponseType, XRPCError as XRPCClientError } from '@atproto/xrpc'
import {
  CatchallHandler,
  HandlerPipeThroughBuffer,
  HandlerPipeThroughStream,
  InternalServerError,
  InvalidRequestError,
  XRPCError as XRPCServerError,
  excludeErrorResult,
  parseReqNsid,
} from '@atproto/xrpc-server'
import { buildProxiedContentEncoding } from '@atproto-labs/xrpc-utils'
import { AppContext } from '.'

export const proxyHandler = (ctx: AppContext): CatchallHandler => {
  const performAuth = ctx.authVerifier.authorization<RpcPermissionMatch>({
    authorize: (permissions, { params }) => permissions.assertRpc(params),
  })

  return async (req, res, next) => {
    // /!\ Hot path
    try {
      if (
        req.method !== 'GET' &&
        req.method !== 'HEAD' &&
        req.method !== 'POST'
      ) {
        throw new XRPCServerError(
          ResponseType.InvalidRequest,
          'XRPC requests only supports GET and POST',
        )
      }

      const body = req.method === 'POST' ? req : undefined
      if (body != null && !body.readable) {
        // Body was already consumed by a previous middleware
        throw new InternalServerError('Request body is not readable')
      }

      const lxm = parseReqNsid(req)

      const { url: origin, did: aud } = await parseProxyInfo(ctx, req, lxm)

      console.log({ origin, aud, lxm, headers: req.headers })

      const authResult = await performAuth({ req, res, params: { lxm, aud } })

      const { credentials } = excludeErrorResult(authResult)

      // if (
      //   credentials.type === 'access' &&
      //   !isAccessPrivileged(credentials.scope) &&
      //   PRIVILEGED_METHODS.has(lxm)
      // ) {
      //   throw new InvalidRequestError('Bad token method', 'InvalidToken')
      // }

      // The following didn't work because com.atproto.server.getServiceAuth is a protected method,
      // so I can't call it from here:
      //
      // const didDoc = await ctx.idResolver.did.resolve(credentials.did, false)
      // if (didDoc === null) {
      //   throw new InternalServerError(
      //     `Failed to retrieve did document: ${credentials.did}`,
      //   )
      // }

      // const pdsEndpoint = getPdsEndpoint(didDoc)
      // if (pdsEndpoint === undefined) {
      //   throw new InternalServerError(
      //     `Failed to retrieve pds endpoint from did document: ${credentials.did}`,
      //   )
      // }
      // const pdsAgent = new Agent({
      //   service: pdsEndpoint,
      // })
      // const token = await pdsAgent.com.atproto.server.getServiceAuth(
      //   {
      //     aud,
      //     lxm,
      //   },
      //   {
      //     headers: {
      //       Authorization: req.headers.authorization,
      //     },
      //   },
      // )

      // if (!token.success) {
      //   throw new InternalServerError('Failed to get service auth token')
      // }

      // const serviceToken = token.data.token

      // console.log(
      //   { serviceToken, did: credentials.did, aud, lxm },
      //   'pipethrough',
      // )

      const headers: IncomingHttpHeaders = {
        'accept-encoding': req.headers['accept-encoding'] || 'identity',
        'accept-language': req.headers['accept-language'],
        'atproto-accept-labelers': req.headers['atproto-accept-labelers'],
        'x-bsky-topics': req.headers['x-bsky-topics'],

        'content-type': body && req.headers['content-type'],
        'content-encoding': body && req.headers['content-encoding'],
        'content-length': body && req.headers['content-length'],

        // authorization: `Bearer ${serviceToken}`,
        authorization: req.headers.authorization,
      }

      const dispatchOptions: Dispatcher.RequestOptions = {
        origin,
        method: req.method,
        path: req.originalUrl,
        body,
        headers,
      }

      await pipethroughStream(ctx, dispatchOptions, (upstream) => {
        res.status(upstream.statusCode)

        for (const [name, val] of responseHeaders(upstream.headers)) {
          res.setHeader(name, val)
        }

        // Note that we should not need to manually handle errors here (e.g. by
        // destroying the response), as the http server will handle them for us.
        res.on('error', logResponseError)

        // Tell undici to write the upstream response directly to the response
        return res
      })
    } catch (err) {
      next(err)
    }
  }
}

export type PipethroughOptions = {
  /**
   * Specify the issuer (requester) for service auth. If not provided, no
   * authorization headers will be added to the request.
   */
  iss?: string

  /**
   * Override the audience for service auth. If not provided, the audience will
   * be determined based on the proxy service.
   */
  aud?: string

  /**
   * Override the lexicon method for service auth. If not provided, the lexicon
   * method will be determined based on the request path.
   */
  lxm?: string
}

export async function pipethrough(
  ctx: AppContext,
  req: Request,
  options?: PipethroughOptions,
): Promise<
  HandlerPipeThroughStream & {
    stream: Readable
    headers: Record<string, string>
    encoding: string
  }
> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // pipethrough() is used from within xrpcServer handlers, which means that
    // the request body either has been parsed or is a readable stream that has
    // been piped for decoding & size limiting. Because of this, forwarding the
    // request body requires re-encoding it. Since we currently do not use
    // pipethrough() with procedures, proxying of request body is not
    // implemented.
    throw new InternalServerError(
      `Proxying of ${req.method} requests is not supported`,
    )
  }

  const lxm = parseReqNsid(req)

  const { url: origin, did: aud } = await parseProxyInfo(ctx, req, lxm)

  const didDoc = await ctx.idResolver.did.resolve(aud)
  console.log({ didDoc })
  // const url = getServiceEndpoint(didDoc!, { id: serviceId })
  // const pdsAgent =
  // const authorization = server.com.atproto.server.getServiceAuth

  const dispatchOptions: Dispatcher.RequestOptions = {
    origin,
    method: req.method,
    path: req.originalUrl,
    headers: {
      'accept-language': req.headers['accept-language'],
      'atproto-accept-labelers': req.headers['atproto-accept-labelers'],
      'x-bsky-topics': req.headers['x-bsky-topics'],

      // Because we sometimes need to interpret the response (e.g. during
      // read-after-write, through asPipeThroughBuffer()), we need to ask the
      // upstream server for an encoding that both the requester and the PDS can
      // understand. Since we might have to do the decoding ourselves, we will
      // use our own preferences (and weight) to negotiate the encoding.
      'accept-encoding': buildProxiedContentEncoding(
        req.headers['accept-encoding'],
        ctx.cfg.proxy.preferCompressed,
      ),

      authorization: options?.iss
        ? `Bearer ${await ctx.serviceAuthJwt(options.iss, options.aud ?? aud, options.lxm ?? lxm)}`
        : undefined,
    },

    // Use a high water mark to buffer more data while performing async
    // operations before this stream is consumed. This is especially useful
    // while processing read-after-write operations.
    highWaterMark: 2 * 65536, // twice the default (64KiB)
  }

  const { headers, body } = await pipethroughRequest(ctx, dispatchOptions)

  return {
    encoding: safeString(headers['content-type']) ?? 'application/json',
    headers: Object.fromEntries(responseHeaders(headers)),
    stream: body,
  }
}

// Request setup/formatting
// -------------------

export function computeProxyTo(
  ctx: AppContext,
  req: Request,
  lxm: string,
): string {
  const proxyToHeader = req.header('atproto-proxy')
  if (proxyToHeader) return proxyToHeader

  const service = defaultService(ctx, lxm)
  if (service.serviceInfo) {
    return `${service.serviceInfo.did}#${service.serviceId}`
  }

  throw new InvalidRequestError(`No service configured for ${lxm}`)
}

export async function parseProxyInfo(
  ctx: AppContext,
  req: Request,
  lxm: string,
): Promise<{ url: string; did: string }> {
  // /!\ Hot path

  const proxyToHeader = req.header('atproto-proxy')
  if (proxyToHeader) return parseProxyHeader(ctx, proxyToHeader)

  const { serviceInfo } = defaultService(ctx, lxm)
  if (serviceInfo) return serviceInfo

  throw new InvalidRequestError(`No service configured for ${lxm}`)
}

export const parseProxyHeader = async (
  // Using subset of AppContext for testing purposes
  ctx: Pick<AppContext, 'cfg' | 'idResolver'>,
  proxyTo: string,
): Promise<{ did: string; url: string }> => {
  // /!\ Hot path

  const hashIndex = proxyTo.indexOf('#')

  if (hashIndex === 0) {
    throw new InvalidRequestError('no did specified in proxy header')
  }

  if (hashIndex === -1 || hashIndex === proxyTo.length - 1) {
    throw new InvalidRequestError('no service id specified in proxy header')
  }

  // More than one hash
  if (proxyTo.indexOf('#', hashIndex + 1) !== -1) {
    throw new InvalidRequestError('invalid proxy header format')
  }

  // Basic validation
  if (proxyTo.includes(' ')) {
    throw new InvalidRequestError('proxy header cannot contain spaces')
  }

  const did = proxyTo.slice(0, hashIndex)

  // Special case a configured appview, while still proxying correctly any other appview
  if (
    ctx.cfg.bskyAppView &&
    proxyTo === `${ctx.cfg.bskyAppView.did}#bsky_appview`
  ) {
    return { did, url: ctx.cfg.bskyAppView.url }
  }

  const didDoc = await ctx.idResolver.did.resolve(did)
  if (!didDoc) {
    throw new InvalidRequestError('could not resolve proxy did')
  }

  const serviceId = proxyTo.slice(hashIndex)
  const url = getServiceEndpoint(didDoc, { id: serviceId })
  if (!url) {
    throw new InvalidRequestError('could not resolve proxy did service url')
  }

  return { did, url }
}

/**
 * Utility function that wraps the undici stream() function and handles request
 * and response errors by wrapping them in XRPCError instances. This function is
 * more efficient than "pipethroughRequest" when a writable stream to pipe the
 * upstream response to is available.
 */
async function pipethroughStream(
  ctx: AppContext,
  dispatchOptions: Dispatcher.RequestOptions,
  successStreamFactory: Dispatcher.StreamFactory,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    void ctx.proxyAgent
      .stream(dispatchOptions, (upstream) => {
        if (upstream.statusCode >= 400) {
          const passThrough = new PassThrough()

          void tryParsingError(upstream.headers, passThrough).then((parsed) => {
            const xrpcError = new XRPCClientError(
              upstream.statusCode === 500
                ? ResponseType.UpstreamFailure
                : upstream.statusCode,
              parsed.error,
              parsed.message,
              Object.fromEntries(responseHeaders(upstream.headers, false)),
              { cause: dispatchOptions },
            )

            reject(xrpcError)
          }, reject)

          return passThrough
        }

        const writable = successStreamFactory(upstream)

        // As soon as the control was passed to the writable stream (i.e. by
        // returning the writable hereafter), pipethroughStream() is considered
        // to have succeeded. Any error occurring while writing upstream data to
        // the writable stream should be handled through the stream's error
        // state (i.e. successStreamFactory() must ensure that error events on
        // the returned writable will be handled).
        resolve()

        return writable
      })
      // The following catch block will be triggered with either network errors
      // or writable stream errors. In the latter case, the promise will already
      // be resolved, and reject()ing it there after will have no effect. Those
      // error would still be logged by the successStreamFactory() function.
      .catch(handleUpstreamRequestError)
      .catch(reject)
  })
}

/**
 * Utility function that wraps the undici request() function and handles request
 * and response errors by wrapping them in XRPCError instances.
 */
async function pipethroughRequest(
  ctx: AppContext,
  dispatchOptions: Dispatcher.RequestOptions,
) {
  // HandlerPipeThroughStream requires a readable stream to be returned, so we
  // use the (less efficient) request() function instead.

  const upstream = await ctx.proxyAgent
    .request(dispatchOptions)
    .catch(handleUpstreamRequestError)

  if (upstream.statusCode >= 400) {
    const parsed = await tryParsingError(upstream.headers, upstream.body)

    // Note "XRPCClientError" is used instead of "XRPCServerError" in order to
    // allow users of this function to capture & handle these errors (namely in
    // "app.bsky.feed.getPostThread").
    throw new XRPCClientError(
      upstream.statusCode === 500
        ? ResponseType.UpstreamFailure
        : upstream.statusCode,
      parsed.error,
      parsed.message,
      Object.fromEntries(responseHeaders(upstream.headers, false)),
      { cause: dispatchOptions },
    )
  }

  return upstream
}

function handleUpstreamRequestError(
  err: unknown,
  message = 'Upstream service unreachable',
): never {
  console.error({ err }, message)
  throw new XRPCServerError(ResponseType.UpstreamFailure, message, undefined, {
    cause: err,
  })
}

// Request parsing/forwarding
// -------------------

export function isJsonContentType(contentType?: string): boolean | undefined {
  if (!contentType) return undefined
  return /application\/(?:\w+\+)?json/i.test(contentType)
}

async function tryParsingError(
  headers: IncomingHttpHeaders,
  readable: Readable,
): Promise<{ error?: string; message?: string }> {
  if (isJsonContentType(headers['content-type']) === false) {
    // We don't known how to parse non JSON content types so we can discard the
    // whole response.

    // Since we don't care about the response, we would normally just destroy
    // the stream. However, if the underlying HTTP connection is an HTTP/1.1
    // connection, this also destroys the underlying (keep-alive) TCP socket. In
    // order to avoid destroying the TCP socket, while avoiding the cost of
    // consuming too much IO, we give it a chance to finish first.

    // @NOTE we need to listen (and ignore) "error" events, otherwise the
    // process could crash (since we drain the stream asynchronously here). This
    // is performed through the "finished" call below.

    const to = setTimeout(() => {
      readable.destroy()
    }, 100)
    finished(readable, (_err) => {
      clearTimeout(to)
    })
    readable.resume()

    return {}
  }

  try {
    const buffer = await bufferUpstreamResponse(
      readable,
      headers['content-encoding'],
    )

    const errInfo: unknown = JSON.parse(buffer.toString('utf8'))
    return {
      error: safeString(errInfo?.['error']),
      message: safeString(errInfo?.['message']),
    }
  } catch (err) {
    // Failed to read, decode, buffer or parse. No big deal.
    return {}
  }
}

async function bufferUpstreamResponse(
  readable: Readable,
  contentEncoding?: string | string[],
): Promise<Buffer> {
  try {
    return await streamToNodeBuffer(decodeStream(readable, contentEncoding))
  } catch (err) {
    if (!readable.destroyed) readable.destroy()

    throw new XRPCServerError(
      ResponseType.UpstreamFailure,
      err instanceof TypeError ? err.message : 'unable to decode request body',
      undefined,
      { cause: err },
    )
  }
}

export async function asPipeThroughBuffer(
  input: HandlerPipeThroughStream,
): Promise<HandlerPipeThroughBuffer> {
  return {
    buffer: await bufferUpstreamResponse(
      input.stream,
      input.headers?.['content-encoding'],
    ),
    headers: omit(input.headers, ['content-encoding', 'content-length']),
    encoding: input.encoding,
  }
}

// Response parsing/forwarding
// -------------------

const RES_HEADERS_TO_FORWARD = [
  'atproto-repo-rev',
  'atproto-content-labelers',
  'retry-after',
]

function* responseHeaders(
  headers: IncomingHttpHeaders,
  includeContentHeaders = true,
): Generator<[string, string]> {
  if (includeContentHeaders) {
    const length = headers['content-length']
    if (length) yield ['content-length', length]

    const encoding = headers['content-encoding']
    if (encoding) yield ['content-encoding', encoding]

    const type = headers['content-type']
    if (type) yield ['content-type', type]

    const language = headers['content-language']
    if (language) yield ['content-language', language]
  }

  for (let i = 0; i < RES_HEADERS_TO_FORWARD.length; i++) {
    const name = RES_HEADERS_TO_FORWARD[i]
    const val = headers[name]

    if (val != null) {
      const value: string = Array.isArray(val) ? val.join(',') : val
      yield [name, value]
    }
  }
}

// Utils
// -------------------

const defaultService = (
  ctx: AppContext,
  _nsid: string,
): {
  serviceId: string
  serviceInfo: { url: string; did: string } | null
} => {
  return {
    serviceId: 'bsky_appview',
    serviceInfo: ctx.cfg.bskyAppView,
  }
}

const safeString = (str: unknown): string | undefined => {
  return typeof str === 'string' ? str : undefined
}

function logResponseError(this: ServerResponse, err: unknown): void {
  console.error({ err }, 'error forwarding upstream response')
}
