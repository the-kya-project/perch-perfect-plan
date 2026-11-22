# Branch cleanup, Nov 20–21, 2026: restore list

This lists every branch deleted in the Nov 2026 cleanup, so any of them can be brought back.
It was written **before** anything was deleted.

- **"Merged"** means the work is already in `main`: either its pull request was merged and nothing
  was added to the branch afterwards, or every one of its commits is already part of `main`'s history.
- **"Not merged"** means the owner decided the work was dead or replaced (the inventory of Nov 20).
- **Where** says whether the branch existed on this Mac (`local`), on GitHub (`github`), or both.
- The commit ID is the branch's last commit. Where the copy on this Mac and the copy on GitHub
  pointed at different commits, both are listed.

## How to bring one back

On GitHub (needs the commit to still exist there, which it does for any branch that had a pull request):

```bash
git push origin <commit id>:refs/heads/<branch name>
```

On this Mac only (works while git still has the commit, normally at least 30 days):

```bash
git branch <branch name> <commit id>
```

## Kept on purpose

| Branch | Why |
|---|---|
| `chore/appstore-screenshots` | On the owner's keep list |
| `chore/cleanup-and-opening-scope-2026-11-21` | This cleanup's own branch |
| `claude/busy-mccarthy-qntx5t` | On the owner's keep list |
| `fix/care-plan-diet-labels` | Open pull request #377 (its required checks never ran, so it wasn't merged) |
| `fix/native-release-catchup` | On the owner's keep list |
| `fix/rls-initplan-policies` | On the owner's keep list |
| `main` | On the owner's keep list |
| `redesign/onboarding-quickstart` | On the owner's keep list |

## Deleted (231 branches)

| Branch | Last commit | Date | Where | Merged? |
|---|---|---|---|---|
| `build/ios-1.0.2` | `113bc6abff1db51ba97c19b5d98da0a92536c9eb` | 2026-10-19 | local+github | Merged (PR #331) |
| `chore/android-drop-facebook` | `d8dd2b6fdf22b6992720299e8436fb5ce3ca89fa` | 2026-09-03 | local+github | Merged (all commits are part of main's history; no PR) |
| `chore/flock-safety-guardrails` | `a9f8aedb0245f5a2e7624091388441893b8b3c80` | 2026-11-07 | github | Merged (PR #449) |
| `chore/gdpr-privacy-policy` | `c661384f31e362eef2fc14e531497f56239f281a` | 2026-10-15 | github | Merged (PR #312) |
| `chore/ios-repin-profile-associated-domains` | `75fc1154f25a92b916c3c7801cba20cac47aa5d3` | 2026-10-29 | github | Merged (PR #424) |
| `chore/monthly-cron-scheduled` | `902e44f5916a2571c1fcbec7cdab54772d327330` | 2026-09-28 | local+github | Not merged (dead or replaced, your list); PR #277 closed |
| `chore/native-rebuild-prep` | `544ed346c6b4dfcf3089e4bedee3fe9646374206` | 2026-08-24 | local+github | Merged (all commits are part of main's history; no PR) |
| `chore/pin-package-manager` | `a135751273b53bd420b7762c59dffe4b43ff9d77` | 2026-08-05 | local+github | Merged (all commits are part of main's history; no PR) |
| `chore/remove-error-test-trigger` | `190d6ea76a50da099ec4529e46b93cefc16a3e2b` | 2026-10-27 | local+github | Merged (PR #417) |
| `chore/remove-waitlist-backfill-hook` | `28b75f5ce06653e6b0840f6bb85b3b7637450072` | 2026-11-06 | local+github | Merged (PR #447) |
| `chore/self-host-fonts` | `c283d7a5b31b3b6cf91e8afd8153c0ec6432d67a` | 2026-10-15 | local+github | Merged (PR #313) |
| `chore/types-openevents-scanfeed` | `9791750240dc994a01080dfbae8e7167609c4896` | 2026-08-06 | local | Not merged (dead or replaced, your list) |
| `ci/clip-playback-on-prs` | `e0d8105d638a486e602d6f688576625916b8ffdd` | 2026-11-15 | github | Merged (PR #470) |
| `ci/clip-playback-safari` | `054f6efbe5e885c696f00e85085a77e211cf990f` | 2026-11-15 | github | Merged (PR #471) |
| `claude/amazing-meninsky-39269c` | `c8d60bf83439eb1f9014f6175211ca9993eff5a8` | 2026-11-01 | local | Merged (all commits are part of main's history; no PR) |
| `claude/apple-signin-ios-fallback-cqy9nd` | `3ffb12ec25eb7472ff624971da2bd53c26693e06` | 2026-11-05 | github | Merged (PR #438) |
| `claude/auth-apple-hydration` | `d9837026a4d89d73d468db4abaccdd31c4b9c124` | 2026-10-19 | github | Merged (PR #330) |
| `claude/claude-md-unique-branch-names` | `da1b405ca296fa108736fe4950459b51f2593067` | 2026-10-29 | github | Not merged (dead or replaced, your list) |
| `claude/confident-knuth-26y9vv` | `80ded1e49afbff58f336c6e28fe94fdba36eb532` | 2026-10-21 | github | Merged (PR #378) |
| `claude/db-checks-every-pr` | `4a53ce8dcb5ee9b3e950e47f35b16ad4f1bf7b08` | 2026-11-01 | local | Merged (PR #427) |
| `claude/docs-flock-pricing-no-premium` | `bb5e71eee3dca99aab932a9568b7c6517693a49f` | 2026-11-19 | github | Merged (PR #485) |
| `claude/email-link-secret` | `2cfa29065db18fb8b64c7012a25349a8f051d974` | 2026-10-22 | github | Not merged (dead or replaced, your list); PR #384 closed |
| `claude/fix-sit-create-rls` | `77f9fd818845d2a638f0aa3b5244f430a2d1ea46` | 2026-11-01 | local | Merged (PR #426) |
| `claude/flock-account-deletion-files` | `2e00340846a7d42d70be4a104ca391fb582411d5` | 2026-11-18 | github | Merged (PR #477) |
| `claude/flock-founders-page` | `af29ec26f6957e282d6a49ad051d86d594739f69` | 2026-11-21 | github | Merged (PR #491) |
| `claude/flock-free-season-grant` | `a620e9ae44bf1ee3d7a48170479c320a36756bc7` | 2026-11-19 | github | Merged (PR #483) |
| `claude/flock-gift-year-after-free-season` | `20691934cf4400aa793260dcbc827213e09fb5f0` | 2026-11-20 | github | Merged (PR #487) |
| `claude/flock-launch-readiness-hbxqkk` | `cf8d184880c96890b921937d29f6b8a857f3fcbd` | 2026-11-18 | github | Merged (PR #475) |
| `claude/flock-legal-drafts` | `6325bc687c068c769c004e8bf3c84caa22263420` | 2026-11-19 | github | Merged (PR #476) |
| `claude/flock-member-blocking` | `d48de6602311a208fc2d52dbdb7d906483145265` | 2026-11-20 | github | Merged (PR #489) |
| `claude/flock-stickiness-events` | `5bf1ae6abc9cc8eb6aa07419acebf34447e1c0bb` | 2026-11-20 | github | Merged (PR #488) |
| `claude/flock-wording-no-premium` | `79c75380acd975f377675b2963225d27a7e8aee8` | 2026-11-19 | github | Merged (PR #486) |
| `claude/founding-copy-free-season` | `8d2c41011c80ba1d8d9e4d4839594498666bb6dc` | 2026-11-19 | github | Not merged (dead or replaced, your list) |
| `claude/founding-page-optional-perk` | `eb9080397333044de59d8069c8decd210739103d` | 2026-11-19 | github | Merged (PR #481) |
| `claude/get-android-inapp` | `ba67145705fa1945626eebd25f6fed2869d9ff22` | 2026-10-19 | github | Merged (PR #327) |
| `claude/ios-signup-hydration-crash-yib8is` | `f98b8bb9ea70259acb1695f14dab1966f271d72f` | 2026-10-25 | github | Merged (PR #397) |
| `claude/ios-uiscene-lifecycle-plan` | `9fe97a2dbd36ca3349e4d80025b94d8adab784b8` (GitHub), `143ad995253ef818860f787b67ac1701a06a52d1` (this Mac) | 2026-11-02 | local+github | Merged (PR #423) |
| `claude/kaya-project-overview-w3yzys` | `80a7e7acec40c537cc8c631785536159b5903a2e` | 2026-09-23 | local+github | Merged (PR #263) |
| `claude/kya-co-qa-pass-zqxbrk` | `f10edbd326246d8e337ecf81f27c0c1d6d6494fd` | 2026-10-28 | github | Merged (all commits are part of main's history; no PR) |
| `claude/kya-co-qa-pass-zqxbrk-apple-web` | `aacd520e138dea0e3786a80d30185d30977566fb` | 2026-10-28 | github | Merged (PR #411) |
| `claude/kya-co-qa-pass-zqxbrk-bereavement-nl` | `acd2144949a7b2ce33daf39f8dcbfee82b56f110` | 2026-10-26 | github | Merged (PR #409) |
| `claude/kya-co-qa-pass-zqxbrk-co-owner` | `1125430f0eb5c4eedd3a3a0850761e1070479089` | 2026-10-26 | github | Merged (PR #410) |
| `claude/kya-co-qa-pass-zqxbrk-food-optional` | `68ff83a7a72927434e8f33014adaf63bbf8846f2` | 2026-10-26 | github | Merged (PR #407) |
| `claude/kya-co-qa-pass-zqxbrk-optin` | `79f74e02680e30a01ab0a1649f7ee9df83462efc` | 2026-10-26 | github | Merged (PR #406) |
| `claude/kya-co-qa-pass-zqxbrk-p1-1` | `5c8d057f8a48a16de5a5816c281d0e4c028dfdae` | 2026-10-26 | github | Merged (PR #401) |
| `claude/kya-co-qa-pass-zqxbrk-p1-2` | `3feb178a1617289fb58707574780046b4c32e770` | 2026-10-26 | github | Merged (PR #402) |
| `claude/kya-co-qa-pass-zqxbrk-p1-3` | `416131aa193f64fd3b21d0373de9406dc55b8c9d` | 2026-10-26 | github | Merged (PR #405) |
| `claude/kya-co-qa-pass-zqxbrk-p1-5` | `eec75ea7fcedbd91dc294057b9fcced5abdc625a` | 2026-10-26 | github | Merged (PR #404) |
| `claude/kya-co-qa-pass-zqxbrk-p1-6` | `db3091d42d0f0032dbd9d95a3c2bc83de8492f29` | 2026-10-26 | github | Merged (PR #403) |
| `claude/kya-co-qa-pass-zqxbrk-passed-bird` | `ac69b55e71df8b5e74668b5fb5a6a480a3742879` | 2026-10-26 | github | Merged (PR #408) |
| `claude/kya-co-qa-pass-zqxbrk-universal-links` | `4cf82d625c4d0e1161caaed46e8687914a18a45f` | 2026-10-28 | github | Merged (PR #419) |
| `claude/kya-iphone-duo-audit-ux50wj` | `d937c85335fed33dcf9c9ef564b499eacac50a70` | 2026-10-29 | github | Merged (PR #422) |
| `claude/kya-onboarding-welcome-diagnosis-ljmhrh` | `ad2d1620710277ccce0de49b506836796ab848d7` | 2026-11-04 | github | Merged (PR #437) |
| `claude/modest-knuth-sqfuq3` | `3ccd06719675cfc36f77b744488faf0905773da4` | 2026-11-19 | github | Merged (PR #480) |
| `claude/nifty-meitner-1qwlt7` | `f56d38a50a914fadbeb96bf5e7c58fc16eeae39b` | 2026-10-23 | github | Merged (PR #392) |
| `claude/oauth-signup-event` | `c6055ef28f17f1e7613fdce270b61ab40274dd28` | 2026-10-19 | github | Merged (PR #320) |
| `claude/practical-goodall-4v57bx` | `7276afd6da2b2b8daa6dc363d0c3918808a01e57` | 2026-10-21 | github | Merged (PR #372) |
| `claude/remove-app-premium` | `e2ad2d752c1f94bad2d3ac38d067a80d38943766` | 2026-11-19 | github | Merged (PR #482) |
| `claude/service-role-email-log-grants` | `1e8c8182c84e5dbba5755375fd769310266ec663` | 2026-11-02 | local+github | Merged (PR #432) |
| `claude/signup-platform-tagging` | `225092d32a8dbe5910c58aabe21a89958479ef42` | 2026-10-19 | github | Merged (PR #319) |
| `claude/sit-preview-stale-session` | `9246c910a12afd101a9d8ae07825b8703debdea0` | 2026-11-01 | local | Merged (PR #428) |
| `claude/sitter-invite-failure-visibility` | `7002a43f7797b8970e96e1148be1f9eb423a8e74` | 2026-10-25 | github | Merged (PR #398) |
| `claude/sitter-tour-scroll` | `cbe96fcf518dc37e49edef195f189506c5dcc192` | 2026-10-25 | github | Merged (PR #399) |
| `claude/startup-guard-navigation` | `f354155dddf32bd8c1194e05f690de6d539b90de` | 2026-10-25 | github | Merged (PR #400) |
| `claude/startup-guard-navigation-repro` | `5517d9bf2dc9cf56788fe108b2247e8117c53133` | 2026-10-25 | github | Not merged (dead or replaced, your list) |
| `claude/storage-orphan-cleanup` | `1e8025f0013f504c6686a284bad5db1a5598e3b2` | 2026-11-18 | github | Merged (PR #479) |
| `claude/supabase-preview-vercel-akopwj` | `2aaa0c0234ad5df56d33446a7b611432b471c4f1` | 2026-10-22 | github | Merged (PR #388) |
| `claude/supabase-security-hardening-s1b2pq` | `bef6fdc6ed4554209a090ffbc4325b4e97c892f4` | 2026-10-08 | github | Merged (PR #307) |
| `design/cleanup-round-1` | `67b9adcac9ca45d448272762d1ea42a086966cf2` | 2026-10-21 | github | Merged (PR #361) |
| `design/front-door` | `d11e7c5b659007c231e53a29e67bb063da6d3053` | 2026-10-21 | github | Merged (PR #365) |
| `design/letter-typography` | `c5d5c3632009563f3942201b2f1f0e1583412812` | 2026-09-28 | local+github | Merged (PR #276) |
| `design/sitter-view` | `af6caa0dd68b79b9e2328d2c88914a45492ab529` | 2026-10-21 | github | Merged (PR #366) |
| `docs/claude-migrations-auto-apply` | `747a088bff12eea83d055229818c25eb177d15d0` | 2026-09-23 | local+github | Merged (PR #268) |
| `docs/daily-health-check-spec` | `cd36920bc6abe6359a2cc67f383f5c9be9cdff3a` | 2026-10-20 | github | Merged (PR #334) |
| `docs/weight-alert-no-email` | `8e096c198f759da0c6ed94afc9bef609054cce27` | 2026-09-23 | local+github | Merged (PR #265) |
| `duo-release-sync` | `9ac0d824d4bde30e4c73402c60d4ebdc76142cfb` | 2026-11-06 | local | Merged (all commits are part of main's history; no PR) |
| `email-redesign-series` | `f5e8d555e4d7dae82cefecb378a24c9d41adfe50` | 2026-09-27 | local+github | Merged (PR #273) |
| `feat/auth-email-hook` | `bd20e3e229bf669d5d309537582b46d57ee5e0f3` | 2026-10-19 | local+github | Merged (PR #335) |
| `feat/bereavement-review` | `c2b6432ab222dd83dbad25fadf58d2b5c12b92fc` | 2026-10-19 | github | Merged (PR #324) |
| `feat/blog-json-feed` | `5fa42e489f6765401d70296196f6ea67ad7f218b` | 2026-10-07 | local+github | Merged (PR #306) |
| `feat/care-plan-page` | `d65658ddf685731163559b94aabc7280dd5c87d6` | 2026-10-20 | github | Merged (PR #341) |
| `feat/chapter-events` | `47ab4bf830122ded840833c176ce8a6475fd38da` | 2026-11-07 | github | Merged (PR #461) |
| `feat/chapter-members-leads` | `e70923d8d8c9a7a2c3804dfc2adc990bf0e4939b` | 2026-11-07 | github | Merged (PR #462) |
| `feat/clip-upload-timing` | `43d2547391c87b45f14fcc294cc177302bd5e53b` | 2026-10-20 | github | Merged (PR #345) |
| `feat/copy-from-bird-panel` | `db00d2430d795154bfc7527767c78fedfa99c1d8` | 2026-10-20 | github | Merged (PR #343) |
| `feat/daily-check-redesign` | `ff3eeeb03e7d5a5aca93701d32a58afe30b1d047` | 2026-10-20 | github | Merged (PR #346) |
| `feat/delete-account-page` | `dc95c28d9585d8ce50a80b52908dc09f17c0e8b7` | 2026-09-08 | local | Merged (all commits are part of main's history; no PR) |
| `feat/diet-conversion-vet-guidance` | `327771f5100e2e2eb3a4fba99d4cbd8ccae0adc5` | 2026-11-07 | github | Merged (PR #463) |
| `feat/diet-weight-rules` | `bff010014cd41e0981db256249290b91237641e3` | 2026-11-07 | github | Merged (PR #464) |
| `feat/duo-core-screens` | `f999ec0221d9b1cbe7ea266f5b54ad3962a59c79` | 2026-11-05 | local | Merged (PR #440) |
| `feat/duo-explore` | `19f60c6416aba2bbc5740679113f4d62888e4250` | 2026-11-05 | local | Merged (PR #441) |
| `feat/email-click-tracking` | `c049f5f1a694e96a3439866bcb7b576c3797719e` | 2026-10-20 | github | Merged (PR #326) |
| `feat/email-i18n` | `1ca624a7578681115e0058ac20d078004801bff4` | 2026-08-06 | local | Merged (all commits are part of main's history; no PR) |
| `feat/email-measurement` | `ea15744ff79b42a8813e1d5c03b5978a9c52496a` | 2026-10-19 | github | Merged (PR #323) |
| `feat/email-nl` | `cc9ee36a4fe260c7afb0dcf654d1a4013b29bc68` | 2026-08-10 | local | Merged (all commits are part of main's history; no PR) |
| `feat/error-capture` | `48835024f75ee4821ad1075c0d7797ac411a92fc` | 2026-10-15 | local+github | Merged (PR #311) |
| `feat/flock-club-foundation` | `f4b1bafde2c0ede78b21b14929171d02b1b01b1c` | 2026-09-28 | local+github | Merged (PR #279) |
| `feat/flock-entitlement-grants` | `5403426e9179ea88089e25f883b06edaaae4e351` | 2026-11-07 | github | Merged (PR #451) |
| `feat/flock-foundation` | `4f31b6c6a49630c71ab9a3328c079ac7b8addc7f` | 2026-10-20 | local+github | Merged (PR #352) |
| `feat/flock-moderation` | `42c217ea3e2401bc17d3af2928868555ea4ec354` | 2026-11-07 | github | Merged (PR #459) |
| `feat/flock-posts` | `4ac8e4add392745850bbf3baeee64eb3182649e0` | 2026-11-07 | github | Merged (PR #458) |
| `feat/flock-profiles` | `89861c888881e228ac1be1fda44b2d910ca0e125` | 2026-11-07 | github | Merged (PR #452) |
| `feat/flock-report-approval-gate` | `c8d60bf83439eb1f9014f6175211ca9993eff5a8` | 2026-11-01 | local | Merged (all commits are part of main's history; no PR) |
| `feat/flock-report-chip-links` | `cf5caff87a33622e0d4880e3b8c95273bd0943d5` | 2026-09-29 | local+github | Not merged (dead or replaced, your list); PR #283 closed |
| `feat/flock-shell-final` | `fb7762094c8a7dc20b4c636b4699ca39cde61cd5` | 2026-11-07 | github | Merged (PR #450) |
| `feat/flock-todays-idea` | `b4ee07eb8f51cf8d81438a642c152f0b10544324` | 2026-11-07 | github | Merged (PR #460) |
| `feat/get-link-preview-and-qr` | `499b879852e28ae1946422883fbabccc4470b421` | 2026-10-01 | local+github | Merged (PR #305) |
| `feat/get-smart-download-link` | `35821f013b78301fbf6da8cc847820ef6d87053e` | 2026-10-01 | local | Merged (PR #303) |
| `feat/header-rule-bird-pages` | `d57485b96e08693a5fdd8332b51bb7a64003dd1f` | 2026-10-20 | github | Merged (PR #358) |
| `feat/health-flock-summary` | `6e834198842a3929d8c48b2877e02d4cd3eee71e` | 2026-10-20 | github | Merged (PR #354) |
| `feat/homemade-chop-sheet` | `98eabade89dccc302b5384bee4d15ebadca9cab1` | 2026-10-20 | github | Merged (PR #344) |
| `feat/household-view-as-sitter` | `1d6c460b200b344be2e080624fe2009c3fbf9d2f` | 2026-10-21 | github | Merged (PR #364) |
| `feat/i18n-foundation` | `587ce0fa193fa137e4bc0457c85920f662441b57` | 2026-08-06 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/journal-attachments-data` | `c9bb18b3a502831b2d51cd3cbbaec6d3ff0427e8` | 2026-09-03 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/journal-attachments-ui` | `83630ab21f34e92c6401ac357ac39d61d1848ee5` | 2026-09-03 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/journal-entry-read-view` | `f4650ff88078de1f4f61ef7bac3acd9c864f5353` | 2026-09-04 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/journeys-browse` | `52088868450c13a1b9ed9480ce6d30598fa41a72` | 2026-11-07 | github | Merged (PR #456) |
| `feat/journeys-core` | `773922a175e164ca5e0b0e2127e852d5a2afbda1` | 2026-11-07 | github | Merged (PR #454) |
| `feat/journeys-milestone-wording` | `bfc5ae1762e7272706c89482a7200974fbdefaac` | 2026-11-07 | github | Merged (PR #457) |
| `feat/journeys-updates` | `fff338f6394dc0d0b2a1822bc1260b3c1d950b8f` | 2026-11-07 | github | Merged (PR #455) |
| `feat/kya-look-home-bird-weight` | `26d375974c103b9a258810a4c1305e522486627e` | 2026-10-20 | github | Merged (PR #347) |
| `feat/monthly-letter` | `bb0652faf64f6dcd4856c942bbd529d5af36d81e` | 2026-09-27 | local+github | Merged (PR #275) |
| `feat/native-app-version-tags` | `d21364485e3c0e08901078f2adfc35413b8783e4` | 2026-11-17 | local+github | Merged (PR #472) |
| `feat/native-push` | `27605bdeb35d270c70cd70b94c8456e2cd895a26` | 2026-09-21 | local | Merged (all commits are part of main's history; no PR) |
| `feat/notify-household-caregiver` | `ff58cccd9e3908ab10d24f90b568a61d6db69cbe` | 2026-08-03 | local | Merged (all commits are part of main's history; no PR) |
| `feat/onboarding-one-system` | `18f841bb63a31bd47c302a78662bac145bc66320` | 2026-10-19 | github | Merged (PR #325) |
| `feat/owner-i18n-bird-screens` | `fb3a166d73603666e48ff4e9e1bd7c578237f128` | 2026-10-16 | github | Merged (PR #317) |
| `feat/owner-i18n-identity-journal-moments-scans` | `5785e9ddf6432bca3c6e38ad6205398402cf9d83` | 2026-10-16 | local | Merged (all commits are part of main's history; no PR) |
| `feat/owner-i18n-plumbing` | `d2bda6c818b972459b231bb9fdc6ae131cb6fa5b` | 2026-10-16 | github | Merged (PR #316) |
| `feat/owner-i18n-sit-account-careplan` | `34a481488b618f5bab3592e421755dd79c768fef` | 2026-10-16 | github | Merged (PR #318) |
| `feat/owner-i18n-species` | `2c5daeb83116a7d7de13616146ab4fceda0e2f6f` | 2026-10-19 | local+github | Merged (PR #329) |
| `feat/owner-i18n-step2c` | `d8bf2e0e5ad7c639698102998b05bd8761ada210` | 2026-10-19 | local+github | Merged (PR #328) |
| `feat/remaining-screens-kya` | `cec6d59ec2c5f74bd5c01af982aca37b8347aab2` | 2026-10-20 | github | Merged (PR #357) |
| `feat/retire-replaced-clips` | `deb1a52375a5df160367c7f1ee8d5939bcabccb4` | 2026-09-12 | local | Merged (all commits are part of main's history; no PR) |
| `feat/save-error-alerts` | `6996a5d748768601bc6f6cf269a13f496f7272e9` | 2026-11-01 | local+github | Merged (PR #429) |
| `feat/scan-photos-to-bucket` | `4c0f643f75bd30f6556e89eda094899b77d921e3` | 2026-08-20 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/setup-day` | `341d60962406bf54503b96065402174b0aed13c9` | 2026-10-20 | github | Merged (PR #337) |
| `feat/setup-home-emergency` | `5b8b2ae89db76be22182386455f4778a8a09b23b` | 2026-10-20 | github | Merged (PR #339) |
| `feat/setup-home-reminders` | `2d2076e9f7a376a2bbad0a70d24167eb4a2cb1a6` | 2026-10-20 | github | Merged (PR #338) |
| `feat/setup-review` | `29c8944b9bf4cf375a2d79d6a5fbadd95d9a1b16` | 2026-10-20 | github | Merged (PR #340) |
| `feat/setup-shell-controls` | `e7953ae93d6ef7b025e9a2fff06f2c0ed6bbe434` | 2026-10-20 | github | Merged (PR #336) |
| `feat/share-new-bird-with-household` | `809e6672ae9d3206774258db887513d08a89b560` | 2026-09-03 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/signup-locale-metadata` | `ae32317bb3b71ff572ed7cf18f5e9b529abb898d` (GitHub), `350f0fded25188c4d1ba33cffbd283f27a2f43e5` (this Mac) | 2026-10-19 | local+github | Merged (PR #333); local copy had 2 extra commit(s) whose content is already in main |
| `feat/sit-gaps-sheet` | `56b223c9e3d2b653fdc6e793eacecd5a1fa4d30f` | 2026-10-20 | github | Merged (PR #342) |
| `feat/sits-kya-look` | `b332e3db45afb02d1533bee3bdf2c6d4d69a7590` | 2026-10-20 | github | Merged (PR #351) |
| `feat/sitter-invite-email` | `22934edd06ca0d107ed44fd95247b5badb17ec70` | 2026-08-06 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/stage3-render` | `83ae005a875fef8bd6f9f0dda9db2df8a6d70570` | 2026-08-10 | local | Merged (all commits are part of main's history; no PR) |
| `feat/stage3-wire` | `459eb5915a7d3713504a1ceab22c6dc20a0283b4` | 2026-08-10 | local+github | Merged (all commits are part of main's history; no PR) |
| `feat/stored-english-i18n` | `0cdadce4bdcdf568bd52fb2eb17476814994e86a` | 2026-08-10 | local | Merged (all commits are part of main's history; no PR) |
| `feat/universal-links` | `a058bdd8be5b3c58c1e9811a137c7b3d2b8c5067` | 2026-10-20 | github | Merged (PR #355) |
| `feat/vet-nudge-tiers` | `5e3a1f397eb5fdfaacee194bbe94ae75c8e9de49` | 2026-11-07 | github | Merged (PR #465) |
| `feat/waitlist-google-form-backfill` | `62834f960f8168091074fbcec339056b2540b63a` | 2026-11-06 | local+github | Merged (PR #446) |
| `feat/welcome-concern-bereavement-emails` | `0a0f2adcd17e1d2be8c952753dab526cde96f41c` | 2026-09-23 | local+github | Merged (PR #266) |
| `feat/welcome-preview-rows` | `583c6a1466ed222bbcef078317c7cddf6f3889fd` | 2026-10-28 | local+github | Merged (PR #420) |
| `feature/engagement-nudges` | `eef47688d648b95b2dc0327ba947cbef693ddae8` | 2026-07-24 | local+github | Merged (PR #257) |
| `fix/appreview-bounce-guard` | `185db7f1adc45ed04829e635287e3654281c20c0` | 2026-09-23 | local+github | Merged (PR #264) |
| `fix/bereavement-launch-cutoff` | `5f54de63c2c9d01da6f23ea9956a5c1f64a2e214` | 2026-09-23 | local+github | Merged (PR #267) |
| `fix/bird-photo-framing` | `b73f0e2803851c3f27e1d94b779b14a534d0b5cd` | 2026-10-20 | github | Merged (PR #349) |
| `fix/brevo-list-signups` | `d78e4cff62da9fe3a91621ab1d88d9441ff2db65` | 2026-11-06 | local+github | Merged (PR #444) |
| `fix/care-plan-reminder-dedupe` | `8ea516b6e8e8ec8d87b6509bc0f9ad71d6028f68` | 2026-08-10 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/checklist-emergency-per-bird` | `4c0d94acfc5dcfe0c3924cbf9dbf97aa28e3d09f` | 2026-09-05 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/clip-fn-ownership` | `8057c4499875221d7e34b37a0d347b801fc5365c` | 2026-09-12 | local | Merged (all commits are part of main's history; no PR) |
| `fix/cold-launch-auth-redirect` | `a88468bcf16d0468c63e933349a09954d5857129` | 2026-08-03 | local | Merged (all commits are part of main's history; no PR) |
| `fix/cron-hook-token` | `e4c329da62dced7a69b203602d3418e2bdd279f0` | 2026-11-01 | local+github | Merged (PR #430) |
| `fix/delete-account-page-accuracy` | `97b173e49ab774c0a6685d1ff843f6b0af2df867` | 2026-10-16 | github | Merged (PR #315) |
| `fix/delete-sweep-recursive` | `00ef81e8ba7012d28ab3c8d724e0e1d1fdae53f6` | 2026-09-10 | local | Merged (all commits are part of main's history; no PR) |
| `fix/delete-sweeps-storage` | `7a014331cc2db2d494daaca575ef3b0e3041a35b` | 2026-09-03 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/edge-save-errors-type` | `d043b4edadb6457d1d279247b939696cb2d7a763` | 2026-11-06 | local+github | Merged (PR #445) |
| `fix/error-capture-followups` | `b48a8dcff9580df3470606e3367435262c37f6db` | 2026-10-20 | local+github | Merged (PR #353) |
| `fix/error-test-account` | `9fdd3b72b21203d9f6d15dc3380c0980cf517de6` | 2026-10-26 | local+github | Merged (PR #412) |
| `fix/error-test-early-params` | `cacc8ccb4a42482b91da563d5040c212d5796932` | 2026-10-26 | local+github | Merged (PR #414) |
| `fix/flock-media-playback` | `22f1d5b25375ad7e7b73270d3369284580f0a056` | 2026-11-09 | github | Merged (PR #467) |
| `fix/flock-setup-bird-chips` | `4f1a7b7f74f1cc20a0fbd346d559d8fc545c5a4d` | 2026-11-07 | github | Merged (PR #453) |
| `fix/followups-358` | `6299ba24ccec00958c937a8a263dfa606c2a6e71` | 2026-10-21 | github | Merged (PR #359) |
| `fix/gift-partial-refunds` | `68df01089917e5ce9c83739680cb6e6768483dae` | 2026-11-06 | local+github | Merged (PR #448) |
| `fix/hook-monitoring` | `a461742b2155d89741cd7d40b22d4b2012bb86bf` | 2026-08-19 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/household-toggle-bird-access` | `d622b40ed95efb59bb6557e9e4ecdddefc65c6ab` | 2026-09-03 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/inline-app-styles` | `f2ad1d9e474cf79dc7225335d59c775ff57dced0` | 2026-10-21 | github | Merged (PR #370) |
| `fix/ios-startup-stuck` | `142057077a7d6018b30f57d3e5e64a8f9d5694db` | 2026-10-21 | github | Merged (PR #368) |
| `fix/ios-styles-missing` | `ce70f9383ca2d380852813fbc2bb838778603c28` | 2026-10-21 | github | Merged (PR #369) |
| `fix/journal-photo-size-guard` | `81f4d98139f8a6a0632ea1febd1b3576983f3612` | 2026-08-25 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/keep-utm-attribution` | `0b5a02f61ea2a98906e56214b8014bf03e5e8e15` | 2026-10-26 | local+github | Merged (PR #415) |
| `fix/landing-one-primary` | `09b6a13832f303e49ed024ada19880655376baca` | 2026-06-24 | local+github | Not merged (dead or replaced, your list); PR #197 closed |
| `fix/local-today` | `a93575131daffefa2a4a60c0f30c8e883bada858` | 2026-10-19 | github | Merged (PR #321) |
| `fix/member-view-polish` | `e08dfb4265ee47d2e231fc3500e370d3d4d4022c` | 2026-07-24 | local+github | Merged (PR #261) |
| `fix/migration-version-drift` | `99700df9cce132ac2d89ab77941f08166cfc3dd6` | 2026-08-18 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/native-apple-signin-hang` | `97cd777586a273bfe7d08f30d2ea1882079886e5` | 2026-09-16 | local | Merged (all commits are part of main's history; no PR) |
| `fix/native-email-confirm-code` | `a9b499a47dadb1b0299dd552d30a0ba37f43aa0f` | 2026-10-19 | local+github | Not merged (dead or replaced, your list); PR #332 closed |
| `fix/native-install-ctas` | `8d1e37230abaadff786febe60c8cdff55f7effb5` | 2026-07-24 | local+github | Merged (PR #259) |
| `fix/native-oauth-instrumentation` | `bde2c6b3db4507f00f385546383d96691b0313f5` | 2026-08-04 | local | Merged (all commits are part of main's history; no PR) |
| `fix/native-oauth-nonce` | `1e164db76a0d7ae1e98a6274d546419a8aa37ea6` | 2026-08-04 | local | Merged (all commits are part of main's history; no PR) |
| `fix/native-push-token-sync` | `efb5f494c4a392a2962bb697cccf7fe885550515` | 2026-10-19 | github | Merged (PR #322) |
| `fix/native-shell-sw-caching` | `4f620d0924351a31ed32d3ddf5efde4422d70e12` | 2026-08-03 | local | Merged (all commits are part of main's history; no PR) |
| `fix/native-status-bar-backdrop` | `f33a01467fa00e52bddf812804d231061ff32cfc` | 2026-07-24 | local+github | Merged (PR #260) |
| `fix/notification-log-ref-id` | `edbc9d7b14142df76a0a8f10f034cf624e3c01e8` | 2026-08-20 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/onboarding-old-drip-guard` | `c4af14c2b6ce64a6ee9665fd02e7e6e76ab43aca` | 2026-10-14 | github | Merged (PR #310) |
| `fix/onboarding-per-account` | `ac6b3c019c1f06b4942fd52d0fd35d817cf60fcd` | 2026-06-21 | local+github | Merged (PR #122) |
| `fix/oxford-sitter-age` | `45a10a7a564cc007ae5bf1a776ec50088169eca5` | 2026-10-21 | github | Merged (PR #360) |
| `fix/passing-guidance-owner-addressee` | `67f9d61e1bc30d4086663196c7fc19a7e57d3f25` | 2026-08-25 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/photo-crop-containers` | `a71cb0c7450d5178f31e1b91c3f942787bcacf28` | 2026-10-20 | github | Merged (PR #348) |
| `fix/plan-header-top` | `2bdbe1d53465cff3db55d5d1cffc863dd7c55734` | 2026-10-20 | github | Merged (PR #350) |
| `fix/preview-block-not-an-error` | `2f4f0e566ffbd3c3e86b4c3b22ade02d91236559` | 2026-10-15 | github | Merged (PR #314) |
| `fix/previews-household` | `7fd5a7630da01d2ac81b5fa4e5b31db43efcc83f` | 2026-10-21 | github | Merged (PR #363) |
| `fix/pull-to-refresh` | `6837a111c36c75fb3c69c0be4d944725be6db59e` | 2026-08-03 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/pull-to-refresh-offline` | `420bd1d1e9fce19a37362f6178d7f218081b4d8a` | 2026-08-03 | local | Merged (all commits are part of main's history; no PR) |
| `fix/remove-clip-retire` | `271a4266afa105e8623ac8fc9d19d38be2da1294` | 2026-09-12 | local | Merged (all commits are part of main's history; no PR) |
| `fix/scrub-stack-frames` | `14774d73e2bb1400fa638ea0c16e23120fb8ca15` | 2026-10-26 | local+github | Merged (PR #416) |
| `fix/self-host-setup-fonts` | `c8331bf4da55872d3f8246e3510fdd7277c47f28` | 2026-10-26 | local+github | Merged (PR #413) |
| `fix/sits-health-polish` | `087664959ce5bfd9880344655eb8413372acc4a0` | 2026-10-20 | github | Merged (PR #356) |
| `fix/sitter-task-counts` | `27d602b12465543137d243176b0759cca914e135` | 2026-10-21 | github | Merged (PR #367) |
| `fix/startup-reload-loop` | `3416302a70777e2b3e64cf35c85394af5ce2db01` | 2026-10-21 | github | Merged (PR #362) |
| `fix/storage-cleanup-pagination` | `753cec6be0a39beb7d2047fca303c2fafd4042d0` | 2026-08-10 | local+github | Merged (all commits are part of main's history; no PR) |
| `fix/stream-sweep-registry` | `2745622b8391811724628d55855979cd37f2fa0c` | 2026-09-12 | local | Merged (all commits are part of main's history; no PR) |
| `fix/tanstack-start-cve-2026-102989` | `54b1d4484304cb5e1e7aebc19dd6366c5cfd500a` | 2026-10-01 | local | Merged (PR #304) |
| `fix/verify-tap-to-confirm` | `9600d1d583e2964df9cf435abfa3f917e13dccb2` | 2026-11-19 | local+github | Merged (PR #469) |
| `fix/vet-nudge-phrases` | `5d23bfefd6e6b3dae3ec28cc897c8b5a4647700b` | 2026-11-07 | github | Merged (PR #466) |
| `i18n/dutch-onboarding-letters` | `0766cdba39a2e75200175f5a0aab0d07f02a0b06` | 2026-09-27 | github | Merged (PR #274) |
| `i18n/phase2-batch2` | `1cf1ff91a2f1da768aa46c6910fbe5442ecf777c` | 2026-08-24 | local+github | Not merged (dead or replaced, your list) |
| `i18n/phase2-inventory` | `b27eb2513803debed65be466eb07df177df22a8c` | 2026-08-24 | local+github | Not merged (dead or replaced, your list) |
| `launch/readiness-fixes-2026-08-10` | `f319ee455a7510d73174b899df663e3f84cd2b8b` | 2026-08-10 | local+github | Merged (all commits are part of main's history; no PR) |
| `native/capacitor-shell` | `bf3d5d4ac70cb3cc619e1e68fca35e0354f2a034` | 2026-07-23 | local+github | Merged (PR #256) |
| `native/icons-and-apple-rails` | `6515ac3cb212fcffeec585016f742996114a9609` | 2026-07-24 | local+github | Merged (PR #258) |
| `open-in-app-scheme-live` | `7baf037d74a8febc4d5aff11880597623e0e38d4` | 2026-11-01 | local+github | Merged (PR #425) |
| `perf/dashboard-collapse-weights-waterfall` | `b04781ee85f7095a3ce8d7699db925649b7d7818` | 2026-08-03 | local | Merged (all commits are part of main's history; no PR) |
| `perf/route-intent-preload` | `21c3009e8c2ebc0209b1f70d3e74fbcdf8cb9281` | 2026-08-03 | local | Merged (all commits are part of main's history; no PR) |
| `posthog/instrumentation-4224e1` | `6f2bc3908480c37abc3583f1a3d0ef4b60e24c2e` | 2026-07-17 | github | Not merged (dead or replaced, your list); PR #255 closed |
| `pr-assets/welcome-preview` | `b86df78dcdc3195b73497acd6db99913b83af175` | 2026-10-28 | github | Not merged (dead or replaced, your list) |
| `release-1.2.0` | `8e136dbdde66d99a446fc98abc346d2cee98dc1c` | 2026-11-06 | local | Merged (all commits are part of main's history; no PR) |
| `test/account-deletion-posthog` | `409fa79a267f222d08429c1fedf8dd2df749300c` | 2026-10-27 | local+github | Merged (PR #418) |
| `test/preview-services-ui` | `91a0cad78a9f1f1fbead0142ebd8acfb65cffa97` | 2026-10-21 | github | Not merged (dead or replaced, your list); PR #382 closed |
| `today-wip-backup` | `638ac057448b3ba0901ec8ee00d7a59e4ea526e3` | 2026-06-29 | local+github | Not merged (dead or replaced, your list) |
