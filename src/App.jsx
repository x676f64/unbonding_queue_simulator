import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

const UnbondingQueueModel = () => {
  // Parameters from RFC
  const LOWER_BOUND_DAYS = 2;
  const UPPER_BOUND_DAYS = 28;
  const MIN_SLASHABLE_SHARE = 0.5;
  const TOTAL_STAKE_ESTIMATE = 800_000_000; // ~800M DOT estimate
  const LOWEST_THIRD_RATIO = 0.287; // From RFC empirical data
  
  // Calculate max_unstake
  const max_unstake = MIN_SLASHABLE_SHARE * (LOWEST_THIRD_RATIO * TOTAL_STAKE_ESTIMATE);
  
  const [unbondingAmount, setUnbondingAmount] = useState(1000);
  const [currentQueueSize, setCurrentQueueSize] = useState(0);
  const [simulationData, setSimulationData] = useState([]);
  
  // Calculate unbonding time for a given amount
  const calculateUnbondingTime = (amount, queueSize = 0) => {
    const effective_queue = queueSize + amount;
    const time_delta = (effective_queue / max_unstake) * UPPER_BOUND_DAYS;
    return Math.max(LOWER_BOUND_DAYS, Math.min(UPPER_BOUND_DAYS, time_delta));
  };
  
  // Generate simulation data for different amounts
  useEffect(() => {
    const amounts = [];
    const times = [];
    
    // Log scale for better visualization
    for (let i = 2; i <= 8; i += 0.2) {
      const amount = Math.pow(10, i);
      const time = calculateUnbondingTime(amount, currentQueueSize);
      amounts.push({
        amount: amount,
        time: time,
        amountLabel: formatAmount(amount)
      });
    }
    
    setSimulationData(amounts);
  }, [currentQueueSize]);
  
  const formatAmount = (amount) => {
    if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toFixed(1)}M`;
    } else if (amount >= 1_000) {
      return `${(amount / 1_000).toFixed(1)}K`;
    } else {
      return amount.toString();
    }
  };
  
  const currentUnbondingTime = calculateUnbondingTime(unbondingAmount, currentQueueSize);
  const queueUtilization = ((currentQueueSize + unbondingAmount) / max_unstake) * 100;
  
  // Example scenarios
  const scenarios = [
    { name: "Small Holder", amount: 100, description: "Typical retail staker" },
    { name: "Medium Holder", amount: 10_000, description: "Active participant" },
    { name: "Large Holder", amount: 1_000_000, description: "Institutional staker" },
    { name: "Whale", amount: 10_000_000, description: "Major stakeholder" },
    { name: "Exchange", amount: 50_000_000, description: "Large exchange unstaking" }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Polkadot Unbonding Queue Simulator
        </h1>
        <p className="text-gray-600">
          Model the proposed dynamic unbonding mechanism from RFC-0097
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-sm text-blue-600 font-medium">Max Unstake Capacity</div>
          <div className="text-2xl font-bold text-blue-900">{formatAmount(max_unstake)} DOT</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-sm text-green-600 font-medium">Min Unbonding Time</div>
          <div className="text-2xl font-bold text-green-900">{LOWER_BOUND_DAYS} days</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-sm text-red-600 font-medium">Max Unbonding Time</div>
          <div className="text-2xl font-bold text-red-900">{UPPER_BOUND_DAYS} days</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-sm text-purple-600 font-medium">Queue Utilization</div>
          <div className="text-2xl font-bold text-purple-900">{queueUtilization.toFixed(1)}%</div>
        </div>
      </div>

      {/* Interactive Calculator */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Unbonding Time Calculator</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount to Unbond (DOT)
            </label>
            <input
              type="number"
              value={unbondingAmount}
              onChange={(e) => setUnbondingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              step="1000"
            />
            <div className="mt-2 text-sm text-gray-500">
              Enter the amount of DOT you want to unbond
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Queue Size (DOT)
            </label>
            <input
              type="number"
              value={currentQueueSize}
              onChange={(e) => setCurrentQueueSize(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              step="1000000"
            />
            <div className="mt-2 text-sm text-gray-500">
              Total DOT already in the unbonding queue
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-lg font-semibold text-gray-900">
            Your Estimated Unbonding Time: {currentUnbondingTime.toFixed(1)} days
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Queue position adds {(currentUnbondingTime - LOWER_BOUND_DAYS).toFixed(1)} days to the minimum
          </div>
        </div>
      </div>

      {/* Scenarios Analysis */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Example Scenarios</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((scenario, idx) => {
            const time = calculateUnbondingTime(scenario.amount, currentQueueSize);
            return (
              <div key={idx} className="p-4 border border-gray-200 rounded-lg">
                <div className="font-medium text-gray-900">{scenario.name}</div>
                <div className="text-sm text-gray-600">{scenario.description}</div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-blue-600">
                    {formatAmount(scenario.amount)} DOT
                  </div>
                  <div className="text-sm">
                    Unbonding time: <span className="font-semibold">{time.toFixed(1)} days</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visualization */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Unbonding Time vs Amount</h2>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={simulationData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="amountLabel" 
                label={{ value: 'Unbonding Amount (DOT)', position: 'insideBottom', offset: -5 }}
              />
              <YAxis 
                label={{ value: 'Unbonding Time (days)', angle: -90, position: 'insideLeft' }}
                domain={[0, 30]}
              />
              <Tooltip 
                formatter={(value, name) => [`${value.toFixed(1)} days`, 'Unbonding Time']}
                labelFormatter={(label) => `Amount: ${label} DOT`}
              />
              <Line 
                type="monotone" 
                dataKey="time" 
                stroke="#2563eb" 
                strokeWidth={3}
                dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 text-sm text-gray-600">
          <p>This chart shows how unbonding time increases with the amount being unbonded. 
          The relationship is linear until it hits the 28-day maximum.</p>
        </div>
      </div>

      {/* Key Insights */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-blue-900 mb-4">Key Insights</h2>
        <ul className="space-y-2 text-blue-800">
          <li>• Most retail stakers (under 100K DOT) will experience ~2 day unbonding times</li>
          <li>• The mechanism only significantly increases wait times for very large unbonding requests</li>
          <li>• Queue capacity of ~{formatAmount(max_unstake)} DOT can be unbonded at minimum time</li>
          <li>• During normal conditions, average unbonding time should be close to 2.67 days (from RFC empirical analysis)</li>
          <li>• The system never performs worse than the current 28-day fixed period</li>
        </ul>
      </div>
    </div>
  );
};

export default UnbondingQueueModel;
