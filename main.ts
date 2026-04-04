import { Plugin, Notice, FileSystemAdapter, TFile, MarkdownRenderer, MarkdownView, Component, Platform, arrayBufferToBase64 } from 'obsidian';

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

        // Register File Menu Event (for Mobile '...' menu)
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item
                            .setTitle("Copy for Substack")
                            .setIcon("documents")
                            .onClick(async () => {
                                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                                if (view && view.file === file) {
                                    this.processMarkdown(view);
                                } else {
                                    // Fallback if view is not active or mismatch
                                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                                    if (activeView && activeView.file?.path === file.path) {
                                        this.processMarkdown(activeView);
                                    } else {
                                        new Notice("Please open the note to copy.");
                                    }
                                }
                            });
                    });
                }
            })
        );
    }

    async processMarkdown(view: MarkdownView) {
        try {
            const editor = view.editor;
            const file = view.file;
            if (!file) return;

            // --- Synchronous processing only (no await) ---
            let markdown = editor.getSelection();
            if (!markdown) {
                markdown = editor.getValue();
            }

            // Remove frontmatter (YAML)
            markdown = markdown.replace(/^---[\s\S]*?---\n?/, "");

            // WikiLink transformation: [[Link]] -> Link, [[Link|Alias]] -> Alias
            markdown = markdown.replace(/(?<!\!)\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");

            // Tokenize external links [text](https://url) to restore them after rendering.
            // Obsidian's MarkdownRenderer treats #tag inside links as tags, 
            // so we replace links with safe tokens and restore correct <a> tags later.
            const linkMap: Record<string, { text: string; url: string }> = {};
            let linkIdx = 0;
            markdown = markdown.replace(
                /(?<!\!)\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                (match, text, url) => {
                    const token = `SSTKLNK_${linkIdx}_SSTKEND`;
                    linkMap[token] = { text, url };
                    linkIdx++;
                    return token; // Leave only the token
                }
            );

            if (Platform.isDesktopApp) {
                // Desktop: Electron Clipboard (Legacy)
                const container = document.createElement("div");
                await MarkdownRenderer.render(this.app, markdown, container, file.path, new Component());
                container.querySelectorAll(".markdown-embed-title").forEach((el) => el.remove());
                this.restoreLinks(container, linkMap); // Restore tokens to correct <a> tags
                this.fixLinks(container); // Turn internal links to text
                this.sanitizeHtml(container);
                await this.replaceImagesWithBase64(container, file.path);
                const { clipboard } = require("electron");
                clipboard.write({ text: container.innerText, html: container.innerHTML });
                new Notice("Copied for Substack!");
            } else {
                await this.mobileClipboardWrite(markdown, file.path, linkMap);
            }

        } catch (error: any) {
            console.error("Substack Copy Error:", error);
            new Notice("Copy error: " + (error.message || error));
        }
    }

    async mobileClipboardWrite(markdown: string, filePath: string, linkMap: Record<string, { text: string; url: string }> = {}) {
        const self = this;
        const app = this.app;

        // Asynchronously prepare HTML (including images) and plainText
        const prepareContainer = async () => {
            const container = document.createElement("div");
            await MarkdownRenderer.render(app, markdown, container, filePath, new Component());
            container.querySelectorAll(".markdown-embed-title").forEach((el) => el.remove());
            // Restore tokenized external links to <a> tags
            self.restoreLinks(container, linkMap);
            // Remove Obsidian's CSS variables (color: var(--link-color) etc.)
            self.sanitizeStyles(container);
            // Remove internal links and keep style for external links
            self.fixLinks(container);
            // Strip nonessential attributes that some editors paste back as text.
            self.sanitizeHtml(container);
            // Reduce extra spacing from li > p etc.
            self.cleanupHtml(container);
            await self.replaceImagesWithBase64(container, filePath);
            return container;
        };

        // Stage 1: ClipboardItem with Promise (Android / Chrome / Safari 16.4+)
        // Pass Promise to ClipboardItem to maintain user gesture context
        try {
            const htmlBlob = prepareContainer().then(c => new Blob([c.innerHTML], { type: "text/html" }));
            const textBlob = prepareContainer().then(c => new Blob([c.innerText], { type: "text/plain" }));
            await (navigator.clipboard as any).write([
                new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })
            ]);
            new Notice("Copied for Substack! (Rich Text + Images)");
            return;
        } catch (e1: any) {
            console.warn("Stage 1 (ClipboardItem html) failed:", e1.message || e1);
        }

        // Fallbacks for when async processing completes (prepare once)
        const container = await prepareContainer();
        const html = container.innerHTML;
        const plainText = container.innerText;

        // Stage 2: contenteditable + execCommand (Only way to copy rich text on some iOS Safari)
        try {
            const editableDiv = document.createElement("div");
            editableDiv.contentEditable = "true";
            // Place off-screen (opacity: 0.01 to prevent iOS from disabling it as 'hidden')
            editableDiv.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;opacity:0.01;";
            editableDiv.innerHTML = html;
            document.body.appendChild(editableDiv);
            editableDiv.focus();

            const range = document.createRange();
            range.selectNodeContents(editableDiv);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }

            const success = document.execCommand("copy");
            if (sel) sel.removeAllRanges();
            document.body.removeChild(editableDiv);

            if (success) {
                new Notice("Copied for Substack! (Rich Text + Images)");
                return;
            }
            throw new Error("execCommand returned false");
        } catch (e2: any) {
            console.warn("Stage 2 (contenteditable execCommand) failed:", e2.message || e2);
        }

        // Stage 3: writeText (Plain Text)
        try {
            await navigator.clipboard.writeText(plainText);
            new Notice("Copied as text (no formatting)");
            return;
        } catch (e3: any) {
            console.warn("Stage 3 (writeText) failed:", e3.message || e3);
        }

        // Stage 4: textarea + execCommand (Last resort)
        try {
            const textArea = document.createElement("textarea");
            textArea.value = plainText;
            textArea.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            new Notice("Copied as text (Fallback)");
        } catch (e4: any) {
            console.error("Stage 4 failed:", e4.message || e4);
            new Notice("Failed to copy. Please try with the note open.");
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
                    const base64 = arrayBufferToBase64(arrayBuffer);
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

    // Restores tokenized external links to <a> tags without rewriting the whole HTML string.
    restoreLinks(container: HTMLElement, linkMap: Record<string, { text: string; url: string }>) {
        const tokens = Object.keys(linkMap);
        if (tokens.length === 0) return;

        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];

        let currentNode = walker.nextNode();
        while (currentNode) {
            textNodes.push(currentNode as Text);
            currentNode = walker.nextNode();
        }

        for (const textNode of textNodes) {
            const value = textNode.nodeValue ?? "";
            if (!tokens.some((token) => value.includes(token))) continue;

            const fragment = document.createDocumentFragment();
            let cursor = 0;

            while (cursor < value.length) {
                let nextToken: string | null = null;
                let nextIndex = value.length;

                for (const token of tokens) {
                    const index = value.indexOf(token, cursor);
                    if (
                        index !== -1 &&
                        (index < nextIndex || (index === nextIndex && (!nextToken || token.length > nextToken.length)))
                    ) {
                        nextIndex = index;
                        nextToken = token;
                    }
                }

                if (!nextToken) {
                    fragment.appendChild(document.createTextNode(value.slice(cursor)));
                    break;
                }

                if (nextIndex > cursor) {
                    fragment.appendChild(document.createTextNode(value.slice(cursor, nextIndex)));
                }

                const { text, url } = linkMap[nextToken];
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.textContent = text;
                fragment.appendChild(anchor);

                cursor = nextIndex + nextToken.length;
            }

            textNode.parentNode?.replaceChild(fragment, textNode);
        }
    }

    // Removes Obsidian's CSS variable references
    sanitizeStyles(container: HTMLElement) {
        container.querySelectorAll("*").forEach((el) => {
            el.removeAttribute("class");
            el.removeAttribute("style");
        });
        // Explicitly set base text color
        (container as any).style.color = "#000000";
    }

    sanitizeHtml(container: HTMLElement) {
        container.querySelectorAll("*").forEach((el) => {
            const tagName = el.tagName.toLowerCase();
            const allowedAttrs = new Set<string>();

            if (tagName === "a") {
                allowedAttrs.add("href");
            } else if (tagName === "img") {
                allowedAttrs.add("src");
                allowedAttrs.add("alt");
            }

            Array.from(el.attributes).forEach((attr) => {
                if (!allowedAttrs.has(attr.name.toLowerCase())) {
                    el.removeAttribute(attr.name);
                }
            });
        });
    }

    // Reduces extra spacing from li > p etc.
    cleanupHtml(container: HTMLElement) {
        container.querySelectorAll("li > p").forEach((p) => {
            const parent = p.parentNode;
            if (parent) {
                while (p.firstChild) {
                    parent.insertBefore(p.firstChild, p);
                }
                parent.removeChild(p);
            }
        });
        container.querySelectorAll("p, div").forEach((el) => {
            if (!el.hasChildNodes() || el.innerHTML.trim() === "") {
                el.remove();
            }
        });
    }

    // Fixes links after rendering
    fixLinks(container: HTMLElement) {
        const links = container.querySelectorAll("a");
        links.forEach((link) => {
            const href = link.getAttribute("href") || "";
            const linkText = link.textContent || "";
            if (href.startsWith("http://") || href.startsWith("https://")) {
                link.setAttribute("href", href);
                link.setAttribute("target", "_blank");
                link.setAttribute("rel", "noopener noreferrer");
            } else {
                const text = document.createTextNode(linkText);
                link.parentNode?.replaceChild(text, link);
            }
        });
    }
}
