# Obsidian Substack Copy

One-click copy for Substack publishing (Mobile & Desktop).

This plugin converts your Markdown article into Substack-compatible HTML, automatically resolving and embedding local images as Base64 data. This allows you to paste directly into the Substack editor with images included.

## Features

- **Improved Mobile Support**: Tries rich HTML clipboard first, then falls back through iOS-friendly copy paths, and finally plain text when the platform blocks rich copy.
- **Cleaner Output**: Removes YAML frontmatter, strips Obsidian embed titles, flattens internal links to text, and keeps external links usable.
- **Desktop Support**: Works on Mac using Electron Clipboard API.
- **Zero Config**: Just install and run the command.
- **Image Embedding**: Automatically finds local images referenced in your note and embeds them as Base64.
- **Format Preservation**: Uses Obsidian's core Markdown engine to preserve your formatting.

## How to Use

1. Open a note in Obsidian.
2. Select text (or select nothing to copy the entire file).
3. Run command: `Substack Copy: Copy for Substack`.
4. Paste into Substack.

## Installation (BRAT)

1. Monitor this repository URL.
2. Add to [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Development

```bash
npm install
npm run dev
```

## Known Issues

- **Mobile Clipboard Size Limit**: On iOS/iPadOS, attempting to copy articles with large or multiple images may result in an "Unable to encode image" or "NotAllowedError" due to the operating system's strict limit on clipboard data size. If this happens, try copying the article in smaller chunks or plain text.
- **External Link Edge Cases**: Standard Markdown links are preserved, but unusually formatted URLs may still need a quick check after pasting into Substack.
