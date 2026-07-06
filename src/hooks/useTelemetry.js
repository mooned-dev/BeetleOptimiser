// Subscribes to live CPU/RAM/NET/GPU/SSD/HDD stats pushed from main.js's
// telemetry.ps1 process. Falls back to zeros with no subscription in dev
// browser preview, where window.beetleAPI doesn't exist.
import { useEffect, useState } from 'react';

const DEFAULT_TELEMETRY = {
  cpu: 0, ram: 0, net: 0, gpu: 0, ssd: 0, hdd: 0,
  freeGB: null, driveHealth: null, securityStatus: null,
  topProcessName: null, topProcessPct: null,
};

export function useTelemetry() {
  const [telemetry, setTelemetry] = useState(DEFAULT_TELEMETRY);

  useEffect(() => {
    const onTelemetry = window?.beetleAPI?.system?.onTelemetry;
    if (!onTelemetry) return;
    return onTelemetry((data) => setTelemetry((t) => ({ ...t, ...data })));
  }, []);

  return telemetry;
}
