# TODO for fully functional entryway

For a fully functional entryway, you'd need to implement
all of the following XRPC methods (I've marked the ones already implemented):

- [ ] ctx.entrywayAgent.com.atproto.admin.sendEmail
- [ ] ctx.entrywayAgent.com.atproto.admin.updateAccountEmail
- [ ] ctx.entrywayAgent.com.atproto.admin.updateAccountPassword
- [ ] ctx.entrywayAgent.com.atproto.identity.requestPlcOperationSignature
- [ ] ctx.entrywayAgent.com.atproto.identity.signPlcOperation
- [x] ctx.entrywayAgent.com.atproto.identity.updateHandle
- [ ] ctx.entrywayAgent.com.atproto.server.activateAccount
- [ ] ctx.entrywayAgent.com.atproto.server.confirmEmail
- [ ] ctx.entrywayAgent.com.atproto.server.createAppPassword
- [x] ctx.entrywayAgent.com.atproto.server.createSession
- [ ] ctx.entrywayAgent.com.atproto.server.deactivateAccount
- [ ] ctx.entrywayAgent.com.atproto.server.deleteAccount
- [ ] ctx.entrywayAgent.com.atproto.server.getAccountInviteCodes
- [x] ctx.entrywayAgent.com.atproto.server.getSession
- [ ] ctx.entrywayAgent.com.atproto.server.listAppPasswords
- [ ] ctx.entrywayAgent.com.atproto.server.refreshSession
- [ ] ctx.entrywayAgent.com.atproto.server.requestAccountDelete
- [ ] ctx.entrywayAgent.com.atproto.server.requestEmailConfirmation
- [ ] ctx.entrywayAgent.com.atproto.server.requestEmailUpdate
- [ ] ctx.entrywayAgent.com.atproto.server.requestPasswordReset
- [ ] ctx.entrywayAgent.com.atproto.server.resetPassword
- [ ] ctx.entrywayAgent.com.atproto.server.revokeAppPassword
- [ ] ctx.entrywayAgent.com.atproto.server.updateEmail

Theoretically, you should be able to just call these from the "pds" within the entryway:

```
const pds = await PDS.create(cfg, secrets)
```

Because that "pds" isn't in entryway mode, it's just a regular old pds, but they may need to use `authorizationOrUserServiceAuth` instead of `authorization` to authentication.
