# Lonca Panel waitlist worker

A Cloudflare Worker that stores waitlist sign-ups from the landing page
(`lonca.zanaat.dev`) in a D1 database. It accepts `POST` JSON
`{ email, lang, source, needs[], volume }` from allowed origins only and keeps
one row per email.

## Deploy (not done yet)

```bash
npx wrangler d1 create lonca-waitlist          # put the id into wrangler.toml
npx wrangler d1 execute lonca-waitlist --remote --file schema.sql
npx wrangler deploy                            # serves https://waitlist.zanaat.dev
```

Then build the docs site with `PUBLIC_WAITLIST_URL=https://waitlist.zanaat.dev`
(GitHub Actions variable for the docs workflow). Until that variable is set,
the landing page forms show "the waitlist opens soon" instead of posting.

## Read the list

```bash
npx wrangler d1 execute lonca-waitlist --remote \
  --command "SELECT email, lang, needs, volume, created_at FROM waitlist ORDER BY created_at DESC"
```
