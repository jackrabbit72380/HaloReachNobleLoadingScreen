/*  Holographic Particle Accelerator — Model export
 *  Jackrabbit72380
 *  2026
 *
 *  Writes the assembled target out as a model file: OBJ or PLY, one vertex per particle,
 *  in the same world units the animation uses.
 *
 *  Why not .blend: that format is a dump of Blender's own memory plus the DNA schema of the
 *  Blender version that wrote it, and there is no writer outside Blender itself. These two
 *  formats are what Blender imports in one step, so the geometry lands in the scene either way.
 */

(() => {
    'use strict';

    const api = window.HPA;
    if (!api) return;

    function targetName() {
        const source = String((api.config && api.config.MASK_SRC) || 'shape');
        if (source === 'ball' || source === 'spear') return source;
        if (source.startsWith('data:')) return 'custom';
        const file = source.split('?')[0].split('/').pop() || 'shape';
        return file.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'shape';
    }

    function vertices() {
        const source = api.geometry ? api.geometry() : [];
        return source.filter((point) =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
    }

    const round = (value) => value.toFixed(4);

    function objText(list, name) {
        const lines = [
            '# Holographic Particle Accelerator — ' + name,
            '# Jackrabbit72380',
            '# ' + list.length + ' particles, world units, Y up, no faces',
            'o hpa_' + name
        ];
        for (const point of list) lines.push(`v ${round(point.x)} ${round(point.y)} ${round(point.z)}`);
        lines.push('');
        return lines.join('\n');
    }

    function plyText(list, name) {
        const lines = [
            'ply',
            'format ascii 1.0',
            'comment Holographic Particle Accelerator — ' + name + ' (Jackrabbit72380)',
            'element vertex ' + list.length,
            'property float x',
            'property float y',
            'property float z',
            'end_header'
        ];
        for (const point of list) lines.push(`${round(point.x)} ${round(point.y)} ${round(point.z)}`);
        lines.push('');
        return lines.join('\n');
    }

    function download(text, filename) {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 20000);
    }

    api.exportModel = (format = 'obj') => {
        const list = vertices();
        if (!list.length) return { error: 'the target has not been built yet' };

        const name = targetName();
        const stamp = new Date().toISOString().slice(0, 10);
        const text = format === 'ply' ? plyText(list, name) : objText(list, name);
        const ext = format === 'ply' ? 'ply' : 'obj';
        download(text, `holographic-particle-accelerator-${name}-${stamp}.${ext}`);

        return { count: list.length, format: ext, bytes: text.length };
    };
})();
