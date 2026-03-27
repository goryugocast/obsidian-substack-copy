# Changelog

## [0.1.7] - 2026-03-27
### Fixed
- Improved mobile clipboard handling with multiple fallback paths for rich text and plain text copy.
- Preserved standard external Markdown links more reliably during HTML rendering.
- Cleaned pasted output by removing YAML frontmatter, embed titles, and excess spacing from rendered lists.

### Changed
- Restored `.gitignore` so build artifacts and dependencies do not show up as release noise.

## [0.1.6] - 2026-02-10
### Added
- WikiLink removal logic to clean up text for Substack (keeps alias or link text).
- Feature to strip `markdown-embed-title` class elements to remove redundant titles from embeds.

## [0.1.5] - 2026-01-19
### Fixed
- Correct author name in manifest.
- Native Base64 encoding fix.
