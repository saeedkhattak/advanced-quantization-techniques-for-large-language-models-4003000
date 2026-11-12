---
name: x-image
description: Make a dark, GitHub-README-style image card for an X (Twitter) post at 4096x4096, the largest size X accepts and the shape that fills the full width of the post column on desktop and phone. Use whenever the user asks for an "image for X", "picture for the tweet", "X image", "make it an image", a screenshot/README to post with a tweet, or to turn a repo, paper, article or screenshot into a post image. Also use when they send a light screenshot and ask for a dark version for X.
---

# X image card (4096x4096, dark)

The user posts long AI/tech posts on X and wants one image to go with each. The format
they approved is a **square 4096x4096 PNG** in GitHub's dark theme, laid out like a
README: title, the project's real logo, badges, a short description, a table, a code
block, and the source URL at the bottom.

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

## Rules

- The content comes from the source. Don't invent numbers, badges, quotes or logos.
- Keep the real project, company and repo names. The card shows their project and
  credits it with the URL. Don't present it as an official image from that company.
- Never include secrets, API keys, or private URLs that appear in a screenshot.
