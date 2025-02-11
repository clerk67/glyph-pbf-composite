import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import protobuf from 'protocol-buffers';

import recipe from './recipe.json' with { type: 'json' };

interface Glyph {
  id: number;
  bitmap: Buffer | null;
  width: number;
  height: number;
  left: number;
  top: number;
  advance: number;
}

interface Glyphs {
  stacks: FontStack[];
}

interface FontStack {
  name: string;
  range: string;
  glyphs: Glyph[];
}

const BUILD_GLYPHS_BIN = '../node-fontnik/bin/build-glyphs';

const download = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to download: ${url}`);
  }
  await mkdir('./tmp', { recursive: true });
  const path = `./tmp/${createHash('md5').update(url).digest('hex')}.${url.split('.').at(-1)}`;
  await pipeline(res.body!, createWriteStream(path));

  return path;
};

const buildGlyphs = async (path: string) => {
  const outputPath = path.replace(/\.[^.]+$/, '');
  await mkdir(outputPath, { recursive: true });
  execSync(`${BUILD_GLYPHS_BIN} ${path} ${outputPath}`);

  return outputPath;
};

/**
 * Combine any number of glyph (SDF) PBFs.
 * Returns a re-encoded PBF with the combined
 * font faces, composited using array order
 * to determine glyph priority.
 */
const combine = async (fonts: { path: string; offset?: number[] }[]) => {
  const schema = await readFile('./proto/glyphs.proto');
  const messages = protobuf(schema);
  const coverage: { [id: number]: boolean } = {};
  let result: Glyphs | undefined;

  for (let i = 0, j; i < fonts.length; i++) {
    const { path, offset } = fonts[i];
    const buf = await readFile(path);
    const decoded = messages.glyphs.decode<Glyphs>(buf);
    const glyphs = decoded.stacks[0].glyphs;

    if (offset) {
      for (j = 0; j < glyphs.length; j++) {
        glyphs[j].top += offset[0] ?? 0;
        glyphs[j].left += offset[1] ?? 0;
      }
    }
    if (result === undefined) {
      for (j = 0; j < glyphs.length; j++) {
        coverage[glyphs[j].id] = true;
      }
      result = decoded;
    } else {
      for (j = 0; j < glyphs.length; j++) {
        const glyph = glyphs[j];
        if (!coverage[glyph.id]) {
          result.stacks[0].glyphs.push(glyph);
          coverage[glyph.id] = true;
        }
      }
    }
  }
  if (result === undefined) {
    return null;
  }
  result.stacks[0].name = '';
  result.stacks[0].glyphs.sort((a, b) => a.id - b.id);

  return messages.glyphs.encode(result);
};

const main = async () => {
  const font = recipe.fonts.find(({ name }) => name === process.argv[2]);
  if (font === undefined) {
    throw new Error(`font not found: ${process.argv[2]}`);
  }
  for (let i = 0; i < font.styles.length; i++) {
    const gredients = await Promise.all(font.styles[i].gredients.map(async ({ url, ...props }) => {
      const path = await download(url);
      const outputPath = await buildGlyphs(path);
      return { path: outputPath, ...props };
    }));
    await Promise.all(new Array(256).fill(0).map(async (_, j) => {
      const range = `${256 * j}-${256 * (j + 1) - 1}`;
      const fonts = await Promise.all(gredients.map(variant => ({ ...variant, path: `${variant.path}/${range}.pbf` })));
      const combined = await combine(fonts);
      if (combined !== null) {
        await mkdir(`output/${font.styles[i].name}`, { recursive: true });
        await writeFile(`output/${font.styles[i].name}/${range}.pbf`, combined);
      }
    }));
  }
};

main();
