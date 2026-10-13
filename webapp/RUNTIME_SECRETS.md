# Become runtime secrets

Become production server credentials are stored as one encrypted
`@redbtn/redsecrets` entry:

- app: `become`
- scope: `global`
- name: `BECOME_RUNTIME_CONFIG`
- database: `redshared`

The value is JSON matching the `RuntimeConfig` shape in
`lib/runtimeConfig.ts`. It may contain `auth`, `email`, `redis`, `blob`, `ai`,
`reward`, `push`, `admin`, `external`, `billing`, `review` and `app` sections.
Required application values include `auth.jwtSecret` and `auth.mongoUri`;
feature-specific credentials fail closed when their feature is used.

## `review` — the reviewer demo sign-in

```json
"review": {
  "enabled": true,
  "email": "app-review@become.redbtn.io",
  "code": "a-long-random-string"
}
```

The one door into a passwordless app that is not a magic link: the designated
demo account signs in with this code on the normal sign-in screen, so an App
Store or Play reviewer can get in without an inbox. See
`lib/reviewSignIn.ts` and the "Reviewer demo sign-in" section of `AGENTS.md`.

Three operational rules:

- **`enabled` must be exactly `true`.** Absent, false, or a code shorter than
  12 characters means the endpoint answers 404. That is the kill switch, and
  it takes effect within a minute on every running instance — no deploy and no
  restart, because the route reads this section with a max age.
- **`email` must be an address NO MEMBER IS USING.** The account is created on
  first use and flagged `isReviewAccount`; an address that already belongs to a
  member is refused rather than opened. Never point this at a real account.
- **`code` is a credential.** Rotate it after each review cycle by editing this
  payload; nothing else has to change.

The deployment receives only these two bootstrap values from the platform
secret manager:

- `REDSECRETS_MONGODB_URI` — MongoDB connection for the shared secret store.
- `SECRETS_ENCRYPTION_KEY` — key used by `@redbtn/redsecrets` to decrypt the
  runtime entry.

`NEXT_PUBLIC_*` values remain build-time public configuration and are not part
of this secret entry. Local development may use the documented `.env.example`
fallbacks; production never falls back to insecure defaults or direct
application credential environment reads.
