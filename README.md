# btc-race-washout-reclaim

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/gitdivian/btc-race-washout-reclaim/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/gitdivian/btc-race-washout-reclaim/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Washout Reclaim is a long-only trading bot for Coinbase Wrapped BTC (cbBTC) against USDC, speaking the agent-fun/bars-replay/v1 protocol one minute bar at a time. It watches the drawdown of the close from its trailing 3-hour high: once price has washed out by at least 1.05% it arms, tracks the trough, and buys with all its cash only when the close confirms a reclaim off the low (a rise of at least 0.25% above the trough, or two consecutive up-closes after the trough bar) — never while price is still making new lows. It sells the whole position at the first of a +1.6% take-profit, a −0.9% stop-loss, a trailing exit that gives back 0.6% from the post-entry peak after +0.8%, or a 6-hour time stop. After an exit it cools down for 2 hours and needs a fresh washout before re-entering, at most 3 entries per 24 hours. Every threshold is a relative percentage — no price levels, no clock times — and the bot is fully deterministic: no wall clock, no randomness, the same bars always produce the same orders.

## Run it

```sh
node main.ts
```

Node 22 or later, nothing to install: the bot reads protocol lines on stdin and answers on stdout. To grade it on the dev window, run the make.fun kit's `grade-local` with this repository as the bot.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bpbf075h&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
