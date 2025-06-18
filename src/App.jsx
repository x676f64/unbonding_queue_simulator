import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const EraBasedUnbondingSimulator = () => {
  // Network parameters
  const [networkParams, setNetworkParams] = useState({
    name: 'Polkadot',
    BONDING_DURATION: 28, // eras
    MIN_UNBONDING_ERAS: 2, // minimum eras before withdrawal
    MIN_SLASHABLE_SHARE: 0.5,
    ERAS_PER_DAY: 1, // Polkadot: ~4 eras per day, simplified to 1 for demo
  });

  // Era-based state (last 28 eras) - this is the key new storage model
  const [eraData, setEraData] = useState(() => {
    const initialEras = {};
    for (let i = 0; i < 28; i++) {
      initialEras[i] = {
        lowest_third_stake: 229_600_000, // Default based on 800M total * 0.287
        total_unbond_in_era: 0,
      };
    }
    return initialEras;
  });

  // Current era and time
  const [currentEra, setCurrentEra] = useState(27); // Start at era 27 (latest)
  const [timeAdvanced, setTimeAdvanced] = useState(0);

  // Individual UnlockChunks - new format per updated RFC
  const [unlockChunks, setUnlockChunks] = useState([]);
  const [nextChunkId, setNextChunkId] = useState(1);

  // UI state
  const [newUnbondingAmount, setNewUnbondingAmount] = useState(10000);
  const [totalStakedDOT, setTotalStakedDOT] = useState(800_000_000);
  const [lowestThirdRatio, setLowestThirdRatio] = useState(0.287);

  // Calculate max unstake per era
  const getMaxUnstakeForEra = (era) => {
    const lowestThirdStake = eraData[era]?.lowest_third_stake || 0;
    return (1 - networkParams.MIN_SLASHABLE_SHARE) * lowestThirdStake;
  };

  // Core RFC withdrawal check implementation
  const canWithdraw = useCallback((chunk) => {
    const { unbonding_amount, unbonding_start_era, previous_unbonded_stake_in_era } = chunk;
    
    // Check minimum time requirement
    if (currentEra < unbonding_start_era + networkParams.MIN_UNBONDING_ERAS) {
      return { canWithdraw: false, reason: `Must wait ${networkParams.MIN_UNBONDING_ERAS} eras minimum` };
    }

    // Check if within bonding duration window
    if (unbonding_start_era >= currentEra - (networkParams.BONDING_DURATION - 1)) {
      let total_unbond = 0;
      
      // Iterate through eras as per RFC algorithm
      for (let era = unbonding_start_era; era >= currentEra - (networkParams.BONDING_DURATION - 1); era--) {
        if (era === unbonding_start_era) {
          // Special case for the starting era
          total_unbond = Math.min(
            eraData[era]?.total_unbond_in_era || 0,
            previous_unbonded_stake_in_era + unbonding_amount
          );
        } else {
          total_unbond += eraData[era]?.total_unbond_in_era || 0;
        }
        
        // Check threshold for this era
        const maxUnstake = getMaxUnstakeForEra(era);
        if (total_unbond >= maxUnstake) {
          const remainingEras = Math.max(0, era + networkParams.BONDING_DURATION - currentEra);
          return { 
            canWithdraw: false, 
            reason: `Threshold exceeded in era ${era}`,
            estimatedErasRemaining: remainingEras
          };
        }
      }
    }

    return { canWithdraw: true, reason: 'All checks passed' };
  }, [currentEra, eraData, networkParams, getMaxUnstakeForEra]);

  // Estimate unbonding time for existing chunk
  const estimateUnbondingTime = useCallback((chunk) => {
    const { unbonding_amount, unbonding_start_era, previous_unbonded_stake_in_era } = chunk;
    
    // If outside bonding duration window, can withdraw immediately
    if (unbonding_start_era < currentEra - (networkParams.BONDING_DURATION - 1)) {
      return 0;
    }

    let total_unbond = 0;
    
    // Iterate through eras to find when withdrawal becomes possible
    for (let era = unbonding_start_era; era >= currentEra - (networkParams.BONDING_DURATION - 1); era--) {
      if (era === unbonding_start_era) {
        total_unbond = Math.min(
          eraData[era]?.total_unbond_in_era || 0,
          previous_unbonded_stake_in_era + unbonding_amount
        );
      } else {
        total_unbond += eraData[era]?.total_unbond_in_era || 0;
      }
      
      const maxUnstake = getMaxUnstakeForEra(era);
      if (total_unbond >= maxUnstake) {
        return Math.max(0, era + networkParams.BONDING_DURATION - currentEra);
      }
    }
    
    return Math.max(0, unbonding_start_era + networkParams.MIN_UNBONDING_ERAS - currentEra);
  }, [currentEra, eraData, networkParams, getMaxUnstakeForEra]);

  // Estimate unbonding time for prospective unbonder
  const estimateNewUnbondingTime = useCallback((unbond_amount) => {
    const unbonding_start_era = currentEra;
    
    let total_unbond = 0;
    
    for (let era = unbonding_start_era; era >= currentEra - (networkParams.BONDING_DURATION - 1); era--) {
      if (era === unbonding_start_era) {
        total_unbond = (eraData[era]?.total_unbond_in_era || 0) + unbond_amount;
      } else {
        total_unbond += eraData[era]?.total_unbond_in_era || 0;
      }
      
      const maxUnstake = getMaxUnstakeForEra(era);
      if (total_unbond >= maxUnstake) {
        return Math.max(0, era + networkParams.BONDING_DURATION - currentEra);
      }
    }
    
    return networkParams.MIN_UNBONDING_ERAS;
  }, [currentEra, eraData, networkParams, getMaxUnstakeForEra]);

  // Add new unbonding request
  const addUnbondingRequest = () => {
    if (newUnbondingAmount <= 0) return;

    const unbonding_start_era = currentEra;
    const previous_unbonded_stake_in_era = eraData[currentEra]?.total_unbond_in_era || 0;
    
    const newChunk = {
      id: nextChunkId,
      unbonding_amount: newUnbondingAmount,
      unbonding_start_era: unbonding_start_era,
      previous_unbonded_stake_in_era: previous_unbonded_stake_in_era,
      status: 'pending',
    };

    // Update era data
    setEraData(prev => ({
      ...prev,
      [currentEra]: {
        ...prev[currentEra],
        total_unbond_in_era: (prev[currentEra]?.total_unbond_in_era || 0) + newUnbondingAmount
      }
    }));

    setUnlockChunks(prev => [...prev, newChunk]);
    setNextChunkId(prev => prev + 1);
  };

  // Rebond functionality per updated RFC
  const rebondChunk = (chunkId, rebond_amount) => {
    setUnlockChunks(prev => {
      return prev.map(chunk => {
        if (chunk.id !== chunkId || chunk.status !== 'pending') return chunk;
        
        const actualRebond = Math.min(rebond_amount, chunk.unbonding_amount);
        const newAmount = chunk.unbonding_amount - actualRebond;
        
        // Update era data - subtract from total_unbond_in_era if within last 28 eras
        if (chunk.unbonding_start_era >= currentEra - (networkParams.BONDING_DURATION - 1)) {
          setEraData(prevEras => ({
            ...prevEras,
            [chunk.unbonding_start_era]: {
              ...prevEras[chunk.unbonding_start_era],
              total_unbond_in_era: Math.max(0, 
                (prevEras[chunk.unbonding_start_era]?.total_unbond_in_era || 0) - actualRebond
              )
            }
          }));
        }
        
        // Remove chunk if fully rebonded, otherwise reduce amount
        return newAmount <= 0 ? null : { ...chunk, unbonding_amount: newAmount };
      }).filter(Boolean);
    });
  };

  // Advance time by eras
  const advanceEras = (eras) => {
    const newEra = currentEra + eras;
    setCurrentEra(newEra);
    setTimeAdvanced(prev => prev + eras);
    
    // Update era data - shift window and add new eras
    setEraData(prev => {
      const newEraData = {};
      for (let i = 0; i < networkParams.BONDING_DURATION; i++) {
        const eraIndex = newEra - (networkParams.BONDING_DURATION - 1) + i;
        if (prev[eraIndex - eras]) {
          // Copy existing era data
          newEraData[eraIndex] = prev[eraIndex - eras];
        } else {
          // Create new era with default values
          newEraData[eraIndex] = {
            lowest_third_stake: lowestThirdRatio * totalStakedDOT,
            total_unbond_in_era: 0,
          };
        }
      }
      return newEraData;
    });
  };

  // Update era data when network parameters change
  useEffect(() => {
    setEraData(prev => {
      const updatedEras = {};
      Object.keys(prev).forEach(era => {
        updatedEras[era] = {
          ...prev[era],
          lowest_third_stake: lowestThirdRatio * totalStakedDOT
        };
      });
      return updatedEras;
    });
  }, [totalStakedDOT, lowestThirdRatio]);

  const formatAmount = (amount) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
    return amount.toString();
  };

  const formatEras = (eras) => {
    if (networkParams.name === 'Polkadot') {
      const days = eras; // ~1 era per day on Polkadot
      return `${eras} eras (~${days} days)`;
    } else {
      const days = eras / 4; // ~4 eras per day on Kusama
      return `${eras} eras (~${days.toFixed(1)} days)`;
    }
  };

  const currentMaxUnstake = getMaxUnstakeForEra(currentEra);
  const currentTotalUnbond = eraData[currentEra]?.total_unbond_in_era || 0;
  const utilizationPercent = (currentTotalUnbond / currentMaxUnstake) * 100;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          RFC-0097 Unbonding Queue: Era-Based Implementation
        </h1>
        <p className="text-gray-600 mb-4">
          Updated implementation with per-era tracking and withdrawal checks
        </p>
        
        {/* Network selector */}
        <div className="flex justify-center gap-4 mb-6">
          <button 
            onClick={() => setNetworkParams(prev => ({...prev, name: 'Polkadot', BONDING_DURATION: 28}))}
            className={`px-4 py-2 rounded ${networkParams.name === 'Polkadot' ? 'bg-pink-500 text-white' : 'bg-gray-200'}`}
          >
            Polkadot (28 eras)
          </button>
          <button 
            onClick={() => setNetworkParams(prev => ({...prev, name: 'Kusama', BONDING_DURATION: 7}))}
            className={`px-4 py-2 rounded ${networkParams.name === 'Kusama' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}
          >
            Kusama (7 eras)
          </button>
        </div>
      </div>

      {/* Era Status */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-sm text-purple-600 font-medium">Current Era</div>
          <div className="text-xl font-bold text-purple-900">{currentEra}</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-sm text-blue-600 font-medium">Era Capacity</div>
          <div className="text-xl font-bold text-blue-900">{formatAmount(currentMaxUnstake)} DOT</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-sm text-orange-600 font-medium">Era Utilization</div>
          <div className="text-xl font-bold text-orange-900">{utilizationPercent.toFixed(1)}%</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-sm text-green-600 font-medium">Active Chunks</div>
          <div className="text-xl font-bold text-green-900">{unlockChunks.filter(c => c.status === 'pending').length}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-sm text-red-600 font-medium">New Request Wait</div>
          <div className="text-xl font-bold text-red-900">{formatEras(estimateNewUnbondingTime(10000))}</div>
        </div>
      </div>

      {/* Network Configuration */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Network Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Staked DOT
            </label>
            <input
              type="number"
              value={totalStakedDOT}
              onChange={(e) => setTotalStakedDOT(Math.max(100_000_000, parseFloat(e.target.value) || 800_000_000))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="100000000"
              step="50000000"
            />
            <div className="mt-1 text-sm text-gray-500">
              Current: {formatAmount(totalStakedDOT)} DOT
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lowest Third Ratio
            </label>
            <input
              type="number"
              value={lowestThirdRatio}
              onChange={(e) => setLowestThirdRatio(Math.max(0.1, Math.min(0.5, parseFloat(e.target.value) || 0.287)))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0.1"
              max="0.5"
              step="0.01"
            />
            <div className="mt-1 text-sm text-gray-500">
              {(lowestThirdRatio * 100).toFixed(1)}% of total stake
            </div>
          </div>
        </div>
      </div>

      {/* Add Unbonding Request */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Create Unbonding Request</h2>
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
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Start Unbonding
          </button>
        </div>
        <div className="mt-3 p-3 bg-blue-50 rounded">
          <div className="text-sm text-blue-800">
            <strong>Estimated wait time:</strong> {formatEras(estimateNewUnbondingTime(newUnbondingAmount))}
          </div>
        </div>
      </div>

      {/* Era Management */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Era Management</h2>
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => advanceEras(1)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            +1 Era
          </button>
          <button
            onClick={() => advanceEras(7)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            +7 Eras
          </button>
          <button
            onClick={() => advanceEras(28)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            +28 Eras
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Time advanced: {timeAdvanced} eras since start
        </div>
      </div>

      {/* UnlockChunks */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Your UnlockChunks</h2>
        {unlockChunks.length === 0 ? (
          <p className="text-gray-500">No unbonding requests yet</p>
        ) : (
          <div className="space-y-3">
            {unlockChunks.map(chunk => {
              const withdrawCheck = canWithdraw(chunk);
              const estimatedWait = estimateUnbondingTime(chunk);
              
              return (
                <div key={chunk.id} className={`p-4 border rounded-lg ${
                  withdrawCheck.canWithdraw ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatAmount(chunk.unbonding_amount)} DOT</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          withdrawCheck.canWithdraw 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {withdrawCheck.canWithdraw ? 'Ready' : 'Pending'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Started in era {chunk.unbonding_start_era}
                      </div>
                      <div className="text-sm text-gray-600">
                        Previous unbonded: {formatAmount(chunk.previous_unbonded_stake_in_era)} DOT
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">
                        {withdrawCheck.canWithdraw ? (
                          <span className="text-green-600 font-medium">Can withdraw now</span>
                        ) : (
                          <>
                            <div>Wait: {formatEras(estimatedWait)}</div>
                            <div className="text-xs text-gray-500">{withdrawCheck.reason}</div>
                          </>
                        )}
                      </div>
                      {chunk.status === 'pending' && (
                        <button
                          onClick={() => rebondChunk(chunk.id, chunk.unbonding_amount)}
                          className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        >
                          Full Rebond
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Era Data Visualization */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Era Data Overview</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Era</th>
                <th className="text-left p-2">Lowest Third Stake</th>
                <th className="text-left p-2">Max Unstake</th>
                <th className="text-left p-2">Total Unbonding</th>
                <th className="text-left p-2">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(eraData)
                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                .slice(0, 10)
                .map(([era, data]) => {
                  const maxUnstake = getMaxUnstakeForEra(parseInt(era));
                  const utilization = (data.total_unbond_in_era / maxUnstake) * 100;
                  const isCurrent = parseInt(era) === currentEra;
                  
                  return (
                    <tr key={era} className={`border-b ${isCurrent ? 'bg-blue-50' : ''}`}>
                      <td className="p-2 font-medium">
                        {era} {isCurrent && '(current)'}
                      </td>
                      <td className="p-2">{formatAmount(data.lowest_third_stake)}</td>
                      <td className="p-2">{formatAmount(maxUnstake)}</td>
                      <td className="p-2">{formatAmount(data.total_unbond_in_era)}</td>
                      <td className="p-2">
                        <span className={`${utilization > 80 ? 'text-red-600' : utilization > 50 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {utilization.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Implementation Notes */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-yellow-900 mb-4">Updated RFC-0097 Implementation</h2>
        <ul className="space-y-2 text-yellow-800 text-sm">
          <li>• <strong>Era-based Storage:</strong> Tracks lowest_third_stake and total_unbond_in_era for last 28 eras</li>
          <li>• <strong>UnlockChunk Format:</strong> (amount, start_era, previous_unbonded_stake)</li>
          <li>• <strong>Withdrawal Check:</strong> Complex iteration through eras to verify thresholds</li>
          <li>• <strong>Rebonding:</strong> Updates total_unbond_in_era and removes/reduces chunks</li>
          <li>• <strong>Time Estimation:</strong> Based on era iteration algorithm from updated spec</li>
          <li>• <strong>Security:</strong> Never allows more than (1-MIN_SLASHABLE_SHARE) to unbond in 28 eras</li>
        </ul>
        
        <div className="mt-4 p-3 bg-yellow-100 rounded border-l-4 border-yellow-400">
          <h3 className="font-semibold text-yellow-900 mb-2">Key Changes from Original</h3>
          <p className="text-yellow-800 text-sm">
            This implementation reflects the updated RFC specification with era-based tracking 
            instead of the sequential queue model. The withdrawal logic now performs complex 
            threshold checks across multiple eras to ensure security guarantees.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EraBasedUnbondingSimulator;