/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PickerId = 1 | 2 | 3 | 4 | 'Packer';

export interface PickingRecord {
  id: string;
  orderNumber: string;
  pickerId: PickerId;
  startTime: number; // timestamp
  endTime: number; // timestamp
  duration: number; // milliseconds
  trackerId: string; // For future multi-tracker support
}

export interface ActiveTimer {
  orderNumber: string;
  pickerId: PickerId;
  startTime: number;
}

export interface O2COrder {
  id: string;
  orderNumber: string;
  idealOffsetSeconds: number; // Seconds from start of simulation
  status: 'PENDING' | 'ARRIVED' | 'ASSIGNING' | 'COMPLETED';
  assignStartTime?: number; // Timestamp
  assignEndTime?: number; // Timestamp
  o2cGapSeconds?: number; // Gap between arrival and trigger of assignment in seconds
  assignDurationSeconds?: number; // Duration of assigning in seconds
}

export interface O2CSimulation {
  id: string;
  startTime: number; // Timestamp
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  orders: O2COrder[];
}
