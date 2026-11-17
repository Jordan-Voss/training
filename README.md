# Training

A private athletic training notebook for iPhone and web, built with Expo, React Native, Supabase and Cloudflare Workers.

One Expo application serves iPhone and responsive web. It includes Today, Programme, History, Profile, a durable workout notebook, activity logs, reusable routines, private set videos, explicit sharing and integration endpoints. The website is configured for [training.jordanvoss.dev](https://training.jordanvoss.dev).

Start with clearly labelled local fixtures. Signing in switches to a separate personal notebook; demo sessions never sync to your account. The inspected ten-session coach programme and eleven warm-up/plyometric routines are staged privately in the existing Supabase project for review. They are not public fixtures or invented training history.

Back-off targets recalculate when a top-set weight changes, using the coach's percentage and verified rounding increment. Copying a target into unlogged back-off sets is explicit; completed loads are preserved.

```sh
nvm use
npm ci
cp .env.example .env
# Fill only the three public client settings.
npm run web
```

```sh
npm run typecheck
npm test
npm run build:web
npm run worker:build
npm run worker:check
```

The Cloudflare CLI and Worker build dependencies are pinned in the lockfile. A build does not enable paid infrastructure. `npm run deploy` builds the Expo website and Worker, then deploys to the configured Cloudflare account. The repository's production build trigger runs checks before deployment.

See [the runbook](docs/runbook.md) for private credentials, Google authorisation, safe sheet mappings, recovery, sharing, costs and installation. See [architecture](docs/architecture.md) for data boundaries and [verification](docs/verification.md) for evidence and remaining checks.

The native app requires a development build, not Expo Go. `npm run ios:build` uses the pinned Expo build CLI and the internal-distribution profile. Apple signing credentials and physical iPhone verification remain required. No Garmin key, Google private key, privileged Supabase key, signing certificate or provisioning profile belongs in source control or chat.
