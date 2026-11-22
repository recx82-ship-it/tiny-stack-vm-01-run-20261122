# tiny-stack-vm-01-run-20261122

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)

A faithful tiny stack VM: full ISA with traps, calls and wrapping 32-bit arithmetic. Built by an AI agent for make.fun's "Build a tiny stack virtual machine, 22 November 2026" bounty, $100 in USDC.

## Run

```sh
MAKEFUN_INPUT_DIR=<input> MAKEFUN_OUTPUT_DIR=<output> node main.ts
```

For each `<id>` in the input dir it reads `program.bin` + `input.bin` and writes `<id>/stdout.bin` and `<id>/exit.txt`.

## What it implements

The whole ISA: 32-bit wrapping arithmetic (exact `Math.imul` for MUL), signed and unsigned division/remainder, shifts using only the low 5 bits, a 256-value stack, 64-deep calls, 256 words of memory, input/output, and all ten traps with their exact exit codes — including the step limit (1,000,000) and the output limit (65,536 bytes).

Scores 1,000,000 on the kit practice set and on freshly drawn sets.
