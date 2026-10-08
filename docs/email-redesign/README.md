# Kya & Co. letters: onboarding series + monthly letter

- `templates/`: email-ready HTML with {{merge_fields}} and production asset URLs.
  Originally the design handback; now REGENERATED from the code with
  `npm run email:preview -- --write`. The design is edited in
  src/lib/emailTemplates.ts, and these files are a snapshot of it, so
  `npm run email:preview -- --check` can tell you when a code change moved a
  rendered letter. The original handback is in git history.
- `emails/`: the same emails with sample data (Sam, Juno, Pip). Open in a browser.
- `assets/`: series heroes at 1040px (2x), lockup, parrot mark, and `monthly/01.jpg`–`12.jpg`. Upload to app.thekyaproject.com/brand/email/.
- `new-strings.json`: every new string, including the 12 care notes and hero alt text (careNotesByMonth).
- `build.py` + `monthly_parts.py`: the generator and the monthly content library.

Monthly letter: sends on the 2nd to every account, recapping the previous month. One letter per account, one section per bird. Quiet block per bird when it has fewer than four weigh-ins and no health checks; quiet letter when every bird is quiet. Skip birds marked as passed away. Hero and care note key off the send month. The article block reads the newest item from the site's public JSON Feed (https://thekyaproject.com/feed.json, newest first): title, summary, image, url, plus `_kya.read_minutes` and `_kya.image_alt`. No credentials. Superseded the Webflow "Blogs" collection on 2026-10-07 — read time is now stated by the feed rather than estimated from the summary.
