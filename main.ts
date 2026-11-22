// Tiny stack VM: a faithful interpreter of make.fun's tiny stack ISA (ISA.md in the kit).
// node main.ts reads MAKEFUN_INPUT_DIR (default /input) and writes MAKEFUN_OUTPUT_DIR
// (default /output): for each <id> it reads program.bin + input.bin and writes
// <id>/stdout.bin and <id>/exit.txt. Follows the reference VM (generator/subject/vm.mjs)
// step for step, including every trap and its exact exit code.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [opcode, immediate bytes, pops, pushes] for every opcode in the ISA.
const OPS = [
  [0x00, 0, 0, 0], [0x01, 1, 0, 1], [0x02, 4, 0, 1], [0x03, 0, 1, 0],
  [0x04, 0, 1, 2], [0x05, 0, 2, 2], [0x06, 0, 2, 3], [0x07, 0, 3, 3],
  [0x10, 0, 2, 1], [0x11, 0, 2, 1], [0x12, 0, 2, 1], [0x13, 0, 2, 1],
  [0x14, 0, 2, 1], [0x15, 0, 2, 1], [0x16, 0, 2, 1], [0x17, 0, 1, 1],
  [0x18, 0, 2, 1], [0x19, 0, 2, 1], [0x1a, 0, 2, 1], [0x1b, 0, 1, 1],
  [0x1c, 0, 2, 1], [0x1d, 0, 2, 1], [0x1e, 0, 2, 1], [0x20, 0, 2, 1],
  [0x21, 0, 2, 1], [0x22, 0, 2, 1], [0x30, 2, 0, 0], [0x31, 2, 1, 0],
  [0x32, 2, 1, 0], [0x33, 2, 0, 0], [0x34, 0, 0, 0], [0x40, 0, 1, 1],
  [0x41, 0, 2, 0], [0x50, 0, 1, 0], [0x51, 0, 1, 0], [0x52, 0, 0, 1],
  [0x53, 0, 1, 0],
];
const IMM = new Int8Array(256).fill(-1);
const POP = new Uint8Array(256);
const PSH = new Uint8Array(256);
for (const [op, im, po, pu] of OPS) { IMM[op] = im; POP[op] = po; PSH[op] = pu; }

const enc = new TextEncoder();
let OUT: Uint8Array;

// Runs one program on its input. Returns [output length, exit code]; the bytes are in OUT.
// Traps: 2 underflow, 3 overflow, 4 div-by-zero, 5 unknown opcode, 6 memory, 7 call depth,
// 8 empty RET, 9 pc outside / immediate cut off, 10 step limit, 11 output limit.
function run(p: Uint8Array, inp: Uint8Array): [number, number] {
  const n = p.length;
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cs = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  OUT = out;
  let ol = 0, ip = 0, pc = 0, st = 0;
  for (;;) {
    if (st === 1000000) return [ol, 10];
    if (pc < 0 || pc >= n) return [ol, 9];
    const op = p[pc], im = IMM[op];
    if (im < 0) return [ol, 5];
    if (pc + im >= n) return [ol, 9];
    st++;
    const nx = pc + 1 + im;
    if (sp < POP[op]) return [ol, 2];
    if (sp - POP[op] + PSH[op] > 256) return [ol, 3];
    pc = nx;
    switch (op) {
      case 0x00: return [ol, 0];
      case 0x01: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1]; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r: number;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return [ol, 4]; r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return [ol, 4]; r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 0x15) { if (b === 0) return [ol, 4]; r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return [ol, 4]; r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        if (op === 0x30 || (op === 0x31) === (D[--sp] === 0)) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cs === 64) return [ol, 7];
        C[cs++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cs === 0) return [ol, 8];
        pc = C[--cs];
        break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return [ol, 6];
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a > 255) return [ol, 6];
        sp -= 2; M[a] = v;
        break;
      }
      case 0x50: {
        const bs = enc.encode(String(D[sp - 1]));
        if (ol + bs.length > 65536) return [ol, 11];
        sp--; out.set(bs, ol); ol += bs.length;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return [ol, 11];
        out[ol++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return [ol, D[--sp] & 255];
      default: return [ol, 5];
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const [ol, code] = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), OUT.subarray(0, ol));
  writeFileSync(join(O, id, 'exit.txt'), `${code}\n`);
}
