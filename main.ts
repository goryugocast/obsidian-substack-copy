import { Plugin, Notice, FileSystemAdapter, TFile, MarkdownRenderer, MarkdownView, Component, Platform } from 'obsidian';

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

            if (Platform.isDesktopApp) {
                const { clipboard } = require('electron');
                clipboard.write({
                    text: plainText,
                    html: html
                });
            } else {
                // Mobile Fallback using standard Clipboard API
                const data = [new ClipboardItem({
                    "text/plain": new Blob([plainText], { type: "text/plain" }),
                    "text/html": new Blob([html], { type: "text/html" })
                })];
                await navigator.clipboard.write(data);
            }

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

            try {
                if (src.startsWith('http://') || src.startsWith('https://')) {
                    continue;
                }

                let filenameRaw = src.split('/').pop()?.split('?')[0];
                if (!filenameRaw) continue;
                
                let filename = decodeURIComponent(filenameRaw);
                
                let file = this.app.metadataCache.getFirstLinkpathDest(filename, sourcePath);

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
