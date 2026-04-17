/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PickerId = 1 | 2 | 3 | 4;

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
