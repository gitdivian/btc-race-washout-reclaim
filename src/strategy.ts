// Washout Reclaim: a long-only dip-buying mean-reversion strategy for one symbol.
//
// The bot watches the drawdown of the close from its trailing high of closes.
// Once price has washed out far enough it arms an episode and tracks the
// trough low of the fall. It buys only on a confirmed reclaim off that trough
// (the close back above the low by a set rise, or two consecutive up-closes
// after the trough bar), never while price is still making new trough lows.
// A position is sold whole at the first of a take-profit, a stop-loss, a
// trailing give-back after a run-up, or a time stop. After an exit the bot
// cools down and demands a fresh washout episode before it may re-enter, and
// it enters at most a set number of times per window.
//
// Every threshold is a relative percentage of a price the bot has seen: no
// absolute price levels, no clock times. The bot reads no wall clock and no
// randomness, so the same bars always produce the same orders.

import type { BarsState, Batch, OrderInput } from '../vendor/makefun-bars.ts';

export interface WashoutParams {
  /** Trailing window, in bars, for the high of closes the drawdown is measured from. */
  highWindowBars: number;
  /** Bars at the start of a window during which no entry is taken (warm-up). */
  warmupBars: number;
  /** Drawdown from the trailing high (a fraction, 0.0105 = 1.05%) that arms an episode. */
  armDrawdown: number;
  /** Recovery of the drawdown (a fraction) that ends an unfilled episode. */
  resetDrawdown: number;
  /** Rise of the close above the trough low (a fraction) that confirms a reclaim. */
  reclaimBounce: number;
  /** Take-profit above the entry fill price (a fraction). */
  takeProfit: number;
  /** Stop-loss below the entry fill price (a fraction). */
  stopLoss: number;
  /** Post-entry gain (a fraction) that arms the trailing exit. */
  trailArm: number;
  /** Fall from the post-entry peak close (a fraction) that triggers the trailing exit. */
  trailGiveback: number;
  /** Bars a position may be held before the time stop sells it. */
  timeStopBars: number;
  /** Bars after an exit before a new entry may be taken. */
  cooldownBars: number;
  /** Most entries in one window. */
  maxEntries: number;
  /** max_slippage_bps named on every order. */
  slippageBps: number;
}

export const DEFAULT_PARAMS: WashoutParams = {
  highWindowBars: 180,
  warmupBars: 30,
  armDrawdown: 0.0105,
  resetDrawdown: 0.0035,
  reclaimBounce: 0.0020,
  takeProfit: 0.016,
  stopLoss: 0.009,
  trailArm: 0.008,
  trailGiveback: 0.006,
  timeStopBars: 360,
  cooldownBars: 120,
  maxEntries: 3,
  slippageBps: 150,
};

interface Episode {
  /** The lowest bar low since the episode armed. */
  troughLow: number;
  /** The bar that printed that low. */
  troughBar: number;
}

/** A bars-replay bot (the onBatch half of the SDK's Bot) running Washout Reclaim with the given parameters. */
export function createWashoutReclaim(params: WashoutParams = DEFAULT_PARAMS): {
  onBatch(state: BarsState, batch: Batch): OrderInput[];
} {
  /** Every close seen, oldest first; only the tail is ever read. */
  const closes: number[] = [];
  /** Symbol bars seen so far (the strategy's own minute count). */
  let bar = 0;
  /** The armed washout episode, or null when price has not washed out. */
  let episode: Episode | null = null;
  /** Position state, settled from fills: the account is the truth, these are its terms. */
  let long = false;
  let entryPrice = 0;
  let entryBar = 0;
  let peakClose = 0;
  /** Orders sent on the previous batch whose fills the next batch reports. */
  let pendingBuy = false;
  let pendingSell = false;
  /** Entries taken this window and the bar a cooldown ends. */
  let entries = 0;
  let cooldownUntil = 0;

  function onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const symbol = state.hello.symbols[0]!.symbol;

    // Fills first: they settle the orders decided on earlier batches. A filled
    // buy opens the position on the terms it filled at; a filled sell closes
    // it and starts the cooldown. A rejected buy hands its entry slot back.
    for (const fill of batch.fills) {
      if (fill.symbol !== symbol) continue;
      if (fill.side === 'buy') {
        pendingBuy = false;
        if (fill.status === 'filled') {
          long = true;
          entryPrice = Number(fill.price);
          entryBar = bar + 1;
          peakClose = entryPrice;
        } else {
          entries -= 1;
        }
      } else if (!fill.client_id.startsWith('_')) {
        // A sell of ours (the replay's own flatten fills are named _flatten_).
        pendingSell = false;
        if (fill.status === 'filled') {
          long = false;
          episode = null; // re-entry needs a fresh washout, not this one resumed
          cooldownUntil = bar + params.cooldownBars;
        }
      }
    }

    // A minute with no bar for the symbol carries no new price: nothing to decide.
    const current = batch.bars.find((b) => b.symbol === symbol);
    if (current === undefined) return [];
    bar += 1;
    const close = Number(current.c);
    const low = Number(current.l);
    closes.push(close);

    // The trailing high of closes and the drawdown from it.
    let high = 0;
    const from = Math.max(0, closes.length - params.highWindowBars);
    for (let i = from; i < closes.length; i++) if (closes[i]! > high) high = closes[i]!;
    const drawdown = close / high - 1;

    if (long) {
      if (close > peakClose) peakClose = close;
    } else if (episode === null) {
      if (drawdown <= -params.armDrawdown) episode = { troughLow: low, troughBar: bar };
    } else {
      if (low < episode.troughLow) {
        episode.troughLow = low;
        episode.troughBar = bar;
      } else if (drawdown > -params.resetDrawdown) {
        episode = null; // price recovered without a fill: the washout is over
      }
    }

    // Warm-up batches build history but take no orders (the replay rejects them).
    if (state.warmingUp) return [];

    if (long) {
      if (pendingSell) return [];
      const gain = close / entryPrice - 1;
      const exit =
        gain >= params.takeProfit ||
        gain <= -params.stopLoss ||
        (peakClose >= entryPrice * (1 + params.trailArm) &&
          close <= peakClose * (1 - params.trailGiveback)) ||
        bar - entryBar >= params.timeStopBars;
      if (!exit) return [];
      const position = state.positions.get(symbol);
      if (position === undefined || position.qty === 0n) return [];
      pendingSell = true;
      return [{ side: 'sell', symbol, qty: position.qty, max_slippage_bps: params.slippageBps }];
    }

    // Flat: enter only on a confirmed reclaim off an armed episode's trough.
    if (pendingBuy || episode === null) return [];
    // Warm-up: on partial history the trailing high is not yet meaningful, so
    // the first bars of a window never produce an entry.
    if (bar <= params.warmupBars) return [];
    if (entries >= params.maxEntries || bar < cooldownUntil) return [];
    const bounced = episode.troughBar < bar && close >= episode.troughLow * (1 + params.reclaimBounce);
    const twoUp =
      episode.troughBar <= bar - 2 &&
      closes.length >= 3 &&
      close > closes[closes.length - 2]! &&
      closes[closes.length - 2]! > closes[closes.length - 3]!;
    if (!bounced && !twoUp) return [];
    if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    pendingBuy = true;
    entries += 1;
    return [{ side: 'buy', symbol, notional_quote_units: state.cash, max_slippage_bps: params.slippageBps }];
  }

  return { onBatch };
}
