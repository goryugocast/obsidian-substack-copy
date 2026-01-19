import { Plugin, Notice, FileSystemAdapter, TFile, MarkdownRenderer, MarkdownView, Component } from 'obsidian';
const { clipboard } = require('electron');

export default class SubstackCopyPlugin extends Plugin {
    async onload() {
        console.log('Loading Substack Copy Plugin');

        this.addCommand({
            id: 'copy-for-substack',
            name: 'Copy for Substack',
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking) {
                        this.processMarkdown(view);
                    }
                    return true;
                }
                return false;
            }
        });
    }

    async processMarkdown(view: MarkdownView) {
        try {
            const editor = view.editor;
            const file = view.file;
            if (!file) return;

            let markdown = editor.getSelection();
            if (!markdown) {
                markdown = editor.getValue();
            }

            // 1. Render Markdown to HTML
            // Using a dummy container to render
            const container = document.createElement('div');
            await MarkdownRenderer.render(this.app, markdown, container, file.path, new Component());

            // 2. Process Images (Base64 Injection)
            await this.replaceImagesWithBase64(container, file.path);

            // 3. Write to Clipboard
            const html = container.innerHTML;
            const plainText = container.innerText;

            clipboard.write({
                text: plainText,
                html: html
            });

            new Notice('Content copied for Substack!');

        } catch (error) {
            console.error('Substack Copy Error:', error);
            new Notice('Error copying content. Check console for details.');
        }
    }

    async replaceImagesWithBase64(container: HTMLElement, sourcePath: string) {
        const images = container.querySelectorAll('img');

        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const src = img.getAttribute('src');

            if (!src) continue;

            // Handle internal links (app://...) and relative paths
            let file: TFile | null = null;

            // Try to resolve the link using metadata cache
            // Since MarkdownRenderer usually resolves wikilinks to app:// or proper internal formats,
            // we often need to extract the filename or decode the URI.

            try {
                // If it's a full public URL, skip it
                if (src.startsWith('http://') || src.startsWith('https://')) {
                    continue;
                }

                // Attempt to resolve file from src
                // In Obsidian, src often looks like "app://local/Users/..." or "lib/..." depending on context
                // But specifically for MarkdownRenderer, it resolves to standard src formats.
                // A reliable way is to match against vault files if possible, 
                // OR use resolveLinkText if we can get the original link text. 
                // However, render() output already transforms it.

                // Simplified approach: Try to find file by name/path match if resolve fails
                // But actually, getFirstLinkpathDest or resolveLinkText is for raw md.
                // The renderer output `src` corresponds to the resource path.

                // Let's decode the src to handle spaces etc
                const decodedSrc = decodeURIComponent(src);

                // Basic check: is it in the vault?
                // The src from MarkdownRenderer for internal images is usually the resource path (app://...)
                // We need to convert that back to a TFile.
                // But we can simply rely on the fact that we might just have the filename if it's a simple render,
                // OR adapt based on what we see. 
                // WAIT: MarkdownRenderer.render produces <img src="app://..."> usually.

                const resourcePath = img.src; // This gets the full resolved URL (app://...)

                // We can't easily turn app:// into TFile directly without parsing.
                // Better approach: iterate vault files and match? No, too slow.
                // metadataCache.getFirstLinkpathDest is efficient IF we have the link text.
                // But we have the rendered SRC.

                // Heuristic: Extract filename from the src URL
                // Most reliable for local vault images: 
                // src="app://local/Users/goryugo/.../assets/foo.png?12345"

                // Let's try to match existing logic that people use or simply regex the filename
                // and find it in the vault?
                // Safer: MetadataCache.getFirstLinkpathDest requires the link text (e.g. "foo.png").

                // Let's try to parse the original link from the `data-src` if available?
                // Obsidian often puts original link in `alt` or `src`

                // FALLBACK: Iterate all files? No.
                // Let's assume the user uses standard WikiLinks.
                // The filename is usually at the end of the path.

                let filenameRaw = src.split('/').pop()?.split('?')[0];
                if (!filenameRaw) continue;
                let filename = decodeURIComponent(filenameRaw);

                // Try to find the file. getFirstLinkpathDest requires a path, 
                // and sourcePath to resolve relative links.
                file = this.app.metadataCache.getFirstLinkpathDest(filename, sourcePath);

                if (file) {
                    const arrayBuffer = await this.app.vault.readBinary(file);
                    const base64 = this.arrayBufferToBase64(arrayBuffer);
                    const mimeType = this.getMimeType(file.extension);
                    img.src = `data:${mimeType};base64,${base64}`;
                }

            } catch (e) {
                console.error(`Failed to process image: ${src}`, e);
            }
        }
    }

    getMimeType(extension: string): string {
        switch (extension.toLowerCase()) {
            case 'png': return 'image/png';
            case 'jpg':
            case 'jpeg': return 'image/jpeg';
            case 'gif': return 'image/gif';
            case 'webp': return 'image/webp';
            case 'svg': return 'image/svg+xml';
            default: return 'application/octet-stream';
        }
    }

    arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
