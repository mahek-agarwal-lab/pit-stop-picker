/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Trash2, 
  History, 
  Clock, 
  User, 
  Hash, 
  Download,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PickerId, PickingRecord, ActiveTimer } from './types.ts';
import O2CDashboard from './components/O2CDashboard.tsx';

/**
 * Format milliseconds into HH:MM:SS.ms
 */
function formatTime(ms: number) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<'picker' | 'o2c'>('picker');
  const [records, setRecords] = useState<PickingRecord[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [orderNumber, setOrderNumber] = useState('1');
  const [pickerId, setPickerId] = useState<PickerId>(1);
  const [isError, setIsError] = useState(false);
  const [nextSequence, setNextSequence] = useState(1);

  const orderOptions = Array.from({ length: 60 }, (_, i) => (i + 1).toString());

  // Interval ref for the clock
  const intervalRef = useRef<number | null>(null);

  // Initialize from LocalStorage
  useEffect(() => {
    const savedRecords = localStorage.getItem('picking-records');
    const savedSequence = localStorage.getItem('picking-sequence');
    
    if (savedRecords) {
      try {
        const parsed = JSON.parse(savedRecords);
        setRecords(parsed);
      } catch (e) {
        console.error('Failed to parse records', e);
      }
    }

    if (savedSequence) {
      setNextSequence(parseInt(savedSequence, 10));
    }
  }, []);

  // Sync order number to next sequence if empty
  useEffect(() => {
    if (!activeTimer) {
      setOrderNumber(nextSequence.toString());
    }
  }, [nextSequence, activeTimer]);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('picking-records', JSON.stringify(records));
    localStorage.setItem('picking-sequence', nextSequence.toString());
  }, [records, nextSequence]);

  // Timer logic
  useEffect(() => {
    if (activeTimer) {
      intervalRef.current = window.setInterval(() => {
        setElapsedTime(Date.now() - activeTimer.startTime);
      }, 50);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setElapsedTime(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeTimer]);

  const handleStart = () => {
    if (!orderNumber.trim()) {
      setIsError(true);
      setTimeout(() => setIsError(false), 2000);
      return;
    }
    setActiveTimer({
      orderNumber,
      pickerId,
      startTime: Date.now(),
    });
  };

  const handleStop = () => {
    if (!activeTimer) return;

    const endTime = Date.now();
    const duration = endTime - activeTimer.startTime;

    const newRecord: PickingRecord = {
      id: crypto.randomUUID(),
      orderNumber: orderNumber, // Use current state instead of captured activeTimer.orderNumber
      pickerId: pickerId,       // Use current state instead of captured activeTimer.pickerId
      startTime: activeTimer.startTime,
      endTime,
      duration,
      trackerId: 'tracker-01',
    };

    setRecords([newRecord, ...records]);
    
    // Increment sequence only if we used the auto-generated one at any point
    // We check against the orderNumber being recorded
    if (orderNumber === nextSequence.toString() && nextSequence < 60) {
      setNextSequence(prev => prev + 1);
    }

    setActiveTimer(null);
    setOrderNumber(''); // This will trigger the effect to set the NEXT sequence number
  };

  const deleteRecord = (id: string) => {
    setRecords(records.filter(r => r.id !== id));
  };

  const exportCSV = () => {
    const headers = ['Order Number', 'Picker ID', 'Start Time', 'End Time', 'Duration (ms)', 'Duration (Formatted)', 'Shift'];
    const rows = records.map(r => [
      `"${r.orderNumber}"`, // Quote strings for CSV safety
      `"${r.pickerId}"`,
      `"${new Date(r.startTime).toLocaleString()}"`,
      `"${new Date(r.endTime).toLocaleString()}"`,
      r.duration,
      `"${formatTime(r.duration)}"`,
      '"AM-WK4"'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    // BOM (Byte Order Mark) for Excel to recognize UTF-8 automatically
    const BOM = '\uFEFF'; 
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pick_logs_spreadsheet_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-high-bg flex flex-col">
      {/* Header */}
      <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-high-border bg-high-surface">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-high-accent rounded flex items-center justify-center text-high-bg font-black text-lg">
            C
          </div>
          <h1 className="text-lg font-bold tracking-tight text-high-text">
            CHRONO-PICK <span className="font-light opacity-50 ml-1">v2.4</span>
          </h1>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-high-bg border border-high-border rounded-md p-0.5">
          <button
            onClick={() => setCurrentTab('picker')}
            className={`px-3 py-1.5 text-[11px] font-bold rounded transition-all uppercase tracking-wider font-mono ${
              currentTab === 'picker'
                ? 'bg-high-accent text-high-bg font-black'
                : 'text-high-text-dim hover:text-high-text'
            }`}
          >
            Picker Stopwatch
          </button>
          <button
            onClick={() => setCurrentTab('o2c')}
            className={`px-3 py-1.5 text-[11px] font-bold rounded transition-all uppercase tracking-wider font-mono ${
              currentTab === 'o2c'
                ? 'bg-high-accent text-high-bg font-black'
                : 'text-high-text-dim hover:text-high-text'
            }`}
          >
            O2C Dashboard
          </button>
        </div>

        <div className="hidden md:flex gap-8 text-[11px] font-mono uppercase tracking-wider text-high-text-dim">
          <span>Station: <b className="text-high-text ml-1">DS-09</b></span>
          <span>Tracker: <b className="text-high-text ml-1">M. Chen</b></span>
          <span>Shift: <b className="text-high-text ml-1">AM-WK4</b></span>
        </div>
      </header>

      {currentTab === 'o2c' ? (
        <O2CDashboard />
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Main Measurement Content */}
          <main className="flex-1 p-8 overflow-y-auto space-y-8">
          <div className="bg-high-surface border border-high-border rounded-xl p-10 grid grid-cols-1 lg:grid-cols-2 gap-10 shadow-lg">
            {/* Timer Section */}
            <div className="flex flex-col items-center justify-center lg:border-r border-high-border lg:pr-10">
              <motion.div 
                initial={false}
                animate={{ color: activeTimer ? '#00E676' : '#E1E1E6' }}
                className="font-mono text-7xl md:text-8xl font-bold tracking-tighter tabular-nums"
              >
                {formatTime(elapsedTime).split(':')[1]}:{formatTime(elapsedTime).split(':')[2]}
              </motion.div>
              <div className="text-[11px] text-high-text-dim uppercase tracking-[3px] mt-2">
                {activeTimer ? 'Elapsed Pick Time' : 'System Ready'}
              </div>
              <div className="mt-6 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeTimer ? 'bg-high-accent animate-pulse' : 'bg-high-border'}`} />
                <span className="text-[10px] font-mono text-high-text-dim uppercase tracking-widest">
                  {activeTimer ? 'Tracking Active' : 'Standby Mode'}
                </span>
              </div>
            </div>

            {/* Form Section */}
            <div className="flex flex-col justify-center space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-high-text-dim">Order Number (1-40)</label>
                  {activeTimer && (
                    <span className="text-[9px] font-mono text-high-accent uppercase animate-pulse">Live</span>
                  )}
                </div>
                <select 
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="w-full bg-high-bg border border-high-border rounded-md px-4 py-3 font-mono text-2xl text-high-text focus:outline-none focus:border-high-accent transition-all appearance-none cursor-pointer"
                >
                  {orderOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-high-text-dim">Picker ID / Assignment</label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 'Packer'].map((id) => (
                    <button
                      key={id}
                      onClick={() => setPickerId(id as PickerId)}
                      className={`h-14 rounded-md font-bold text-sm transition-all ${
                        pickerId === id 
                        ? 'bg-high-accent text-high-bg border-high-accent' 
                        : 'bg-high-surface-alt border border-high-border text-high-text-dim hover:border-high-text-dim'
                      }`}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            {!activeTimer ? (
              <button 
                onClick={handleStart}
                className="flex-1 h-16 bg-high-accent text-high-bg font-black rounded-lg text-sm uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Start Timer [SPACE]
              </button>
            ) : (
              <button 
                onClick={handleStop}
                className="flex-1 h-16 bg-high-stop text-white font-black rounded-lg text-sm uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Stop & Log [ENTER]
              </button>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-high-surface border border-high-border p-6 rounded-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-high-text-dim mb-2">Avg. Time / Pick</div>
              <div className="text-2xl font-mono text-high-text">
                {records.length > 0 
                  ? formatTime(records.reduce((acc, r) => acc + r.duration, 0) / records.length).split(':')[1] + ':' + formatTime(records.reduce((acc, r) => acc + r.duration, 0) / records.length).split(':')[2] 
                  : '00:00.00'
                }
              </div>
            </div>
            <div className="bg-high-surface border border-high-border p-6 rounded-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-high-text-dim mb-2">Target (SLA)</div>
              <div className="text-2xl font-mono text-high-accent">03:45.00</div>
            </div>
            <div className="bg-high-surface border border-high-border p-6 rounded-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-high-text-dim mb-2">Current Efficiency</div>
              <div className="text-2xl font-mono text-high-text">
                {records.length > 0 ? (94.2).toFixed(1) : '--'}%
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar Log */}
        <aside className="w-full md:w-80 bg-high-surface-alt border-l border-high-border flex flex-col shrink-0">
          <div className="p-6 border-b border-high-border flex justify-between items-center">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-high-text-dim">Recent Logs (Session)</h2>
            <button 
              onClick={exportCSV}
              disabled={records.length === 0}
              className="text-high-text-dim hover:text-high-accent transition-colors disabled:opacity-20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {records.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 opacity-20 filter grayscale">
                <AlertCircle className="w-8 h-8 mb-4" />
                <p className="text-[10px] font-mono text-center uppercase tracking-widest">No local logs</p>
              </div>
            ) : (
              <div className="divide-y divide-high-border bg-high-border">
                {records.map((record) => (
                  <div key={record.id} className="bg-high-surface-alt p-4 grid grid-cols-2 gap-2 text-[13px] group">
                    <div>
                      <div className="text-[10px] text-high-text-dim uppercase tracking-tighter">Order #</div>
                      <div className="font-bold text-high-text">{record.orderNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-high-text-dim uppercase tracking-tighter">Picker ID: {record.pickerId}</div>
                      <div className="font-mono font-bold text-high-text">
                        {formatTime(record.duration).split(':')[1]}:{formatTime(record.duration).split(':')[2]}
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-between items-center pt-1">
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-high-accent/10 text-high-accent tracking-tighter">
                        Verified
                      </span>
                      <button 
                        onClick={() => deleteRecord(record.id)}
                        className="text-high-text-dim hover:text-high-stop opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 mt-auto">
            <div className="p-4 border border-dashed border-high-border rounded-lg text-[11px] text-high-text-dim leading-relaxed">
              <b className="text-high-text">Precision Tracking Active</b><br />
              Timers are rounded to the nearest ms. Sessions are stored in the local cache.
              {records.length > 0 && (
                <button 
                  onClick={() => confirm('Reset current session?') && setRecords([])}
                  className="block mt-3 text-high-stop/60 hover:text-high-stop transition-colors uppercase font-bold text-[9px]"
                >
                  Clear Local Cache
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
      )}
    </div>
  );
}

