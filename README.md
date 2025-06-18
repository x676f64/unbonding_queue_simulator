# Polkadot Unbonding Queue Simulator

An interactive web application that models the proposed dynamic unbonding mechanism from Polkadot RFC-0097.

## Overview

This simulator allows users to explore how the new unbonding queue mechanism would work, showing how unbonding times scale from a minimum of 2 days to a maximum of 28 days based on the amount being unbonded and current queue conditions.

## Features

- **Interactive Calculator**: Input any unbonding amount and see estimated wait times
- **Real-time Visualization**: Charts showing how unbonding time scales with amount
- **Scenario Analysis**: Pre-configured examples for different user types
- **Queue Simulation**: Adjust current queue conditions to see their impact

## Key Parameters

- **Min Unbonding Time**: 2 days
- **Max Unbonding Time**: 28 days (never worse than current system)
- **Queue Capacity**: ~115M DOT can be unbonded at minimum time
- **Average Expected Time**: ~2.67 days (from RFC empirical analysis)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Deployment

This project is configured for easy deployment on Vercel:

1. Push to GitHub
2. Connect repository to Vercel
3. Vercel will automatically detect the configuration and deploy

## Based on RFC-0097

This simulator is based on the specifications outlined in Polkadot RFC-0097: "Unbonding Queue" by Jonas Gehrlein & Alistair Stewart.

## License

MIT
