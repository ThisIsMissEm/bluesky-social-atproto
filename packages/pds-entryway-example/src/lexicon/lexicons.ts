/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  type LexiconDoc,
  Lexicons,
  ValidationError,
  type ValidationResult,
} from '@atproto/lexicon'
import { type $Typed, is$typed, maybe$typed } from './util.js'

export const schemaDict = {
  ComAtprotoIdentityUpdateHandle: {
    lexicon: 1,
    id: 'com.atproto.identity.updateHandle',
    defs: {
      main: {
        type: 'procedure',
        description:
          "Updates the current account's handle. Verifies handle validity, and updates did:plc document if necessary. Implemented by PDS, and requires auth.",
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['handle'],
            properties: {
              handle: {
                type: 'string',
                format: 'handle',
                description: 'The new handle.',
              },
            },
          },
        },
      },
    },
  },
  ComAtprotoServerCreateAccount: {
    lexicon: 1,
    id: 'com.atproto.server.createAccount',
    defs: {
      main: {
        type: 'procedure',
        description: 'Create an account. Implemented by PDS.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['handle'],
            properties: {
              email: {
                type: 'string',
              },
              handle: {
                type: 'string',
                format: 'handle',
                description: 'Requested handle for the account.',
              },
              did: {
                type: 'string',
                format: 'did',
                description:
                  'Pre-existing atproto DID, being imported to a new account.',
              },
              inviteCode: {
                type: 'string',
              },
              verificationCode: {
                type: 'string',
              },
              verificationPhone: {
                type: 'string',
              },
              password: {
                type: 'string',
                description:
                  'Initial account password. May need to meet instance-specific password strength requirements.',
              },
              recoveryKey: {
                type: 'string',
                description:
                  'DID PLC rotation key (aka, recovery key) to be included in PLC creation operation.',
              },
              plcOp: {
                type: 'unknown',
                description:
                  'A signed DID PLC operation to be submitted as part of importing an existing account to this instance. NOTE: this optional field may be updated when full account migration is implemented.',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            description:
              'Account login session returned on successful account creation.',
            required: ['accessJwt', 'refreshJwt', 'handle', 'did'],
            properties: {
              accessJwt: {
                type: 'string',
              },
              refreshJwt: {
                type: 'string',
              },
              handle: {
                type: 'string',
                format: 'handle',
              },
              did: {
                type: 'string',
                format: 'did',
                description: 'The DID of the new account.',
              },
              didDoc: {
                type: 'unknown',
                description: 'Complete DID document.',
              },
            },
          },
        },
        errors: [
          {
            name: 'InvalidHandle',
          },
          {
            name: 'InvalidPassword',
          },
          {
            name: 'InvalidInviteCode',
          },
          {
            name: 'HandleNotAvailable',
          },
          {
            name: 'UnsupportedDomain',
          },
          {
            name: 'UnresolvableDid',
          },
          {
            name: 'IncompatibleDidDoc',
          },
        ],
      },
    },
  },
  ComAtprotoServerCreateSession: {
    lexicon: 1,
    id: 'com.atproto.server.createSession',
    defs: {
      main: {
        type: 'procedure',
        description: 'Create an authentication session.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['identifier', 'password'],
            properties: {
              identifier: {
                type: 'string',
                description:
                  'Handle or other identifier supported by the server for the authenticating user.',
              },
              password: {
                type: 'string',
              },
              authFactorToken: {
                type: 'string',
              },
              allowTakendown: {
                type: 'boolean',
                description:
                  'When true, instead of throwing error for takendown accounts, a valid response with a narrow scoped token will be returned',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['accessJwt', 'refreshJwt', 'handle', 'did'],
            properties: {
              accessJwt: {
                type: 'string',
              },
              refreshJwt: {
                type: 'string',
              },
              handle: {
                type: 'string',
                format: 'handle',
              },
              did: {
                type: 'string',
                format: 'did',
              },
              didDoc: {
                type: 'unknown',
              },
              email: {
                type: 'string',
              },
              emailConfirmed: {
                type: 'boolean',
              },
              emailAuthFactor: {
                type: 'boolean',
              },
              active: {
                type: 'boolean',
              },
              status: {
                type: 'string',
                description:
                  'If active=false, this optional field indicates a possible reason for why the account is not active. If active=false and no status is supplied, then the host makes no claim for why the repository is no longer being hosted.',
                knownValues: ['takendown', 'suspended', 'deactivated'],
              },
            },
          },
        },
        errors: [
          {
            name: 'AccountTakedown',
          },
          {
            name: 'AuthFactorTokenRequired',
          },
        ],
      },
    },
  },
  ComAtprotoServerGetSession: {
    lexicon: 1,
    id: 'com.atproto.server.getSession',
    defs: {
      main: {
        type: 'query',
        description:
          'Get information about the current auth session. Requires auth.',
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['handle', 'did'],
            properties: {
              handle: {
                type: 'string',
                format: 'handle',
              },
              did: {
                type: 'string',
                format: 'did',
              },
              email: {
                type: 'string',
              },
              emailConfirmed: {
                type: 'boolean',
              },
              emailAuthFactor: {
                type: 'boolean',
              },
              didDoc: {
                type: 'unknown',
              },
              active: {
                type: 'boolean',
              },
              status: {
                type: 'string',
                description:
                  'If active=false, this optional field indicates a possible reason for why the account is not active. If active=false and no status is supplied, then the host makes no claim for why the repository is no longer being hosted.',
                knownValues: ['takendown', 'suspended', 'deactivated'],
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Record<string, LexiconDoc>
export const schemas = Object.values(schemaDict) satisfies LexiconDoc[]
export const lexicons: Lexicons = new Lexicons(schemas)

export function validate<T extends { $type: string }>(
  v: unknown,
  id: string,
  hash: string,
  requiredType: true,
): ValidationResult<T>
export function validate<T extends { $type?: string }>(
  v: unknown,
  id: string,
  hash: string,
  requiredType?: false,
): ValidationResult<T>
export function validate(
  v: unknown,
  id: string,
  hash: string,
  requiredType?: boolean,
): ValidationResult {
  return (requiredType ? is$typed : maybe$typed)(v, id, hash)
    ? lexicons.validate(`${id}#${hash}`, v)
    : {
        success: false,
        error: new ValidationError(
          `Must be an object with "${hash === 'main' ? id : `${id}#${hash}`}" $type property`,
        ),
      }
}

export const ids = {
  ComAtprotoIdentityUpdateHandle: 'com.atproto.identity.updateHandle',
  ComAtprotoServerCreateAccount: 'com.atproto.server.createAccount',
  ComAtprotoServerCreateSession: 'com.atproto.server.createSession',
  ComAtprotoServerGetSession: 'com.atproto.server.getSession',
} as const
