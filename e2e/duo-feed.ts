// Made-up blog feed for `npm run screens:duo`: what thekyaproject.com/feed.json
// publishes, served by e2e/duo-mock-server.ts at /__feed.json. Posts 1 and 3
// carry content_html (the iPhone Duo opens them in the in-app reader); 2, 4 and
// 5 don't (they open on the website, as today).
//
// Post 1's body also carries things the reader must strip (a script, an
// iframe, a style block, inline styles and handlers, a javascript: link): the
// screenshot test checks none of them reach the page.

export const READER_POST_ID = "https://thekyaproject.com/blog/reading-parrot-body-language";
export const SHORT_POST_ID = "https://thekyaproject.com/blog/foraging-toys-from-home";
export const WEB_POST_ID = "https://thekyaproject.com/blog/how-much-should-a-cockatiel-weigh";

const DAY = 86_400_000;

function body(app: string): string {
  return `
<script>window.__readerPwned = "script";</script>
<style>body { display: none !important; }</style>
<p style="color:red" onclick="window.__readerPwned='onclick'">Parrots talk all day long, mostly without a sound. Feathers, eyes, feet and posture say how a bird feels well before anything else does, and the signs are easy to read once you know where to look. Spend a week watching your bird at the same times each day and you will start to see the patterns that are normal for them.</p>
<h2>Feathers</h2>
<p>Slightly fluffed feathers after a meal or before a nap are normal. A bird that stays puffed up for hours, especially with its eyes half closed, may be cold or unwell, and that is worth a call to your avian vet. Feathers held tight against the body usually mean alert or uneasy.</p>
<p>Watch the head feathers as well. Many species raise them a little when relaxed and curious, and flatten them when nervous. Cockatoos and cockatiels have crests that make this obvious; in other birds it is a softer change you learn over time.</p>
<iframe src="https://example.com/embed" width="600" height="400"></iframe>
<h2>Eyes</h2>
<p>Pinning, when the pupils quickly shrink and grow, means strong interest. It can be excitement about a favorite food, or a warning before a bite. Read it together with the rest of the body: pinning with relaxed feathers is usually happy; pinning with a crouch, a fanned tail and a slightly open beak means give the bird some space.</p>
<figure><img src="${app}/brand/email/journal-foraging.jpg" alt="A macaw working at a woven foraging toy" onerror="window.__readerPwned='onerror'"><figcaption>A busy beak and soft feathers: a content bird.</figcaption></figure>
<h2>Feet, wings and tail</h2>
<ul>
  <li><strong>Standing on one foot</strong> with the other tucked up: relaxed and comfortable.</li>
  <li><strong>Wing flapping</strong> while holding the perch: exercise, or a burst of energy.</li>
  <li><strong>Tail bobbing</strong> after exercise is normal; bobbing at rest can be a breathing problem.</li>
  <li><strong>Wings held away from the body</strong> on a warm day: the bird is too hot.</li>
</ul>
<blockquote>Learn what normal looks like for your bird, and changes will stand out on their own.</blockquote>
<h2>Sounds that go with it</h2>
<p>Soft chatter and contact calls are everyday sounds. Grinding the beak at bedtime is a sign of a sleepy, contented bird. Growling, hissing or a sudden quiet in a normally noisy bird all deserve a closer look.</p>
<table>
  <thead><tr><th>Sign</th><th>Usually means</th></tr></thead>
  <tbody>
    <tr><td>Beak grinding</td><td>Content, settling for sleep</td></tr>
    <tr><td>Fluffed for hours</td><td>Cold or unwell: call the vet</td></tr>
    <tr><td>Pinning eyes</td><td>Strong interest or a warning</td></tr>
  </tbody>
</table>
<p>None of this replaces a visit to an avian vet. If something changes and stays changed for more than a day, write it down and call. <a href="javascript:window.__readerPwned='link'">This link goes nowhere</a>, but <a href="https://thekyaproject.com/blog">the rest of the field notes</a> are a good next read.</p>
<h2>Putting it together</h2>
<p>Body language is a sentence, not a single word. A raised foot, a soft chirp and relaxed feathers together say more than any one sign alone. Keep notes in the journal when something seems different: over a few weeks they turn into a picture of what is normal for your bird, which is exactly what a vet will ask about.</p>
<p>The more time you spend simply watching, the better you get at this. Sit near the cage with a cup of tea, put your phone away, and let your bird go about its day.</p>
`;
}

export function duoFeed(app: string) {
  const now = Date.now();
  const iso = (d: number) => new Date(now - d * DAY).toISOString();
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: "The Kya Project",
    home_page_url: "https://thekyaproject.com",
    items: [
      {
        id: READER_POST_ID, url: READER_POST_ID,
        title: "Reading your parrot's body language",
        summary: "Feathers, eyes and feet say how a bird feels long before anything else does. Here's what the common signs mean.",
        image: `${app}/brand/email/juno.jpg`, date_published: iso(2), tags: ["Behavior"],
        _kya: { read_minutes: 7, category: "Behavior", image_alt: "A blue-and-gold macaw looking over its shoulder" },
        content_html: body(app),
      },
      {
        id: WEB_POST_ID, url: WEB_POST_ID,
        title: "How much should a cockatiel weigh?",
        summary: "Healthy ranges, how to weigh at home, and when a change is worth a call to the vet.",
        image: `${app}/brand/email/weighing.jpg`, date_published: iso(9), tags: ["Health"],
        _kya: { read_minutes: 5, category: "Health", image_alt: "A parrot standing on a kitchen scale" },
      },
      {
        id: SHORT_POST_ID, url: SHORT_POST_ID,
        title: "Foraging toys from things you already own",
        summary: "Paper cups, cardboard and a few treats make a morning's work for a busy beak.",
        image: `${app}/brand/email/journal-foraging.jpg`, date_published: iso(16), tags: ["Enrichment"],
        _kya: { read_minutes: 4, category: "Enrichment", image_alt: "A macaw pulling at a woven foraging toy" },
        content_html: "<p>Start with a paper cup and a favorite treat.</p><p>Fold the top over so it takes a little work to open.</p>",
      },
      {
        id: "https://thekyaproject.com/blog/night-frights", url: "https://thekyaproject.com/blog/night-frights",
        title: "Night frights: what they are and how to help",
        summary: "Why some birds thrash in the dark, and the small changes that make nights calmer.",
        image: `${app}/brand/email/health-check.jpg`, date_published: iso(23), tags: ["Husbandry"],
        _kya: { read_minutes: 6, category: "Husbandry", image_alt: "A parrot resting on a perch at dusk" },
      },
      {
        id: "https://thekyaproject.com/blog/choosing-an-avian-vet", url: "https://thekyaproject.com/blog/choosing-an-avian-vet",
        title: "Choosing a vet who knows birds",
        summary: "What to ask before the first visit.",
        date_published: iso(30), tags: ["Health"],
        _kya: { read_minutes: 3, category: "Health" },
        content_html: "   ",
      },
    ],
  };
}
