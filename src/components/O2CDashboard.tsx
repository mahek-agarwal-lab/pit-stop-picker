import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Clock, 
  TrendingUp, 
  CheckCircle,
  AlertTriangle,
  PlayCircle,
  StopCircle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { O2COrder, O2CSimulation } from '../types';

// Format dynamic time to MM:SS or HH:MM:SS
function formatDuration(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper to format absolute timestamps smoothly
function formatTimeString(timestamp: number) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export default function O2CDashboard() {
  const [sim, setSim] = useState<O2CSimulation | null>(() => {
    const saved = localStorage.getItem('o2c-simulation');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse O2C simulation', e);
      }
    }
    return null;
  });

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Generate 120 orders spaced out over 60 minutes
  const initSimulation = () => {
    const duration = 3600; // 60 minutes
    const orderCount = 120;
    
    // Generate exactly 120 randomized uniform timestamps (Poisson process conditioned on N=120)
    const offsets: number[] = [];
    for (let i = 0; i < orderCount; i++) {
      offsets.push(Math.random() * duration);
    }
    offsets.sort((a, b) => a - b);

    const now = Date.now();
    const orders: O2COrder[] = offsets.map((offset, idx) => {
      const orderNum = `#O2C-${(idx + 1).toString().padStart(3, '0')}`;
      return {
        id: crypto.randomUUID(),
        orderNumber: orderNum,
        idealOffsetSeconds: Math.round(offset),
        status: 'PENDING'
      };
    });

    const newSim: O2CSimulation = {
      id: crypto.randomUUID(),
      startTime: now,
      status: 'IDLE',
      orders
    };

    setSim(newSim);
    setElapsed(0);
    localStorage.setItem('o2c-simulation', JSON.stringify(newSim));
  };

  // Automatically load or initialize simulation structure
  useEffect(() => {
    if (!sim) {
      initSimulation();
    } else {
      // Re-calculate elapsed if running or paused
      if (sim.status === 'RUNNING') {
        const diff = Math.floor((Date.now() - sim.startTime) / 1000);
        setElapsed(diff >= 3600 ? 3600 : diff);
      } else if (sim.status === 'PAUSED' || sim.status === 'COMPLETED') {
        // Find maximum stop or use rough elapsed logic (we will structure elapsed inside sim)
        // Let's compute based on current states
        let lastAction = 0;
        sim.orders.forEach(o => {
          if (o.assignEndTime && sim.startTime) {
            lastAction = Math.max(lastAction, Math.floor((o.assignEndTime - sim.startTime) / 1000));
          }
        });
        setElapsed(lastAction || 0);
      }
    }
  }, []);

  // Sync to LocalStorage on updates
  useEffect(() => {
    if (sim) {
      localStorage.setItem('o2c-simulation', JSON.stringify(sim));
    }
  }, [sim]);

  // Main system loop (1 second interval) strictly at 1x speed
  useEffect(() => {
    if (sim && sim.status === 'RUNNING') {
      timerRef.current = window.setInterval(() => {
        const computedElapsed = Math.floor((Date.now() - sim.startTime) / 1000);
        
        if (computedElapsed >= 3600) {
          // Simulation finished
          setElapsed(3600);
          setSim(prev => {
            if (!prev) return null;
            return {
              ...prev,
              status: 'COMPLETED'
            };
          });
          if (timerRef.current) clearInterval(timerRef.current);
        } else {
          setElapsed(computedElapsed);
          // Sync order statuses that just transition from PENDING to ARRIVED
          setSim(prev => {
            if (!prev) return null;
            const updatedOrders = prev.orders.map(o => {
              if (o.status === 'PENDING' && o.idealOffsetSeconds <= computedElapsed) {
                return { ...o, status: 'ARRIVED' as const };
              }
              return o;
            });
            return { ...prev, orders: updatedOrders };
          });
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sim?.status, sim?.startTime]);

  const startSim = () => {
    if (!sim) return;
    
    // If resuming from PAUSED
    const now = Date.now();
    let currentStartTime = now;
    if (sim.status === 'PAUSED') {
      currentStartTime = now - (elapsed * 1000);
    }

    setSim(prev => {
      if (!prev) return null;
      return {
        ...prev,
        startTime: currentStartTime,
        status: 'RUNNING',
        orders: prev.orders.map(o => {
          // Sync the current real ARRIVED states based on elapsed
          if (o.status === 'PENDING' && o.idealOffsetSeconds <= elapsed) {
            return { ...o, status: 'ARRIVED' };
          }
          return o;
        })
      };
    });
  };

  const pauseSim = () => {
    setSim(prev => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'PAUSED'
      };
    });
  };

  const resetSim = () => {
    if (window.confirm('This will wipe out current session data and start a new 120-order simulation. Proceed?')) {
      initSimulation();
    }
  };

  // Distributor actions
  const startAssigning = (orderId: string) => {
    if (!sim || sim.status !== 'RUNNING') return;
    
    const now = Date.now();
    setSim(prev => {
      if (!prev) return null;
      return {
        ...prev,
        orders: prev.orders.map(o => {
          if (o.id === orderId) {
            const idealTime = prev.startTime + (o.idealOffsetSeconds * 1000);
            const gap = Math.max(0, Math.round((now - idealTime) / 1000));
            return {
              ...o,
              status: 'ASSIGNING',
              assignStartTime: now,
              o2cGapSeconds: gap
            };
          }
          return o;
        })
      };
    });
  };

  const stopAssigning = (orderId: string) => {
    if (!sim || sim.status !== 'RUNNING') return;
    
    const now = Date.now();
    setSim(prev => {
      if (!prev) return null;
      return {
        ...prev,
        orders: prev.orders.map(o => {
          if (o.id === orderId && o.assignStartTime) {
            const duration = Math.max(0, Math.round((now - o.assignStartTime) / 1000));
            return {
              ...o,
              status: 'COMPLETED',
              assignEndTime: now,
              assignDurationSeconds: duration
            };
          }
          return o;
        })
      };
    });
  };

  // Helper stats calculation
  const getStats = () => {
    if (!sim) return { total: 120, pending: 120, arrived: 0, assigning: 0, completed: 0, avgGap: 0, avgAssignTime: 0 };
    const total = sim.orders.length;
    let pending = 0;
    let arrived = 0;
    let assigning = 0;
    let completed = 0;
    let totalGap = 0;
    let totalAssignTime = 0;
    let gapCount = 0;
    let assignCount = 0;

    sim.orders.forEach(o => {
      if (o.status === 'PENDING') pending++;
      else if (o.status === 'ARRIVED') arrived++;
      else if (o.status === 'ASSIGNING') assigning++;
      else if (o.status === 'COMPLETED') completed++;

      if (o.o2cGapSeconds !== undefined) {
        totalGap += o.o2cGapSeconds;
        gapCount++;
      }
      if (o.assignDurationSeconds !== undefined) {
        totalAssignTime += o.assignDurationSeconds;
        assignCount++;
      }
    });

    return {
      total,
      pending,
      arrived,
      assigning,
      completed,
      avgGap: gapCount > 0 ? (totalGap / gapCount).toFixed(1) : '0.0',
      avgAssignTime: assignCount > 0 ? (totalAssignTime / assignCount).toFixed(1) : '0.0'
    };
  };

  const stats = getStats();

  const exportSimulationData = () => {
    if (!sim) return;
    const headers = [
      'Order Number', 
      'Ideal Offset (Simulation Relative)', 
      'Ideal Wall Clock Time', 
      'Actual Assignment Triggered', 
      'Actual Assignment Completed', 
      'O2C Latency Gap (Seconds)', 
      'Assignment Duration (Seconds)', 
      'Status'
    ];

    const rows = sim.orders.map(o => {
      const idealWallClock = sim.startTime ? new Date(sim.startTime + (o.idealOffsetSeconds * 1000)).toLocaleString() : 'N/A';
      const actualStart = o.assignStartTime ? new Date(o.assignStartTime).toLocaleString() : 'N/A';
      const actualEnd = o.assignEndTime ? new Date(o.assignEndTime).toLocaleString() : 'N/A';
      
      return [
        `"${o.orderNumber}"`,
        `"${formatDuration(o.idealOffsetSeconds)}"`,
        `"${idealWallClock}"`,
        `"${actualStart}"`,
        `"${actualEnd}"`,
        o.o2cGapSeconds ?? 'N/A',
        o.assignDurationSeconds ?? 'N/A',
        `"${o.status}"`
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const BOM = '\uFEFF'; 
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `o2c_simulation_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Simulation Master Header Panel */}
      <div className="bg-high-surface border border-high-border rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-high-surface-alt border border-high-border rounded-lg text-high-accent">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-high-text tracking-tight flex items-center gap-2">
              O2C Real-Time Simulation
              <span className="text-[11px] font-mono px-2 py-0.5 bg-high-accent/10 border border-high-accent/30 text-high-accent rounded">
                1x Speed
              </span>
            </h2>
            <p className="text-xs text-high-text-dim max-w-lg mt-0.5">
              Ideal order inflow modeled under a randomised Poisson distribution (Average 2 orders/min). Total 120 orders over 60 minutes.
            </p>
          </div>
        </div>

        {/* Master Timer Box on Top Right */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-widest text-high-text-dim font-bold">Elapsed / Total Time</div>
            <div className="font-mono text-3xl font-bold tracking-tight text-high-text select-none">
              {formatDuration(elapsed)} <span className="text-high-text-dim text-lg">/ 60:00</span>
            </div>
            {sim && (
              <div className="text-[9px] font-mono text-high-accent uppercase flex items-center justify-end gap-1 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${sim.status === 'RUNNING' ? 'bg-high-accent animate-ping' : 'bg-high-text-dim'}`} />
                Status: {sim.status}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {sim?.status !== 'RUNNING' ? (
              <button
                onClick={startSim}
                className="px-4 py-2 bg-high-accent hover:brightness-110 text-high-bg font-black rounded-md text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5" /> Start
              </button>
            ) : (
              <button
                onClick={pauseSim}
                className="px-4 py-2 bg-amber-500 hover:brightness-110 text-high-bg font-black rounded-md text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all"
              >
                <Pause className="w-3.5 h-3.5" /> Pause
              </button>
            )}

            <button
              onClick={resetSim}
              className="px-3 py-2 bg-high-surface-alt border border-high-border text-high-text hover:text-white rounded-md text-xs uppercase tracking-wider flex items-center gap-1 shadow-sm transition-all"
              title="Reset Simulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-high-surface border border-high-border p-4 rounded-xl shadow-md">
          <div className="text-[10px] font-mono uppercase text-high-text-dim tracking-wider">Completed / Pipeline</div>
          <div className="text-2xl font-bold font-mono text-high-text mt-1">
            {stats.completed} <span className="text-xs text-high-text-dim">/ {stats.total} Orders</span>
          </div>
          <div className="w-full bg-high-bg h-1 rounded-full overflow-hidden mt-3">
            <div 
              className="bg-high-accent h-full transition-all duration-300" 
              style={{ width: `${(stats.completed / stats.total) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-high-surface border border-high-border p-4 rounded-xl shadow-md">
          <div className="text-[10px] font-mono uppercase text-high-text-dim tracking-wider">Arrived Unassigned</div>
          <div className={`text-2xl font-bold font-mono mt-1 ${stats.arrived > 0 ? 'text-amber-400' : 'text-high-text'}`}>
            {stats.arrived} <span className="text-xs text-high-text-dim">Active Queue</span>
          </div>
          <div className="text-[10px] text-high-text-dim mt-2.5">Needs action from distributor</div>
        </div>

        <div className="bg-high-surface border border-high-border p-4 rounded-xl shadow-md">
          <div className="text-[10px] font-mono uppercase text-high-text-dim tracking-wider">Avg O2C Delay Gap</div>
          <div className="text-2xl font-bold font-mono text-high-accent mt-1">
            +{stats.avgGap}s
          </div>
          <div className="text-[10px] text-high-text-dim mt-2.5">Goal is 0s perfect assignment</div>
        </div>

        <div className="bg-high-surface border border-high-border p-4 rounded-xl shadow-md">
          <div className="text-[10px] font-mono uppercase text-high-text-dim tracking-wider">Avg Assign Action Time</div>
          <div className="text-2xl font-bold font-mono text-high-text mt-1">
            {stats.avgAssignTime}s
          </div>
          <div className="text-[10px] text-high-text-dim mt-2.5">Time to click stop assigning</div>
        </div>
      </div>

      {/* Main interactive grid and records section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
        
        {/* Left 2 columns: Incoming Flow Pipeline */}
        <div className="lg:col-span-2 bg-high-surface border border-high-border rounded-xl p-5 flex flex-col h-[500px]">
          <div className="flex items-center justify-between pb-3 border-b border-high-border shrink-0">
            <h3 className="text-sm font-bold uppercase tracking-wider text-high-text flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-high-accent" />
              Real-Time Order Arrival Pipeline
            </h3>
            
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-high-text-dim font-mono">
                Incoming: <b className="text-high-text">{stats.pending}</b> | Assigning: <b className="text-blue-400">{stats.assigning}</b>
              </span>
              <button
                onClick={exportSimulationData}
                disabled={stats.completed === 0}
                className="px-2.5 py-1.5 bg-high-surface-alt hover:brightness-110 text-[11px] font-mono uppercase text-high-text rounded border border-high-border flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-3 h-3" /> Export Excel/Sheets
              </button>
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 py-3 px-3 border-b border-high-border text-[10px] font-mono uppercase text-high-text-dim bg-high-bg/30 shrink-0">
            <div className="col-span-2">Order ID</div>
            <div className="col-span-2 text-right">Ideal Inflow</div>
            <div className="col-span-3 text-right">Ideal Wall Clock</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-3 text-right">Interaction Action</div>
          </div>

          {/* Orders list scroll area */}
          <div className="flex-1 overflow-y-auto divide-y divide-high-border/50">
            {sim && sim.orders.map((o) => {
              const arrived = o.idealOffsetSeconds <= elapsed;
              const clockTime = sim.startTime ? formatTimeString(sim.startTime + (o.idealOffsetSeconds * 1000)) : 'N/A';

              return (
                <div 
                  key={o.id} 
                  className={`grid grid-cols-12 gap-2 items-center py-2.5 px-3 transition-colors ${
                    o.status === 'ARRIVED' ? 'bg-amber-500/5' : 
                    o.status === 'ASSIGNING' ? 'bg-blue-500/5 animate-pulse' : 
                    o.status === 'COMPLETED' ? 'opacity-60 bg-high-bg/10' : ''
                  }`}
                >
                  {/* Order Selector Code */}
                  <div className="col-span-2 font-mono text-xs font-bold text-high-text">
                    {o.orderNumber}
                  </div>

                  {/* Offset Time */}
                  <div className="col-span-2 text-right font-mono text-xs text-high-text-dim">
                    {formatDuration(o.idealOffsetSeconds)}
                  </div>

                  {/* Actual expected wall clock */}
                  <div className="col-span-3 text-right font-mono text-[11px] text-high-text-dim">
                    {clockTime}
                  </div>

                  {/* Simulated Tag */}
                  <div className="col-span-2 text-center">
                    {o.status === 'PENDING' && (
                      <span className="inline-block text-[9px] font-mono uppercase px-1.5 py-0.5 bg-high-bg border border-high-border text-high-text-dim rounded">
                        Wait -{formatDuration(o.idealOffsetSeconds - elapsed)}
                      </span>
                    )}
                    {o.status === 'ARRIVED' && (
                      <span className="inline-block text-[9px] font-mono uppercase px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-500 rounded animate-pulse">
                        ARRIVED &middot; +{elapsed - o.idealOffsetSeconds}s
                      </span>
                    )}
                    {o.status === 'ASSIGNING' && (
                      <span className="inline-block text-[9px] font-mono uppercase px-1.5 py-0.5 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded">
                        ASSIGNING
                      </span>
                    )}
                    {o.status === 'COMPLETED' && (
                      <span className="inline-block text-[9px] font-mono uppercase px-1.5 py-0.5 bg-high-accent/15 border border-high-accent/30 text-high-accent rounded">
                        COMPLETE
                      </span>
                    )}
                  </div>

                  {/* Interactive Button */}
                  <div className="col-span-3 text-right">
                    {sim.status !== 'RUNNING' ? (
                      <span className="text-[10px] text-high-text-dim font-mono italic">Play to Assign</span>
                    ) : (
                      <>
                        {o.status === 'PENDING' && (
                          <span className="text-[11px] font-mono text-high-text-dim">Standby</span>
                        )}
                        {o.status === 'ARRIVED' && (
                          <button
                            onClick={() => startAssigning(o.id)}
                            className="px-2 py-1 bg-amber-500 text-high-bg font-bold rounded text-[10px] uppercase tracking-wider hover:brightness-110 active:scale-[0.95] transition-all flex items-center gap-1 ml-auto"
                          >
                            <PlayCircle className="w-3 h-3" /> Start Assigning
                          </button>
                        )}
                        {o.status === 'ASSIGNING' && (
                          <button
                            onClick={() => stopAssigning(o.id)}
                            className="px-2 py-1 bg-high-accent text-high-bg font-bold rounded text-[10px] uppercase tracking-wider hover:brightness-110 active:scale-[0.95] transition-all flex items-center gap-1 ml-auto animate-pulse"
                          >
                            <StopCircle className="w-3 h-3" /> Stop &amp; Log
                          </button>
                        )}
                        {o.status === 'COMPLETED' && (
                          <span className="text-[10px] font-mono text-high-accent font-bold">
                            Gap: {o.o2cGapSeconds}s / Dur: {o.assignDurationSeconds}s
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 column: O2C Analytics/History Sidecar */}
        <div className="bg-high-surface border border-high-border rounded-xl p-5 flex flex-col h-[500px]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-high-text flex items-center gap-2 pb-3 border-b border-high-border shrink-0">
            <CheckCircle className="w-4 h-4 text-high-accent" />
            Distributor Activity Log Only
          </h3>

          <div className="flex-1 overflow-y-auto mt-2 space-y-2.5 pr-1">
            {sim && sim.orders.filter(o => o.status === 'COMPLETED').length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-high-text-dim space-y-2">
                <Info className="w-8 h-8 opacity-40 text-high-accent" />
                <p className="text-xs font-medium">Logged order assignments will appear here live once saved.</p>
              </div>
            ) : (
              sim?.orders.filter(o => o.status === 'COMPLETED').reverse().map(o => (
                <div key={o.id} className="bg-high-surface-alt border border-high-border rounded-lg p-3 space-y-2 relative group hover:border-high-accent/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-high-text">{o.orderNumber}</span>
                    <span className="text-[10px] font-mono text-high-accent uppercase px-1.5 py-0.5 bg-high-accent/10 rounded">
                      Assigned
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-high-text-dim">
                    <div>
                      Arrival: <b className="text-high-text">{formatDuration(o.idealOffsetSeconds)}</b>
                    </div>
                    <div>
                      O2C Latency: <b className={`text-high-text ${Number(o.o2cGapSeconds) > 10 ? 'text-amber-500' : 'text-high-accent'}`}>+{o.o2cGapSeconds}s</b>
                    </div>
                    <div className="col-span-2">
                      Assigning Phase: <b className="text-high-text">{o.assignDurationSeconds}s (Duration)</b>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
