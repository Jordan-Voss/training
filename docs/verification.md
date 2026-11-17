# Verification

Checked on 17 November 2026. Evidence distinguishes implemented code, configured services and end-to-end checks requiring the owner's credentials/device.

## Implemented and checked

- TypeScript checks for the Expo client, shared domain and separately typed Worker pass.
- 43 domain/endpoint tests pass. They cover MROUND back-off rounding, missing values, pounds conversion, preserving completed back-off loads, distinct repeated sessions, frozen prescriptions, calendar-independent sequence advancement, warm-up/working totals, persistent operation recovery, duplicate receipts, revision conflicts, demo isolation, 1–7 session RPE, mixed prescriptions, protected notes/formulas, stale mappings, Garmin IDs/matching, file import, membership, revoked/expired sharing grants and bounded request bodies.
- An iOS Hermes JavaScript bundle exported successfully (6.6 MB); this validates native module resolution, not a signed native binary or physical-device behaviour.
- Expo's production web export and the Cloudflare build/dry-run pass. The Worker package is below the Free compressed-size limit. Dependencies and their lockfile are committed and runtime packages are pinned.
- A Playwright Chromium run exercised Today → Workout → History at desktop 1440×1000 and phone 390×844. Browser plugin was unavailable, so the installed Chromium/Playwright path was used.
- Entering 180 kg showed the 100% fixture back-off target; changing the top to 200 kg recalculated the target while an already completed 180 kg back-off stayed unchanged.
- With network disabled, notes were saved, the browser process was closed, and a new process restored the same workout from IndexedDB and the cached shell. It was finished with session RPE 7/7. Starting Day 1 in round 2 produced another session ID with empty results, retaining the earlier session. Demo outbox remained empty. No page errors occurred.
- Light/dark preferences, native-style bottom navigation and desktop rail were rendered. The phone workout has a persistent Finish action and compact top metadata. Keyboard inputs, labelled controls and 44px targets are provided.
- A browser check with a generated video and mocked viewer grants confirmed that access refresh preserves the video element and seek position, and a revoked response removes its media. This caught and fixed periodic video restarts; it does not verify real private Storage credentials.
- Live Supabase transaction tests, rolled back after execution, confirmed accepted-version/session inserts, duplicate-operation receipts, stale-revision rejection, frozen started prescriptions, rejection of session RPE 8 and separate round records. An unauthorised authenticated subject saw zero Training members, candidates, sessions or private objects.
- All new Training tables have RLS. The private video bucket requires the athlete prefix and owned metadata. Security advisors reported no Training-specific findings; unrelated pre-existing project notices were preserved.
- The connected Drive account read current metadata, raw/display values, formulas, number formats, validation and routine links. Ten training days and eleven routines were staged as private review candidates. No historical sets or dates were invented.
- A distinct private workbook copy was used for actual top-weight/notes-cell writes. Formula H9 recalculated correctly from the top set while retaining its formula. Top/notes formats, date-stored RPE, session RPE validation and completion checkbox were byte-for-byte preserved in the inspected API metadata. The copy's test cells were restored; the real workbook was not written.

## Visual comparison

Concept: `/workspace/generated_images/exec-a10efcab-ae5c-41a2-95b0-d4a0b18c9b3f.png`. Browser screenshots were saved under `/tmp/training-*.png` outside source control and inspected with `view_image` alongside the concept.

Comparison points: four-item navigation and selected cobalt state; supplied light/dark tokens; system typography and tabular values; open desktop two-column composition; outlined notebook rows; spacing/corners; phone set-entry density; persistent primary action; actual content wrapping; and purpose-specific History layout. A wrapped ORDER label and excessive phone metadata were repaired. Above-the-fold copy follows the requested Today/Workout vocabulary.

Intentional differences: real fixture/source prescriptions replace the concept's illustrative 2-rep examples; additional sports and source-review controls satisfy the brief; explicit demo/save states replace unsubstantiated success; the phone workout uses a focused stack with a persistent Finish action instead of bottom tabs during active entry. The primary design was compared directly at desktop and phone viewports. The generated board contains two different surfaces, so it is not a single native browser viewport.

| Comparison | Concept evidence | Render evidence and disposition |
| --- | --- | --- |
| Navigation and icons | Four labelled outline icons; cobalt selected row | Desktop rail and phone tabs retain those labels, metaphors and selected state. Focused workout navigation is intentional. |
| Copy | Today, Start workout, Choose a session, Finish workout | Main actions match. Fixture disclaimers, source prescriptions and back-off guidance are required functional additions; the illustrative rep counts and upcoming-day summaries are replaced by real data. |
| Table and typography | Open journal composition; aligned order, exercise and prescription columns | Wrapped ORDER was fixed with sufficient column width. System type and explicit control sizes retain hierarchy without oversized headings. |
| Palette and containers | Supplied cool background, white surfaces, cobalt; outlined set rows | Supplied tokens, restrained borders and corners are retained; no decorative gradient/glass was added. |
| Phone composition | Dense editable set rows and visible Finish action | Excess metadata was reduced and Finish made persistent. Rows fit 390 px without horizontal overflow; notes remain scrollable. |
| History and dark state | Purpose-specific surfaces required by brief | Actual session list/filter controls and dark tokens were inspected separately, rather than treating the Today board as their layout. |

The above-the-fold copy comparison found only the intentional functional additions listed above. No unresolved material visual mismatch was observed in the inspected views. Calculated contrast ratios for rendered token pairs were 16.73:1 for light primary text, 5.65:1 for light secondary text, 5.59:1 for the primary button, 4.90:1 for selected light navigation, and at least 5.01:1 for inspected dark text/control pairs. This is a component color check, not a full accessibility certification.

## Configured, awaiting owner credential checks

- Existing Supabase project, authorised athlete membership, schema, private bucket and staged source candidates are configured.
- Cloudflare Worker, repository connection, build trigger, public client build variables and target domain configuration are prepared through the connected account.
- Auth email delivery/redirects require the athlete's sign-in and allow-list check. Existing applications' Auth Site URL was not replaced.
- Live app-owned Google reads and durable result writes require dedicated Google credentials. Production writeback remains disabled. Copy-backed cell checks and domain conflict tests do not prove runtime authorisation or eliminate Google's read/write race.
- Garmin endpoints and response normalisation are implemented from official documentation/client sources. The owner's key, actual fields, terms, quotas and real account import remain unverified.
- Private media and scoped sharing code are implemented, with mocked revoked/expired grant tests. A real storage upload, interrupted TUS recovery and live revocation test still require the signed-in athlete/server secret.
- Native SQLite, Keychain, camera/library persistence, compression, thumbnails and native share sheet require a real iPhone development build. Browser testing is not an iPhone test. No signed IPA, physical capture/upload verification or exact signing expiry is claimed.
- Automatic video retention remains off. FIT binary parsing, background transfer outside the foreground recovery path, native UI accessibility testing and full native accessibility testing are outstanding.

## Dependency and existing-project notices

`npm audit` reports the current unfixed picomatch glob ReDoS advisory through Expo/Metro build tooling, plus a minimatch tooling advisory. The registry's latest picomatch at verification is 4.0.7, and npm's suggested forced downgrade would move Expo/React Native to incompatible old versions; it was not applied. The app accepts no user-supplied glob patterns. Recheck upstream before release; do not describe the dependency audit as clean.

The existing Supabase project has unrelated RLS informational findings on `admin_members`/`game_events` and a project-wide leaked-password-protection warning. No unrelated configuration was changed. References: [RLS linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).
