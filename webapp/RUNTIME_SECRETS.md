# Become runtime secrets

Become production server credentials are stored as one encrypted
`@redbtn/redsecrets` entry:

- app: `become`
- scope: `global`
- name: `BECOME_RUNTIME_CONFIG`
- database: `redshared`

The value is JSON matching the `RuntimeConfig` shape in
`lib/runtimeConfig.ts`. It may contain `auth`, `email`, `redis`, `blob`, `ai`,
`reward`, `push`, `admin`, and `external` sections. Required application
values include `auth.jwtSecret` and `auth.mongoUri`; feature-specific
credentials fail closed when their feature is used.

The deployment receives only these two bootstrap values from the platform
secret manager:

- `REDSECRETS_MONGODB_URI` — MongoDB connection for the shared secret store.
- `SECRETS_ENCRYPTION_KEY` — key used by `@redbtn/redsecrets` to decrypt the
  runtime entry.

`NEXT_PUBLIC_*` values remain build-time public configuration and are not part
of this secret entry. Local development may use the documented `.env.example`
fallbacks; production never falls back to insecure defaults or direct
application credential environment reads.
