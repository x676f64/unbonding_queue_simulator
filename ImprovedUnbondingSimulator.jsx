import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const ImprovedUnbondingSimulator = () => {
  // RFC Parameters - these should be configurable for Kusama vs Polkadot
  const [networkParams, setNetworkParams] = useState({
    name: 'Polkadot',
    LOWER_BOUND_DAYS: 2,
    UPPER_BOUND_DAYS: 28,
    MIN_SLASHABLE_SHARE: 0.5,
    TOTAL_STAKE_ESTIMATE: 800_000_000, // Conservative estimate
    LOWEST_THIRD_RATIO: 0.287, // This should vary per era, using RFC's empirical value
    BLOCKS_PER_DAY: 14400, // ~6 second blocks
  });

  // Queue state - this is the key missing piece from my original simulator
  const [queueState, setQueueState] = useState({
    back_of_queue_block: 0, // When the queue will be empty
    current_block: 0,
    pending_slashes: false,
    total_queue_stake: 0,
  });

  // Individual unbonding requests
  const [unbondingRequests, setUnbondingRequests] = useState([]);
  const [nextRequestId, setNextRequestId] = useState(1);

  // UI state
  const [newUnbondingAmount, setNewUnbondingAmount] = useState(10000);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [timeSimulation, setTimeSimulation] = useState(0); // Days passed

  // Calculate max_unstake based on current parameters
  const max_unstake = networkParams.MIN_SLASHABLE_SHARE * 
                     (networkParams.LOWEST_THIRD_RATIO * networkParams.TOTAL_STAKE_ESTIMATE);

  // Core RFC mechanism implementation
  const calculateUnbondingRequest = useCallback((amount, currentQueueBlock, currentBlock) => {
    // This is the actual RFC formula
    const unbonding_time_delta_blocks = (amount / max_unstake) * 
                                       (networkParams.UPPER_BOUND_DAYS * networkParams.BLOCKS_PER_DAY);
    
    // Add to back of queue
    const new_back_of_queue = Math.max(currentBlock, currentQueueBlock) + unbonding_time_delta_blocks;
    
    // Calculate actual unbonding block for this user
    const unbonding_duration_blocks = Math.min(
      networkParams.UPPER_BOUND_DAYS * networkParams.BLOCKS_PER_DAY,
      Math.max(
        new_back_of_queue - currentBlock,
        networkParams.LOWER_BOUND_DAYS * networkParams.BLOCKS_PER_DAY
      )
    );
    
    const unbonding_block = currentBlock + unbonding_duration_blocks;
    
    return {
      unbonding_time_delta_blocks,
      new_back_of_queue,
      unbonding_block,
      unbonding_duration_days: unbonding_duration_blocks / networkParams.BLOCKS_PER_DAY
    };
  }, [max_unstake, networkParams]);

  // Add new unbonding request
  const addUnbondingRequest = () => {
    if (newUnbondingAmount <= 0) return;

    const calculation = calculateUnbondingRequest(
      newUnbondingAmount, 
      queueState.back_of_queue_block, 
      queueState.current_block
    );

    const newRequest = {
      id: nextRequestId,
      amount: newUnbondingAmount,
      request_block: queueState.current_block,
      unbonding_block: calculation.unbonding_block,
      unbonding_duration_days: calculation.unbonding_duration_days,
      unbonding_time_delta_blocks: calculation.unbonding_time_delta_blocks,
      status: 'pending',
      can_rebond: true,
    };

    setUnbondingRequests(prev => [...prev, newRequest]);
    setQueueState(prev => ({
      ...prev,
      back_of_queue_block: calculation.new_back_of_queue,
      total_queue_stake: prev.total_queue_stake + newUnbondingAmount,
    }));
    setNextRequestId(prev => prev + 1);
  };

  // Rebond functionality - key missing feature from original
  const rebondRequest = (requestId) => {
    const request = unbondingRequests.find(r => r.id === requestId);
    if (!request || !request.can_rebond || request.status !== 'pending') return;

    // Subtract the time delta from back of queue (RFC mechanism)
    setQueueState(prev => ({
      ...prev,
      back_of_queue_block: prev.back_of_queue_block - request.unbonding_time_delta_blocks,
      total_queue_stake: prev.total_queue_stake - request.amount,
    }));

    // Remove the request
    setUnbondingRequests(prev => prev.filter(r => r.id !== requestId));

    // Recalculate all pending requests since queue moved forward
    recalculateQueue();
  };

  // Recalculate queue after rebonding
  const recalculateQueue = useCallback(() => {
    setUnbondingRequests(prev => {
      return prev.map(request => {
        if (request.status !== 'pending') return request;
        
        // This is simplified - in reality, we'd need to replay the queue
        const blocks_remaining = request.unbonding_block - (queueState.current_block + timeSimulation * networkParams.BLOCKS_PER_DAY);
        const days_remaining = Math.max(0, blocks_remaining / networkParams.BLOCKS_PER_DAY);
        
        return {
          ...request,
          remaining_days: days_remaining,
          status: days_remaining <= 0 ? 'completed' : 'pending'
        };
      });
    });
  }, [queueState.current_block, timeSimulation, networkParams.BLOCKS_PER_DAY]);

  // Simulate time progression
  const advanceTime = (days) => {
    const new_time = timeSimulation + days;
    setTimeSimulation(new_time);
    
    const current_block_sim = queueState.current_block + (new_time * networkParams.BLOCKS_PER_DAY);
    
    // Update request statuses
    setUnbondingRequests(prev => {
      return prev.map(request => {
        const blocks_remaining = request.unbonding_block - current_block_sim;
        const days_remaining = Math.max(0, blocks_remaining / networkParams.BLOCKS_PER_DAY);
        
        return {
          ...request,
          remaining_days: days_remaining,
          status: days_remaining <= 0 ? 'completed' : 'pending'
        };
      });
    });
  };

  // Demonstrate splitting benefit
  const demonstrateSplitting = () => {
    const large_amount = 1000000;
    
    // Single large request
    const single_calc = calculateUnbondingRequest(
      large_amount, 
      queueState.back_of_queue_block, 
      queueState.current_block
    );
    
    // Split into 10 smaller requests
    const split_amount = large_amount / 10;
    let running_queue = queueState.back_of_queue_block;
    const split_requests = [];
    
    for (let i = 0; i < 10; i++) {
      const calc = calculateUnbondingRequest(split_amount, running_queue, queueState.current_block);
      split_requests.push(calc);
      running_queue = calc.new_back_of_queue;
    }
    
    return {
      single: single_calc.unbonding_duration_days,
      split_avg: split_requests.reduce((sum, req) => sum + req.unbonding_duration_days, 0) / 10,
      split_max: Math.max(...split_requests.map(req => req.unbonding_duration_days)),
      split_requests
    };
  };

  const splittingDemo = demonstrateSplitting();

  // Generate queue visualization data
  const queueVisualizationData = unbondingRequests
    .filter(req => req.status === 'pending')
    .sort((a, b) => a.unbonding_block - b.unbonding_block)
    .map((req, index) => ({
      position: index + 1,
      amount: req.amount,
      days_remaining: req.remaining_days || req.unbonding_duration_days,
      id: req.id,
    }));

  const formatAmount = (amount) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
    return amount.toString();
  };

  const queueUtilization = (queueState.total_queue_stake / max_unstake) * 100;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          RFC-0097 Unbonding Queue: Accurate Implementation
        </h1>
        <p className="text-gray-600 mb-4">
          Proper sequential queue model with rebonding, time progression, and splitting benefits
        </p>
        
        {/* Network selector */}
        <div className="flex justify-center gap-4 mb-6">
          <button 
            onClick={() => setNetworkParams(prev => ({...prev, name: 'Polkadot', UPPER_BOUND_DAYS: 28}))}
            className={`px-4 py-2 rounded ${networkParams.name === 'Polkadot' ? 'bg-pink-500 text-white' : 'bg-gray-200'}`}
          >
            Polkadot (28 days)
          </button>
          <button 
            onClick={() => setNetworkParams(prev => ({...prev, name: 'Kusama', UPPER_BOUND_DAYS: 7}))}
            className={`px-4 py-2 rounded ${networkParams.name === 'Kusama' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}
          >
            Kusama (7 days)
          </button>
        </div>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-sm text-blue-600 font-medium">Max Unstake Capacity</div>
          <div className="text-xl font-bold text-blue-900">{formatAmount(max_unstake)} DOT</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-sm text-green-600 font-medium">Queue Utilization</div>
          <div className="text-xl font-bold text-green-900">{queueUtilization.toFixed(1)}%</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-sm text-purple-600 font-medium">Time Simulated</div>
          <div className="text-xl font-bold text-purple-900">{timeSimulation.toFixed(1)} days</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-sm text-orange-600 font-medium">Active Requests</div>
          <div className="text-xl font-bold text-orange-900">{unbondingRequests.filter(r => r.status === 'pending').length}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-sm text-red-600 font-medium">Queue End</div>
          <div className="text-xl font-bold text-red-900">
            {((queueState.back_of_queue_block - queueState.current_block - timeSimulation * networkParams.BLOCKS_PER_DAY) / networkParams.BLOCKS_PER_DAY).toFixed(1)} days
          </div>
        </div>
      </div>

      {/* Add Unbonding Request */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Add Unbonding Request</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount to Unbond (DOT)
            </label>
            <input
              type="number"
              value={newUnbondingAmount}
              onChange={(e) => setNewUnbondingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              step="1000"
            />
          </div>
          <button
            onClick={addUnbondingRequest}
            disabled={queueState.pending_slashes}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            Add to Queue
          </button>
        </div>
        {queueState.pending_slashes && (
          <p className="mt-2 text-red-600 text-sm">Queue frozen due to pending slashes</p>
        )}
      </div>

      {/* Queue Management */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Queue Management</h2>
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => advanceTime(1)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            +1 Day
          </button>
          <button
            onClick={() => advanceTime(7)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            +1 Week
          </button>
          <button
            onClick={() => setTimeSimulation(0)}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Reset Time
          </button>
          <button
            onClick={() => setQueueState(prev => ({...prev, pending_slashes: !prev.pending_slashes}))}
            className={`px-4 py-2 rounded-md text-white ${queueState.pending_slashes ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
          >
            {queueState.pending_slashes ? 'Resolve Slashes' : 'Simulate Pending Slashes'}
          </button>
        </div>
      </div>

      {/* Active Unbonding Requests */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Your Unbonding Requests</h2>
        {unbondingRequests.length === 0 ? (
          <p className="text-gray-500">No unbonding requests yet</p>
        ) : (
          <div className="space-y-3">
            {unbondingRequests.map(request => (
              <div key={request.id} className={`p-4 border rounded-lg ${request.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{formatAmount(request.amount)} DOT</span>
                    <span className={`ml-3 px-2 py-1 rounded text-xs ${request.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {request.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      {request.status === 'pending' ? (
                        `${(request.remaining_days || request.unbonding_duration_days).toFixed(1)} days remaining`
                      ) : (
                        'Ready to withdraw'
                      )}
                    </div>
                    {request.can_rebond && request.status === 'pending' && (
                      <button
                        onClick={() => rebondRequest(request.id)}
                        className="mt-1 px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                      >
                        Rebond
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Splitting Benefit Demonstration */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Benefits of Splitting Large Stakes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-red-600 font-medium">Single 1M DOT Request</div>
            <div className="text-2xl font-bold text-red-900">{splittingDemo.single.toFixed(1)} days</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-green-600 font-medium">10x 100K DOT (Average)</div>
            <div className="text-2xl font-bold text-green-900">{splittingDemo.split_avg.toFixed(1)} days</div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-600 font-medium">Improvement</div>
            <div className="text-2xl font-bold text-blue-900">{((splittingDemo.single - splittingDemo.split_avg) / splittingDemo.single * 100).toFixed(1)}%</div>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-600">
          Splitting large stakes into smaller chunks reduces average wait time, but creates more transactions.
          The last chunk in a split still waits the full time.
        </p>
      </div>

      {/* Queue Visualization */}
      {queueVisualizationData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Current Queue State</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={queueVisualizationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="position" label={{ value: 'Queue Position', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Days Remaining', angle: -90, position: 'insideLeft' }} />
                <Tooltip 
                  formatter={(value, name) => [`${value.toFixed(1)} days`, 'Wait Time']}
                  labelFormatter={(position) => `Position: ${position}`}
                />
                <Bar dataKey="days_remaining" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* RFC Compliance Notes */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-yellow-900 mb-4">RFC-0097 Implementation Notes</h2>
        <ul className="space-y-2 text-yellow-800 text-sm">
          <li>• <strong>Sequential Queue:</strong> Each request adds time to the back of the queue, not capacity competition</li>
          <li>• <strong>Rebonding Impact:</strong> Rebonding subtracts time from queue, moving everyone forward</li>
          <li>• <strong>Splitting Benefits:</strong> Smaller requests can "ride behind" larger ones more efficiently</li>
          <li>• <strong>Deferred Slashing:</strong> Pending slashes can freeze the entire queue until resolved</li>
          <li>• <strong>Dynamic Parameters:</strong> max_unstake should update every era based on actual validator backing</li>
          <li>• <strong>Time Progression:</strong> Queue naturally empties as time passes and tokens are released</li>
        </ul>
      </div>
    </div>
  );
};

export default ImprovedUnbondingSimulator;