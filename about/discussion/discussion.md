## Intent and requirements

A discussion belongs to the page it is attached to. It should outlast the post
that started it, be readable by anyone who lands on the page, and leave the
page's curators the final say over what becomes part of the page itself.

That gives the design its requirements:

- Reading never requires an account.
- Contributing never requires an account on this site. Anyone with a
  Fediverse identity can take part from the server they already use.
- The page shows only what a curator has accepted.
- Replies, boosts and follows work with any ActivityPub client, because the
  discussion is an ActivityPub collection like any other.
- A contribution that has been incorporated into the page stops being a live
  comment; it is kept with the version history instead.

## How a comment gets onto a page

Not every page has a discussion. A page has one if its data names a page
actor and an outbox, and the discussion you see under "Open discussion" is
that outbox — nothing more. The heading spells out the rule: "Live comments
that have not yet been incorporated into this version."

A comment travels in two steps:

1. You write it on your own Fediverse server — the Contribute or Reply button
   hands you over to it — and your server delivers it to the page actor's
   inbox.
2. A curator reads it there and, if it is to be published, puts it in the
   page actor's outbox. Only then does it appear on the page.

The inbox is not public, so between those two steps nobody reading the page
can see your comment. Your own server will show it, because it is already
there.

Later, when the point of the comment has been taken up in the page itself,
the comment is marked as incorporated. It drops off the live list and joins
the record under "Changes" at the bottom of the page.

This page is the exception to all this: it describes discussions but doesn't
carry one.

## What you can do

### Read

The discussion sits below the page content. Older comments load with the
"Load more" button. Comments that have been incorporated into the page are
not shown here; you will find them under "Changes".

### Comment or reply

1. Press "Contribute from the Fediverse" — or "Reply from the Fediverse" on
   the comment you want to answer.
2. Enter your Fediverse address, such as @you@example.social, and press
   "Continue on my server".
3. Your server opens with the post ready: a mention of the page and a link to
   the version you were reading. Send it from there.

The address is remembered in your browser so you don't have to type it next
time. If your server can't prepare the post for you, the dialog offers to
copy the text or open your server so you can paste it in.

### Follow

Subscribe to the page's actor with an ActivityPub client, e.g. Mastodon, the
same way you would follow anyone else.

### Curate

Curators read the page actor's inbox and put what belongs into the outbox.
When a point from the discussion is taken up in the page itself, the comment
is marked as incorporated so it leaves the live list. Pages are kept alive by
two active curators; a page without them is considered for mothballing (see
About: Topics).

## Tradeoffs

- Publication is moderated, so it is delayed. A comment can wait hours or
  days, and while it waits it is invisible to readers — the inbox isn't a
  public list. If nothing appears, the page itself can't tell you where your
  comment went.
- Contribution runs through your Fediverse server, so it needs a Fediverse
  account, and it works only as well as your server does. The hand-over
  depends on your server advertising the right interaction; where it doesn't,
  you are back to copying the text by hand.
- Your comment carries whichever identity you used over there. The page
  shows it as it arrives and can't vouch for it or rewrite it.
- Curation is manual work, and it is the bottleneck by design: the coop asks
  for two active curators per page precisely because the alternative is a
  discussion nobody tends.
