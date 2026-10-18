const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');

const compiled = buildSync({ entryPoints: ['main.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian', 'electron'], write: false }).outputFiles[0].text;
const exportsObject = { exports: {} };
vm.runInNewContext(compiled, {
    module: exportsObject,
    exports: exportsObject.exports,
    require: () => ({ Plugin: class {}, arrayBufferToBase64: bytes => Buffer.from(bytes).toString('base64') }),
    console,
});
const Plugin = exportsObject.exports.default;

function fixture(src, resourcePrefix = 'app://local/vault/') {
    const intended = { path: '資料 A/chart.png', extension: 'png' };
    const nearby = { path: 'Notes/chart.png', extension: 'png' };
    const files = [nearby, intended];
    const read = [];
    const lookups = [];
    const plugin = new Plugin();
    plugin.app = {
        metadataCache: { getFirstLinkpathDest(path, source) {
            lookups.push([path, source]);
            return path === '資料 A/chart.png' ? intended : path === 'chart.png' ? nearby : null;
        } },
        vault: {
            getFiles: () => files,
            getResourcePath: file => resourcePrefix + encodeURI(file.path) + '?mtime=200',
            readBinary: async file => { read.push(file.path); return Buffer.from(file === intended ? 'intended image' : 'wrong image'); },
        },
    };
    const image = { src, getAttribute: () => src };
    return { plugin, image, read, lookups, container: { querySelectorAll: () => [image] } };
}

for (const prefix of ['app://local/vault/', 'capacitor://localhost/_capacitor_file_/vault/']) {
    test(`embeds the explicitly rendered file, not a nearby namesake (${prefix})`, async () => {
        const f = fixture(prefix + encodeURI('資料 A/chart.png') + '?mtime=100', prefix);
        await f.plugin.replaceImagesWithBase64(f.container, 'Notes/article.md');
        assert.deepEqual(f.read, ['資料 A/chart.png']);
        assert.equal(f.image.src, 'data:image/png;base64,' + Buffer.from('intended image').toString('base64'));
    });
}

test('preserves the full relative link path', async () => {
    const f = fixture(encodeURI('資料 A/chart.png'));
    await f.plugin.replaceImagesWithBase64(f.container, 'Notes/article.md');
    assert.deepEqual(f.read, ['資料 A/chart.png']);
});

test('does not guess a basename for an unknown resource URL', async () => {
    const f = fixture('app://local/other-vault/chart.png');
    await f.plugin.replaceImagesWithBase64(f.container, 'Notes/article.md');
    assert.deepEqual(f.read, []);
    assert.equal(f.image.src, 'app://local/other-vault/chart.png');
});

for (const src of ['https://example.test/chart.png', 'http://example.test/chart.png', 'data:image/png;base64,YQ==']) {
    test(`leaves non-vault image unchanged: ${src}`, async () => {
        const f = fixture(src);
        await f.plugin.replaceImagesWithBase64(f.container, 'Notes/article.md');
        assert.deepEqual(f.read, []);
        assert.equal(f.image.src, src);
    });
}

test('still resolves an ordinary filename relative to the source note', async () => {
    const f = fixture('chart.png');
    await f.plugin.replaceImagesWithBase64(f.container, 'Notes/article.md');
    assert.deepEqual(f.read, ['Notes/chart.png']);
    assert.deepEqual(f.lookups, [['chart.png', 'Notes/article.md']]);
});

test('matches decoded Unicode and spaces against the encoded resource URL', async () => {
    const f = fixture('app://local/vault/資料 A/chart.png?mtime=100');
    await f.plugin.replaceImagesWithBase64(f.container, 'Notes/article.md');
    assert.deepEqual(f.read, ['資料 A/chart.png']);
});
