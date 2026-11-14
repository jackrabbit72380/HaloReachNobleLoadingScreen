/*  Holographic Particle Accelerator — model import
 *  Jackrabbit72380
 *  2026
 *
 *  HPA.importModel(file) reads a mesh written by Blender's exporters — Wavefront .obj or
 *  Stanford .ply — and turns its vertices into the mask the particle engine samples, so a model
 *  made in Blender can come back in here.
 *
 *  A .blend itself is not read, and cannot be: it is Blender's own memory image plus the DNA
 *  schema of the version that wrote it, and Blender now saves it zstd-compressed by default, so
 *  reading one in a page means shipping a full DNA parser and a zstd decompressor. Exporting
 *  Wavefront (.obj) or Stanford (.ply) is the step that gets a .blend in.
 */

(() => {
    'use strict';

    const api = window.HPA;
    if (!api) return;

    const MASK_SIZE = 512;
    const MAX_VERTICES = 400000;

    function readOBJ(text) {
        const vertices = [];
        for (const line of text.split(/\r?\n/)) {
            if (line.charCodeAt(0) !== 118) continue;                 // 'v' — skip without splitting
            const parts = line.trim().split(/\s+/);
            if (parts[0] !== 'v' || parts.length < 4) continue;
            vertices.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
            if (vertices.length >= MAX_VERTICES * 3) break;
        }
        return vertices;
    }

    function readPLY(buffer) {
        const bytes = new Uint8Array(buffer);
        const needle = 'end_header';
        let at = -1;

        for (let i = 0; i + needle.length <= bytes.length && at < 0; i++) {
            let match = true;
            for (let j = 0; j < needle.length; j++) {
                if (bytes[i + j] !== needle.charCodeAt(j)) { match = false; break; }
            }
            if (match) at = i;
        }
        if (at < 0) throw new Error('no PLY header in that file');

        const header = new TextDecoder('utf-8').decode(bytes.subarray(0, at));
        const ascii = /format\s+ascii/.test(header);
        if (!ascii && !/format\s+binary_little_endian/.test(header)) {
            throw new Error('re-export that PLY as ASCII or little-endian');
        }

        let count = 0;
        let section = '';
        const properties = [];
        for (const line of header.split(/\r?\n/)) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === 'element') {
                section = parts[1];
                if (section === 'vertex') count = Number(parts[2]) || 0;
            } else if (parts[0] === 'property' && section === 'vertex') {
                properties.push(parts);
            }
        }
        if (!count) throw new Error('this PLY has no vertices');

        const wanted = ['x', 'y', 'z'].map((axis) => properties.findIndex((p) => p[p.length - 1] === axis));
        if (wanted.some((index) => index < 0)) throw new Error('this PLY has no x/y/z vertex properties');

        let start = at + needle.length;
        while (bytes[start] === 13 || bytes[start] === 10) start++;

        const vertices = [];

        if (ascii) {
            const lines = new TextDecoder('utf-8').decode(bytes.subarray(start)).split(/\r?\n/);
            for (let row = 0; row < count && row < lines.length; row++) {
                const numbers = lines[row].trim().split(/\s+/);
                if (numbers.length < properties.length) break;
                for (const index of wanted) vertices.push(Number(numbers[index]));
                if (vertices.length >= MAX_VERTICES * 3) break;
            }
            return vertices;
        }

        const SIZES = { char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, double: 8 };
        const offsets = [];
        let stride = 0;
        for (const property of properties) {
            offsets.push(stride);
            stride += SIZES[property[1]] || 4;
        }

        const view = new DataView(buffer, start);
        const read = {
            float: (at) => view.getFloat32(at, true),
            double: (at) => view.getFloat64(at, true),
            int: (at) => view.getInt32(at, true),
            uint: (at) => view.getUint32(at, true),
            short: (at) => view.getInt16(at, true),
            ushort: (at) => view.getUint16(at, true),
            uchar: (at) => view.getUint8(at),
            char: (at) => view.getInt8(at)
        };

        for (let row = 0; row < count; row++) {
            const base = row * stride;
            if (base + stride > view.byteLength) break;
            for (const index of wanted) {
                const type = properties[index][1];
                vertices.push((read[type] || read.float)(base + offsets[index]));
            }
            if (vertices.length >= MAX_VERTICES * 3) break;
        }
        return vertices;
    }

    // The mask is the front view of the mesh: X across, Y up, fitted to the square the engine
    // samples. That is the view Blender's OBJ exporter hands over by default (Y up, -Z forward).
    function maskFromVertices(vertices) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        if (!Number.isFinite(minX)) throw new Error('the mesh has no usable vertices');

        const span = Math.max(maxX - minX, maxY - minY) || 1;
        const scale = (MASK_SIZE * 0.86) / span;
        const offsetX = (MASK_SIZE - (maxX - minX) * scale) / 2;
        const offsetY = (MASK_SIZE - (maxY - minY) * scale) / 2;

        const surface = document.createElement('canvas');
        surface.width = surface.height = MASK_SIZE;
        const context = surface.getContext('2d');
        context.fillStyle = '#ffffff';

        for (let i = 0; i < vertices.length; i += 3) {
            const px = offsetX + (vertices[i] - minX) * scale;
            const py = MASK_SIZE - (offsetY + (vertices[i + 1] - minY) * scale);
            context.fillRect(px - 1.5, py - 1.5, 3, 3);
        }

        return surface.toDataURL('image/png');
    }

    api.importModel = async (file) => {
        const name = String((file && file.name) || '').toLowerCase();
        let vertices;

        if (name.endsWith('.obj')) {
            vertices = readOBJ(await file.text());
        } else if (name.endsWith('.ply')) {
            vertices = readPLY(await file.arrayBuffer());
        } else {
            throw new Error('use a .obj or .ply from Blender');
        }

        if (!vertices.length) throw new Error('no vertices in that file');

        const mask = maskFromVertices(vertices);
        api.set({ MODE: 'shape' });
        await api.setMask(mask);

        return { vertices: Math.floor(vertices.length / 3), name: file.name };
    };
})();
