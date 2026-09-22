# Promptshelf

A personal prompt library. Your prompts are plain markdown files in a private GitHub repo you own.
This app is just a friendly way to browse, fill in, and edit them from your phone or computer.

- Fill-in variables: write `{{topic}}` in a prompt and you get a form before you copy it.
- Tags and search across titles, prompt text, and tags.
- Every save is a git commit. The commit message is your "why I changed it" note.
- History shows each version with the changes highlighted, and lets you restore one.
- No account with this app, no server, no third-party requests. Fonts are bundled.

## What a prompt file looks like

    ---
    title: Explain it to a beginner
    tags: [learning, explain]
    ---
    Explain {{topic}} to someone with no background in {{field}}.

Any other fields in the header (for Obsidian, say) are left untouched when you save.

## Hosting it (GitHub Pages)

1. Create a new **public** repository called `promptshelf` (Pages needs public on free accounts).
   It contains only this app, never your prompts.
2. Upload every file and the `fonts` folder from this folder to it.
3. Repository Settings > Pages > Build and deployment: Source "Deploy from a branch",
   Branch `main`, folder `/ (root)`, then Save.
4. After a minute your app is at `https://YOUR-USERNAME.github.io/promptshelf/`.

## Where your prompts live

Create a second, **private** repository (for example `my-prompts`) with a README.
Open the app, follow the "Connect GitHub" steps, and paste a fine-grained token limited to that one
repository with Contents: read and write. The token is stored in your browser on that device only.
Repeat on each device (on iPhone, do it inside the home-screen app; see below).

## On iPhone

Install it first, then connect. In Safari, tap Share, then "Add to Home Screen", then open the app
from its icon and enter your GitHub details there. Safari and the home-screen app keep separate
storage, so details entered in Safari will not carry over, and Safari can clear a site's stored data
after a week of not being used (home-screen apps are exempt).
