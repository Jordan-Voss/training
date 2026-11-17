# Training runbook

## Current setup

The application reuses the existing Supabase project, with isolated `training_*` tables and a private `training-videos` bucket. Existing game application tables and policies were preserved. Only the existing athlete account is in `training_members`; membership is not derived from editable user metadata. New accounts have no Training access unless an administrator adds their user ID deliberately.

`supabase/migrations/` contains the exact migrations applied to the hosted project. The files use the versions returned by the database migration history. The CLI's migration command was attempted first but could not operate in this environment's read-only home directory; the Supabase connector applied the migrations, and their returned versions were used for the reproducible files. Do not reapply them to the existing project. Use the ordered files on a new development project and add only the intended athlete to `training_members`.

The existing project has other applications, so add Training URLs to Auth's redirect allow-list without replacing its existing Site URL or other redirects:

- `https://training.jordanvoss.dev/auth/callback`
- `training://auth/callback`
- The localhost callback used for local development, when needed.

Use Profile to send a sign-in email. The client does not create new users through that action. The email link returns to Training. One-time code verification is available if the project's email template includes its token. End-to-end email delivery and redirect configuration must be verified with the athlete's own sign-in.

## Local and web builds

Use Node 24 and `npm ci`. Copy `.env.example` to ignored `.env` and fill the public Supabase URL, publishable key and API origin. Publishable keys are designed for clients; RLS protects the records. Never substitute a privileged Supabase key.

`npm run web` runs Expo's web dev server. `npm run build:web` creates the Expo export and offline shell. `npm run worker:build` uses the pinned Cloudflare Vite plugin to package the Worker and copy that export. Vite does not replace the shared React Native frontend. `npm run worker:check` validates the prepared deployment without uploading it. `npm run deploy` performs the full web/Worker build and deploy.

For restricted environments where Expo cannot create its local CLI state directory, this project's verified command used `__UNSAFE_EXPO_HOME_DIRECTORY=/tmp/training-expo EXPO_OFFLINE=1 npm run build:web`. This is an execution-environment workaround, not an app setting. Do not change `HOME`.

The Cloudflare production trigger watches `codex/training-mvp`, the implementation branch submitted for review. After merging the pull request, change that trigger to the intended permanent branch, normally `main`. It runs type checks, domain/endpoint tests, Expo export and the Worker build before deploying. Build variables include only public client configuration and Node version; backend secrets are separate.

## Backend secrets

The Cloudflare plugin connection is an administration capability; the app cannot use its credentials. Open Cloudflare → Workers & Pages → `training` → Settings → Variables and Secrets, add each required value with type **Secret**, then deploy the change. Use the secure dashboard input; never put a secret value in a shell argument or paste it into chat. The pinned CLI's generated `workers secrets update` command exposes a `--text` argument, so it is not the recommended entry path for private values.

| Secret                              | Purpose                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SECRET_KEY`               | Server-only scoped-grant validation and temporary private-media signing; also durable sheet job administration |
| `GOOGLE_SERVICE_ACCOUNT_JSON`       | Dedicated Google service account with read-only Sheets scope                                                   |
| `GOOGLE_WRITE_SERVICE_ACCOUNT_JSON` | Separate optional write credential, initially shared only with the test copy                                   |
| `GARMIN_PERSONAL_API_KEY`           | The owner's personal Garmin key                                                                                |

Only the backend declares these names. None uses an `EXPO_PUBLIC_` prefix. `.dev.vars.example` lists empty names for local use; actual `.dev.vars`, `.env`, certificates and provisioning files are ignored. Runtime status reports whether a secret is configured, without returning its value. Keep `SHEETS_WRITEBACK_ENABLED` false until the test-copy procedure is complete. Missing services report that they need setup; local logging works independently.

## Google authorisation and programme versions

Create a dedicated Google Cloud service account, enable the Sheets API, and share the workbook with that account as a viewer. Store its JSON credential securely as `GOOGLE_SERVICE_ACCOUNT_JSON`. The runtime exchanges a short-lived assertion with the exact `spreadsheets.readonly` scope and uses the direct Sheets API. Chat's Google Drive authorisation is not the app's runtime credential.

The initial private snapshot was captured through the connected Drive account. In Programme, preview the selected source tab and explicitly accept it as the first block, an update to future sessions, or a new block. Configure the round count. The tab name is not a calendar week. Hidden tabs are never automatically activated. The current adapter supports verified numbered-day layouts and a separate routine adapter for the inspected rugby warm-up/plyometric tab. Other layouts stop for review.

The original source's `Week 1` has numeric sheet ID 0 and ten numbered days. Top-weight cells are column F, athlete/coach notes are K, and derived back-offs are H. Column L is completion there and has a different meaning in later tabs. These observations are source-specific, not a universal column map. Back-off targets use verified percentages and the original MROUND increment. Date-stored RPE ranges retain their displayed text and raw number/date format. Ambiguous notes and complex labels remain flagged. Existing legacy top weights remain provenance, not manufactured set histories.

Every accepted source stores a new immutable version and an unverified mapping record. Started/completed sessions retain their frozen prescription. A new mapping supersedes older destinations during write-job checks without modifying historical records. Explicitly review new blocks and per-round destinations when cells are reused.

## Writeback test and enabling procedure

Real workbook writeback remains off. A private complete copy was created in the Drive `ChatGPT` folder, with a different workbook ID. Its inspected `Week 1` test writes changed only the top-weight and notes input values; derived formulas, number formats, 1–7 RPE validation, date-stored RPE and the completion checkbox were preserved. The modified cells were restored after the check. This verifies connector-backed cell behaviour; it does not verify the app's own Google credential or a concurrent human edit.

Before enabling runtime writes:

1. Point the runtime workbook setting at a test copy and authorise only that copy for the write credential. Preview and accept a test programme for the authorised athlete. Choose a specific source tab and round.
2. Review the exact `training_source_mappings` row: owner, block generation, round, workbook, sheet ID, range, fingerprint, row labels and current destinations. Keep existing results protected. Only an administrator can mark both the row and its mapping JSON as verified/write-enabled; clients can insert unverified mappings only.
3. Test `/api/sheets/queue` with a cloud-saved session ID. It prepares only an actual top-set weight and athlete notes, with a deterministic revision/exercise idempotency key. While disabled, jobs are durably held. No completion, session RPE or detailed set writes are prepared.
4. On the copy, verify successful writes, duplicate submission, a lost response after commit, partial/uncertain failure, retry ordering, a human note edit, existing result conflicts, new prescription fingerprints and a different block/round mapping. Held jobs require reconciliation; do not blindly mark them pending.
5. Run `/api/sheets/run` or allow the 15-minute scheduler to process verified jobs. Read back inputs, formulas, formats and validation. A leased job recovers after a worker interruption. Confirm the same destination is still latest immediately before writing.
6. Only after review, repeat the mapping process for the intended real workbook and enable the server flag. Keep a record of this decision. There is no Google Sheets cell compare-and-swap, so a human edit between the final read and batch update is a remaining race; production writeback is deliberately gated pending this operating decision.

Notes preserve the source prefix and add a clearly marked Training athlete section. Formula destinations are rejected. A superseded mapping, reused cell, different round, changed exercise label or existing conflicting result holds the job while the original training result stays in Supabase. Do not write expiring storage URLs into the workbook.

## Garmin

Set the key through the backend dashboard's encrypted secret input described above. The configured owner ID must match the athlete who owns that personal key. Never enter the key into Profile or a client environment variable. The current implementation uses Garmin's official Personal API token exchange and activity search paths, verified against its official Python client. Personal keys have user-selected expiry; access tokens last up to 24 hours. No refresh token is used. The import obtains a fresh token and fetches a bounded 20-activity page, exposing the next offset in its API response.

Profile imports available activities, retains raw provenance and stable external IDs, and offers possible same-sport/time matches. Matching is explicit; source activities do not silently create another counted workout. JSON, TCX and GPX imports and manual activity logging remain available. FIT binary import is not implemented. Actual account fields, access, limits and terms must be checked with the owner's key before relying on a metric. Missing fields stay missing. Replace expired/revoked keys through the same secure secret path.

Official sources: [Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api/), [FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/), [official client](https://github.com/garmin/connect-personal-api-python).

## Videos and viewer links

Attach one or more videos to a specific set. Native selection copies the original into app documents, then optionally compresses to 1280px before a foreground upload. Browser blobs are persisted in IndexedDB and retain their selected format. Pending metadata and the TUS upload URL are persisted before sending chunks. Thumbnails are generated where the platform supports them. Upload progress and retry state are independent of workout edits. If compression is interrupted, retry uses the preserved original. A prepared cloud file must fit the current 50 MiB per-object limit.

Training resumes uploads while open or when returning to the foreground. It does not claim unlimited iOS background execution. Real iPhone recording, compression, playback, interruption and storage recovery remain required device checks.

The bucket is private. Explicit session viewer grants contain a selected list of uploaded media IDs. Anyone possessing the viewer link can access that selected content until revocation/expiry. Revoking the grant stops new temporary media access; existing signed URLs expire within 60 seconds. Sharing uses the native share sheet only when requested by the athlete. Automatic deletion/retention is off. Storage usage is derived from the athlete's media records; check Supabase's dashboard for total account usage and billing.

## Recovery

Device save failure: keep the current screen open, free device storage and retry the edit. Do not reset the app. Export the notebook from Profile before any manual recovery. Browser site-data deletion and native app removal erase that device's unsynced data; uploaded records remain in Supabase.

Cloud failure: use Retry sync after reconnecting. Operations and revisions are persisted together. Unknown server success is retried with the same operation ID, so the server returns its existing receipt. A version conflict keeps both the device result and server record. Use Compare cloud version in Profile, review the results side by side, then explicitly choose the cloud version or device changes. Both copies are retained in a device recovery backup and notebook export; a later server edit causes another revision conflict. Never clear an outbox to hide a conflict. Demo data is a separate local scope and is not promoted to personal data.

Video failure: retain the original local file. Retry resumes its stored upload URL. If a TUS upload has expired, reconcile whether the object already completed before starting a fresh upload; the current UI retains the error for review rather than overwriting an existing object. A new device can access uploaded videos through its own temporary signed URL.

Sheets failure: do not replay against a new block or round. Check the latest mapping and current input values. If the desired result is already present with the same session marker, acknowledge it. Otherwise preserve/hold the job and reconcile the conflicting source value. Mapping verification is never inferred from a tab name alone.

## Costs and limits

No new Supabase project, paid transcoding service, D1/KV/Queue resource or subscription was created. The existing Supabase organisation is on Free. Its allowances are shared with other applications: 1 GB file storage and 5 GB uncached egress, plus 5 GB cached Storage egress. Media can consume those allowances quickly; medium compression and explicit manual cleanup are available, with automatic retention off. See [Supabase pricing](https://supabase.com/pricing) and [Storage bandwidth](https://supabase.com/docs/guides/storage/serving/bandwidth).

Cloudflare static asset requests/storage have no additional charge. The Workers Free allowance is 100,000 invocations/day and 10 ms CPU per invocation; asset routing runs the Worker only for API/viewer paths. The package is below the Free Worker size limit. Actual integration CPU and traffic must be observed after credentials are configured. Do not enable a paid Workers plan to conceal an over-limit request. Current sources: [static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Cloud builds and Apple Developer membership can have their own quotas/costs. Check the account's current allowance and Apple membership before starting a paid build. This handoff does not create an Apple membership or sign an IPA without the owner's account.

## iPhone ad hoc installation

Keep bundle ID `dev.jordanvoss.training`. Do not create a second identity for rebuilds. Install Xcode and command-line tools on a Mac for local native work, or use Expo's cloud build with an existing Apple Developer Program membership.

1. Sign in securely with `npx eas-cli@27.10.0 login`, then run `npx eas-cli@27.10.0 init`. This associates the existing repository with the owner's Expo project and adds its real project ID. Do not invent one.
2. Add the public client environment settings to the development/preview/production Expo environments. Add no backend keys. Use `npx eas-cli@27.10.0 device:create` to register the physical iPhone's UDID through Expo's enrolment link.
3. Run `npm run ios:build` for an internally distributed preview, or use the development profile for a development client. Follow the secure Apple signing prompts. Keep `.p12`, `.mobileprovision`, Apple credentials and passwords out of source control and chat.
4. Install from the returned Expo build URL on a provisioned device. Enable iOS Developer Mode when required. The installation URL is only available after a real signed build; none is fabricated in this handoff.
5. Record the actual certificate and provisioning-profile expiration shown by the build credentials. Ad hoc profiles typically expire after 12 months, but the actual profile/certificate dates are authoritative. On a Mac, inspect the profile with `security cms -D -i path/to/profile.mobileprovision` and its `ExpirationDate`; inspect the signing certificate's actual `Not After`. No exact expiry is claimed before credentials exist.
6. Before expiry, use `npx eas-cli@27.10.0 build:resign` to re-sign an existing IPA with the renewed ad hoc profile, including registered devices, or rebuild the same bundle ID. Install the new signed build before the old one expires. Keep cloud records synced and export unsynced device data first. Removing a device/profile can affect existing installs; review the Apple team before changing it.

Local Mac build: `npm ci`, configure `.env`, `npx expo prebuild --platform ios`, then `npx expo run:ios --device`. Use Xcode's Signing & Capabilities to select the owner's team and device. Generated `ios/` is intentionally ignored. To archive for ad hoc distribution, open the generated workspace, archive with the intended distribution certificate/profile, and export using Xcode's supported ad hoc distribution flow. Signing cannot be verified on this Linux workspace.

The production build profile preserves a future App Store path. App Store submission, privacy declarations, review and any unlisted-distribution request are separate. Unlisted distribution requires Apple's approval and is not guaranteed.

Official installation references: [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/), [credentials](https://docs.expo.dev/app-signing/app-credentials/), [iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/).
