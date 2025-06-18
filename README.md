# RFC-0097 Era-Based Unbonding Simulator

Interactive simulator for Polkadot's proposed era-based unbonding queue mechanism.

## RFC References

- **Original RFC**: [RFC-0097: Unbonding Queue](https://polkadot-fellows.github.io/RFCs/approved/0097-unbonding_queue.html)
- **Updated Implementation**: [Era-Based Specification](https://hackmd.io/@vKfUEAWlRR2Ogaq8nYYknw/SyfioMGWgl)

## Implementation

### Era-Based Storage
- `lowest_third_stake[era]` and `total_unbond_in_era[era]` for last 28 eras
- UnlockChunk format: `(unbonding_amount, unbonding_start_era, previous_unbonded_stake_in_era)`
- Per-era threshold validation instead of global queue

### RFC-Compliant Algorithms

**Withdrawal Check:**
```
if current_era < unbonding_start_era + 2: fail
for era from unbonding_start_era to current_era-27:
    if total_unbond >= (1-MIN_SLASHABLE_SHARE) * lowest_third_stake[era]: fail
```

**Time Estimation:**
```
return max(0, unbonding_start_era+2-current_era, era+28-current_era)
```

**Rebonding:** Updates `total_unbond_in_era` for affected eras

### Network Parameters
- **Polkadot**: 28 eras (~28 days), 1 era/day
- **Kusama**: 7 eras (~7 days), 4 eras/day  
- **MIN_SLASHABLE_SHARE**: 0.5 (50% can unbond quickly)
- **MIN_UNBONDING_ERAS**: 2 (minimum wait time)

## Features

### Interactive Controls
- Create/rebond UnlockChunks with real-time validation
- Era advancement to simulate time progression
- Dynamic network parameter adjustment
- Withdrawal eligibility checking

### Visualization
- Era data table (capacity vs utilization)
- UnlockChunk status and time estimates
- Network scenario presets
- Real-time threshold calculations

### Educational Value
- Demonstrates era-based vs simple queue security models
- Shows impact of historical unbonding on current requests
- Explains minimum wait time requirements
- Illustrates network participation effects on capacity

## Usage

```bash
pnpm install
pnpm dev
```

## Key Differences from Original RFC

| Aspect | Original (Sequential) | Updated (Era-Based) |
|--------|----------------------|---------------------|
| Storage | Global queue state | Per-era tracking |
| Logic | Simple queue math | Complex era iteration |
| Security | Fixed capacity | Dynamic era thresholds |
| Predictability | High | Context-dependent |

## Technical Details

**Capacity Calculation:**
```
max_unstake[era] = (1 - MIN_SLASHABLE_SHARE) * lowest_third_stake[era]
```

**Security Model:**
- Prevents more than 50% of lowest-third validator stake from unbonding quickly
- Maintains sufficient stake for Long Range Attack protection
- Adapts to changing validator sets per era

**Complexity:**
- O(28) era iteration for withdrawal checks
- Dynamic thresholds based on historical data
- Sophisticated rebonding effects on queue state