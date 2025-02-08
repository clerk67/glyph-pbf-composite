import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import protobuf from 'protocol-buffers';

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

/**
 * Combine any number of glyph (SDF) PBFs.
 * Returns a re-encoded PBF with the combined
 * font faces, composited using array order
 * to determine glyph priority.
 *
 * @param buffers An array of SDF PBFs.
 */
const combine = async (buffers?: Buffer[]) => {
  const schema = await readFile('./proto/glyphs.proto');
  const messages = protobuf(schema);
  const coverage: { [id: number]: boolean } = {};
  let result: Glyphs | undefined;

  if (!buffers || buffers.length === 0) {
    return null;
  }
  for (let i = 0, j; i < buffers.length; i++) {
    const buf = buffers[i];
    const decoded = messages.glyphs.decode<Glyphs>(buf);
    const glyphs = decoded.stacks[0].glyphs;

    if (decoded.stacks[0].name.match(/^IBM Plex Sans (SC|TC) /)) {
      for (j = 0; j < glyphs.length; j++) {
        glyphs[j].top -= 4;
      }
    }
    if (!result) {
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
      result.stacks[0].name += ', ' + decoded.stacks[0].name;
    }
  }
  result?.stacks[0].glyphs.sort((a, b) => a.id - b.id);

  return messages.glyphs.encode(result);
};

const main = async () => {
  const { values, positionals } = parseArgs({
    options: { output: { type: 'string' } },
    allowPositionals: true,
  });
  if (!values.output) {
    throw new Error('missing required option: --output');
  }
  await mkdir(values.output, {
    recursive: true,
  });
  for (let i = 0; i < 256; i++) {
    const range = `${256 * i}-${256 * (i + 1) - 1}`;
    const glyphs = await Promise.all(positionals.map(variant => readFile(`${variant}/${range}.pbf`)));
    const combined = await combine(glyphs);
    if (!combined) {
      throw new Error(`failed to combine glyphs for ${range}.pbf`);
    }
    await writeFile(`${values.output}/${range}.pbf`, combined);
  }
};

main();
