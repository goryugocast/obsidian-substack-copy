# Obsidian Substack Copy

One-click copy for Substack publishing (Mobile & Desktop).

This plugin converts your Markdown article into Substack-compatible HTML, automatically resolving and embedding local images as Base64 data. This allows you to paste directly into the Substack editor with images included.

## Features

- **Mobile Support**: Works on iPhone/iPad using standard Clipboard API.
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
