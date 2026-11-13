---
name: x-image
description: Make a dark, GitHub-README-style image card for an X (Twitter) post at 4096x4096, the largest size X accepts and the shape that fills the full width of the post column on desktop and phone. Use whenever the user asks for an "image for X", "picture for the tweet", "X image", "make it an image", a screenshot/README to post with a tweet, or to turn a repo, paper, article or screenshot into a post image. Also use when they send a light screenshot and ask for a dark version for X, or ask to stitch screenshots, or for a scrolling GIF/MP4/video/animation of a page or article for X.
---

# X image card (4096x4096, dark)

The user posts long AI/tech posts on X and wants one image to go with each. The format
they approved is a **square 4096x4096 PNG** in GitHub's dark theme, laid out like a
README: title, the project's real logo, badges, a short description, a table, a code
block, and the source URL at the bottom.

## Size rules (the user approved these; always follow them)

| Output | Size | Why |
|---|---|---|
| Still image | **4096x4096 PNG** | Largest square X accepts for images; fills the full post column |
| Scrolling video | **1200x1200 MP4** | Largest square X accepts for video (X caps video at 1920x1200 or 1200x1900) |
| GIF | Square, under 15 MB | X's GIF limit; `scroll_video.py` shrinks it to fit |

Both are **1:1**, and that's what makes them fill the column: X shows a 1200 square
video and a 4096 square image at the same size. When the user asks for a video or GIF,
also offer the 4096x4096 still card of the same content.

## Why square, not tall

On desktop, X caps an image's displayed height at about the width of the post
column. A 4:5 or 9:16 image hits that cap first and leaves empty space beside it.
A square fills the full width on desktop and phone. 4096 is X's maximum on each
side. **Don't make tall or wide versions unless the user asks.**

## Steps

1. **Get the content from the source, not from memory.** For a repo, download the README
   (`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/README.md`) and its
   logo/wordmark (SVG or PNG) into a new folder in the scratchpad. For a screenshot the
   user sends, read the text off the screenshot. For a paper or article, use its title,
   authors, abstract lines and one figure or table.
2. **Copy `template.html`** from this skill folder into that folder as `card.html`, then
   fill the blocks:
   - `h1`: the project or paper name
   - logo: the real wordmark/logo file (never draw a fake logo; drop the block if none)
   - badges: the source's own badges, with the same labels and colours
   - one or two paragraphs quoted from the source
   - one table (tiers, features, benchmark rows) and/or one code block (the install or
     quick-start command), both taken from the source
   - `.foot`: the bare source URL, e.g. `github.com/NVIDIA/SkillEvaluator`
   Keep the text the same as the source. You may shorten it by cutting whole
   sentences, but don't rewrite claims. Leave out browser chrome, GitHub tab bars and
   cookie banners.
3. **Set the glow colour** `--accent` to the brand colour of the source (r,g,b). The
   default is NVIDIA green.
4. **Render and check:**
   `node <skill dir>/render.js card.html "<working dir>/<name>-x.png"`
   Playwright and Chromium are already installed; don't install them again. The script prints the
   top and bottom margins and exits with `FIX:` if content overflows, touches the edge,
   leaves lots of empty space, or the file is over 5 MB. Adjust the size variables in
   `:root` (or cut/add a block) and re-render until it prints `OK`.
5. **Look at the PNG yourself** (Read the file) before sending. Check that nothing is cut
   off, that the text is readable when the image is shown about 500 px wide, and that the
   margins look even.
6. Send it with SendUserFile (`display: render`) and say: the size (4096x4096), the file
   size, and what's on it. If the working dir is a git repo with a branch to push to,
   commit the PNG there.

## Size defaults that worked (SkillEvaluator card)

The template's defaults (`--gap:12px; --h1:34px; --h2:25px; --logo:360px;
--p:18.5px; --codefs:16.5px; --tbl:16.5px`) held a title, a wordmark, 5 badges, a
livestream line, two paragraphs, a 4-row table, a second heading with a paragraph, a
two-line code block and a footer. With less content, raise the font sizes rather than
leaving empty space. With more, cut a block before going below `--p:17px`.

`example-skillevaluator.html` (with `example-wordmark.svg`) is the approved card, built
from the template. Render it to see the target look before making a new one.

## Scrolling video (stitch screenshots into a dark scrolling MP4/GIF)

Use this when the user sends several screenshots of one page or article, or asks for a
scrolling GIF, MP4 or animation. The same two rules apply: **dark background** and
**square, as big as X allows**. For video, X's maximum is 1920x1200 or 1200x1900, so
**1200x1200 is the largest square**. Don't use 4096 for video.

1. **Rebuild the page in dark, don't paste light screenshots.** Read the text off each
   screenshot and write it into a tall HTML page with `body{width:1200px}`, in the same
   dark palette as the card (`#0d1117` background, `#e6edf3` text, a soft glow in the
   source's brand colour). Keep the source's own words; you may cut whole sentences,
   and drop any sentence the screenshot cuts off mid-way.
2. **Reuse real images from the screenshots** (logos, icons, diagrams): crop them with PIL.
   Put a light diagram on dark with CSS `filter: invert(1) hue-rotate(180deg)`, which keeps
   brand colours roughly right. Never redraw or invent a diagram.
3. **Mark gaps honestly.** If the screenshots aren't consecutive, put a centred `•••`
   between the parts instead of pretending it's one continuous page.
4. **Fill the square edge to edge.** No title bar or browser frame around the page; the
   content is the video. Put the source (publication, title, date) as a small muted
   footer at the end of the page. Leave out browser chrome, nav bars and scrollbars.
5. **Render the tall page:** `node <skill dir>/render_tall.js page.html tall.png`
6. **Make the video:** `python3 <skill dir>/scroll_video.py tall.png "<working dir>/<name>-scroll.mp4" --gif "<working dir>/<name>-scroll.gif"`
   It holds the top for 1.5 s, eases down, holds the bottom, eases back up, and shrinks
   the GIF until it's under X's 15 MB GIF limit.
7. **Check the first and a bottom frame** (`ffmpeg -i x.mp4 -frames:v 1 top.png`,
   `ffmpeg -sseof -9 -i x.mp4 -frames:v 1 bottom.png`) before sending. **Recommend the
   MP4:** it's sharper and much smaller than the GIF.

## Rules

- The content comes from the source. Don't invent numbers, badges, quotes or logos.
- Keep the real project, company and repo names. The card shows their project and
  credits it with the URL. Don't present it as an official image from that company.
- Never include secrets, API keys, or private URLs that appear in a screenshot.
