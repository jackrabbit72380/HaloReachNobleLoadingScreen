/*  Holographic Particle Accelerator — model import
 *  Jackrabbit72380
 *  2026
 *
 *  HPA.importModel(file) reads a mesh written by Blender's exporters — Wavefront .obj or
 *  Stanford .ply — and hands the particle engine its surfaces as a real point cloud, so an
 *  imported model keeps its depth: turn it and the far side comes round, tilt it and you see the
 *  top, inside view walks into it, and Capture → Model writes the same points back out.
 *
 *  A .blend itself is not read, and cannot be: it is Blender's own memory image plus the DNA
 *  schema of the version that wrote it, and Blender saves it zstd-compressed by default, so
 *  reading one in a page means shipping a full DNA parser and a zstd decompressor. Exporting
 *  Wavefront (.obj) or Stanford (.ply) is the step that gets a .blend in.
 */

(() => {
    'use strict';

    const api = window.HPA;
    if (!api) return;

    const MAX_VERTICES = 400000;      // a hard stop, so one huge file cannot lock the page up
    const MAX_FACES = 800000;
    // A mesh's surface is usually larger than the built-in shapes', so it gets more points than
    // the 10–12 k the ball and the cube use, or the surfaces read thin.
    const TARGET_POINTS = 18000;

    /*--- Readers ---*/

    function readOBJ(text) {
        const vertices = [];
        const faces = [];

        for (const line of text.split(/\r?\n/)) {
            const head = line.charCodeAt(0);
            if (head !== 118 && head !== 102) continue;      // 'v' and 'f' only
            const parts = line.trim().split(/\s+/);

            if (parts[0] === 'v' && parts.length >= 4) {
                vertices.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
                if (vertices.length >= MAX_VERTICES * 3) break;
            } else if (parts[0] === 'f' && parts.length >= 4) {
                const corners = [];
                for (let i = 1; i < parts.length; i++) {
                    const index = parseInt(parts[i], 10);
                    if (!Number.isFinite(index)) break;
                    // OBJ indices are 1-based, and negative ones count back from the end.
                    corners.push(index > 0 ? index - 1 : (vertices.length / 3) + index);
                }
                // Polygon faces are split into a fan; the engine only needs the triangles.
                for (let i = 1; i + 1 < corners.length; i++) {
                    faces.push(corners[0], corners[i], corners[i + 1]);
                }
                if (faces.length >= MAX_FACES * 3) break;
            }
        }

        return { vertices, faces };
    }

    const SCALAR_SIZE = {
        char: 1, int8: 1, uchar: 1, uint8: 1,
        short: 2, int16: 2, ushort: 2, uint16: 2,
        int: 4, int32: 4, uint: 4, uint32: 4,
        float: 4, float32: 4, double: 8, float64: 8
    };

    function readScalar(view, at, type) {
        switch (type) {
            case 'char': case 'int8': return view.getInt8(at);
            case 'uchar': case 'uint8': return view.getUint8(at);
            case 'short': case 'int16': return view.getInt16(at, true);
            case 'ushort': case 'uint16': return view.getUint16(at, true);
            case 'uint': case 'uint32': return view.getUint32(at, true);
            case 'double': case 'float64': return view.getFloat64(at, true);
            default: return type === 'int' || type === 'int32' ? view.getInt32(at, true) : view.getFloat32(at, true);
        }
    }

    function findHeaderEnd(bytes) {
        const needle = 'end_header';
        for (let i = 0; i + needle.length <= bytes.length; i++) {
            let match = true;
            for (let j = 0; j < needle.length; j++) {
                if (bytes[i + j] !== needle.charCodeAt(j)) { match = false; break; }
            }
            if (match) return i;
        }
        return -1;
    }

    function readPLY(buffer) {
        const bytes = new Uint8Array(buffer);
        const end = findHeaderEnd(bytes);
        if (end < 0) throw new Error('no PLY header in that file');

        const header = new TextDecoder('utf-8').decode(bytes.subarray(0, end));
        const ascii = /format\s+ascii/.test(header);
        if (!ascii && !/format\s+binary_little_endian/.test(header)) {
            throw new Error('re-export that PLY as ASCII or little-endian');
        }

        const elements = [];
        for (const line of header.split(/\r?\n/)) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === 'element') {
                elements.push({ name: parts[1], count: Number(parts[2]) || 0, properties: [] });
            } else if (parts[0] === 'property' && elements.length) {
                const element = elements[elements.length - 1];
                if (parts[1] === 'list') {
                    element.properties.push({ list: true, countType: parts[2], itemType: parts[3], name: parts[4] });
                } else {
                    element.properties.push({ list: false, type: parts[1], name: parts[2] });
                }
            }
        }

        if (!elements.some((element) => element.name === 'vertex' && element.count)) {
            throw new Error('this PLY has no vertices');
        }

        let start = end + 'end_header'.length;
        while (bytes[start] === 13 || bytes[start] === 10) start++;

        const vertices = [];
        const faces = [];

        const keep = (name, record) => {
            if (name === 'vertex') {
                if (vertices.length >= MAX_VERTICES * 3) return;
                vertices.push(Number(record.x), Number(record.y), Number(record.z));
            } else if (name === 'face' && faces.length < MAX_FACES * 3) {
                const list = record.vertex_indices || record.vertex_index;
                if (Array.isArray(list) && list.length >= 3) {
                    for (let i = 1; i + 1 < list.length; i++) faces.push(list[0], list[i], list[i + 1]);
                }
            }
        };

        if (ascii) {
            const tokens = new TextDecoder('utf-8').decode(bytes.subarray(start)).split(/\s+/).filter(Boolean);
            let at = 0;
            for (const element of elements) {
                for (let row = 0; row < element.count; row++) {
                    const record = {};
                    for (const property of element.properties) {
                        if (property.list) {
                            const count = Number(tokens[at++]) || 0;
                            const values = [];
                            for (let i = 0; i < count; i++) values.push(Number(tokens[at++]));
                            record[property.name] = values;
                        } else {
                            record[property.name] = Number(tokens[at++]);
                        }
                    }
                    keep(element.name, record);
                }
            }
        } else {
            const view = new DataView(buffer, start);
            let at = 0;
            for (const element of elements) {
                for (let row = 0; row < element.count; row++) {
                    const record = {};
                    for (const property of element.properties) {
                        if (property.list) {
                            const count = readScalar(view, at, property.countType);
                            at += SCALAR_SIZE[property.countType] || 1;
                            const values = [];
                            for (let i = 0; i < count; i++) {
                                values.push(readScalar(view, at, property.itemType));
                                at += SCALAR_SIZE[property.itemType] || 4;
                            }
                            record[property.name] = values;
                        } else {
                            record[property.name] = readScalar(view, at, property.type);
                            at += SCALAR_SIZE[property.type] || 4;
                        }
                    }
                    keep(element.name, record);
                }
            }
        }

        return { vertices, faces };
    }

    /*--- Mesh to points ---*/

    // Points are what the engine draws, so the mesh is handed over as points in world units:
    // centred on its bounding box, fitted to MASK_HEIGHT, and taken from its surfaces. Surfaces
    // matter: a Blender cube ships 8 vertices and 12 triangles, and 8 dots are not a cube, so
    // when the file has faces the points are spread over them, area-weighted, so big triangles
    // get more of them. Files with no faces at all come in as their vertices.
    function pointsFromMesh(vertices, faces) {
        const count = Math.floor(vertices.length / 3);
        if (!count) throw new Error('no vertices in that file');

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        if (!Number.isFinite(minX)) throw new Error('the mesh has no usable vertices');

        const centre = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
        const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        const height = (Number(api.config.MASK_HEIGHT) || 4.6) * 0.9;
        const scale = height / span;

        const place = (x, y, z) => ({
            x: (x - centre[0]) * scale,
            y: (y - centre[1]) * scale,
            z: (z - centre[2]) * scale
        });

        const points = [];
        const triangles = [];

        if (faces && faces.length) {
            for (let i = 0; i + 2 < faces.length; i += 3) {
                const a = faces[i] * 3;
                const b = faces[i + 1] * 3;
                const c = faces[i + 2] * 3;
                if (a < 0 || b + 2 >= vertices.length || c + 2 >= vertices.length) continue;

                const abx = vertices[b] - vertices[a];
                const aby = vertices[b + 1] - vertices[a + 1];
                const abz = vertices[b + 2] - vertices[a + 2];
                const acx = vertices[c] - vertices[a];
                const acy = vertices[c + 1] - vertices[a + 1];
                const acz = vertices[c + 2] - vertices[a + 2];

                const cx = aby * acz - abz * acy;
                const cy = abz * acx - abx * acz;
                const cz = abx * acy - aby * acx;
                const area = 0.5 * Math.hypot(cx, cy, cz);
                if (!(area > 0)) continue;

                triangles.push({ a, b, c, area });
            }
        }

        if (triangles.length) {
            const cumulative = [];
            let total = 0;
            for (const triangle of triangles) {
                total += triangle.area;
                cumulative.push(total);
            }

            for (let i = 0; i < TARGET_POINTS; i++) {
                const aim = Math.random() * total;
                let low = 0;
                let high = cumulative.length - 1;
                while (low < high) {
                    const mid = (low + high) >> 1;
                    if (cumulative[mid] < aim) low = mid + 1;
                    else high = mid;
                }

                const triangle = triangles[low];
                let u = Math.random();
                let v = Math.random();
                if (u + v > 1) { u = 1 - u; v = 1 - v; }
                const w = 1 - u - v;

                const ax = vertices[triangle.a], ay = vertices[triangle.a + 1], az = vertices[triangle.a + 2];
                const bx = vertices[triangle.b], by = vertices[triangle.b + 1], bz = vertices[triangle.b + 2];
                const ccx = vertices[triangle.c], ccy = vertices[triangle.c + 1], ccz = vertices[triangle.c + 2];

                points.push(place(
                    ax * w + bx * u + ccx * v,
                    ay * w + by * u + ccy * v,
                    az * w + bz * u + ccz * v
                ));
            }
        } else {
            const step = Math.max(1, Math.ceil(count / TARGET_POINTS));
            for (let i = 0; i < count; i += step) {
                const at = i * 3;
                points.push(place(vertices[at], vertices[at + 1], vertices[at + 2]));
            }
        }

        // Arrival timing, as the built-in shapes do it: things near the middle land first.
        let furthest = 0;
        for (const point of points) {
            const distance = Math.hypot(point.x, point.y, point.z);
            if (distance > furthest) furthest = distance;
        }
        const norm = furthest || 1;

        for (const point of points) {
            const radial = Math.hypot(point.x, point.y, point.z) / norm;
            point.wait = Math.min(1, Math.max(0, radial * 0.78 + Math.random() * 0.15));
        }

        return points;
    }

    api.importModel = async (file) => {
        const name = String((file && file.name) || '').toLowerCase();
        let mesh;

        if (name.endsWith('.obj')) {
            mesh = readOBJ(await file.text());
        } else if (name.endsWith('.ply')) {
            mesh = readPLY(await file.arrayBuffer());
        } else {
            throw new Error('use a .obj or .ply from Blender');
        }

        if (!mesh.vertices.length) throw new Error('no vertices in that file');
        if (!api.setPointCloud) throw new Error('this page cannot take a point cloud');

        const points = pointsFromMesh(mesh.vertices, mesh.faces);

        api.set({ MODE: 'shape' });
        await api.setPointCloud(points);

        return {
            vertices: Math.floor(mesh.vertices.length / 3),
            points: points.length,
            name: file.name
        };
    };
})();
