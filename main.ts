// Washout Reclaim — a long-only cbBTC/USDC bot for the make.fun BTC race.
//
// The entrypoint only wires the vendored bars-replay SDK shim to the strategy
// in src/strategy.ts: the shim owns the agent-fun/bars-replay/v1 wire (hello,
// one batch per minute bar, done) and the strategy answers each batch with
// the orders it decides on it. Run it with Node 22 or later:
//
//   node main.ts
//
// It starts with 1,000 USDC of paper money, holds at most one position, and
// is deterministic: the same bars in, the same orders out.

import { runBars } from './vendor/makefun-bars.ts';
import { createWashoutReclaim } from './src/strategy.ts';

await runBars(createWashoutReclaim());
