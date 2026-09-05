/**
 * Root component. Holds the one authoritative copy of the current .nettrace
 * map; every other component reads from it and reports changes back up.
 *
 * On launch it reopens the last map you saved or opened, so the app comes up
 * showing your network rather than an empty canvas. Failing that, it falls
 * back to the bundled sample map.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import Toolbar from './components/Toolbar';
import StatusBanner from './components/StatusBanner';
import TopologyCanvas from './components/TopologyCanvas';
import DeviceDetails from './components/DeviceDetails';
import { applyPositions, buildMapFromScan } from './lib/graph';
import { mergeScan, describeSummary } from './lib/diff';
import { bridge, bridgeAvailable, BRIDGE_UNAVAILABLE } from './lib/bridge';
import './styles/app.css';

// The sample map is committed as a real .nettrace file so it doubles as
// schema documentation; ?raw imports it verbatim and we parse it here.
import sampleMapRaw from '../saved-maps/sample.nettrace?raw';

const SAMPLE_MAP = JSON.parse(sampleMapRaw);
const EMPTY_SET = new Set();

export default function App() {
  const [map, setMap] = useState(SAMPLE_MAP);
  const [filePath, setFilePath] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [quickScan, setQuickScan] = useState(true);
  // Ids a rescan just discovered — badged on the canvas until the next action.
  const [newIds, setNewIds] = useState(EMPTY_SET);
  const [selectedId, setSelectedId] = useState(null);
  // Latest traceroute result, tagged with the device it belongs to so the
  // canvas can overlay it on the right edge.
  const [trace, setTrace] = useState(null);
  const [tracing, setTracing] = useState(false);
  const [traceError, setTraceError] = useState(null);
  const [notice, setNotice] = useState(
    bridgeAvailable ? null : { tone: 'error', text: BRIDGE_UNAVAILABLE },
  );

  useScanClock(scanning, setElapsed);

  /** Swap in a whole new map — from a scan, a load, or the auto-load. */
  const adoptMap = useCallback((nextMap, path, isDirty) => {
    setMap(nextMap);
    setFilePath(path);
    setDirty(isDirty);
    setNewIds(EMPTY_SET);
    // A trace describes a topology that no longer exists once the map changes.
    setSelectedId(null);
    setTrace(null);
    setTraceError(null);
  }, []);

  /**
   * Shared plumbing for Scan and Rescan: run scan.py, report failures, and
   * hand the result to `onResult`.
   */
  const withScan = useCallback(async (onResult) => {
    setScanning(true);
    setNotice(null);

    const result = await bridge.scan({ discoverOnly: quickScan });
    setScanning(false);

    if (!result.ok) {
      setNotice({ tone: 'error', text: result.error });
      return;
    }
    onResult(result.map);
  }, [quickScan]);

  // Reopen the last map on launch. Nothing stored (or the file has since been
  // moved) just leaves the sample map in place — not worth a warning.
  useEffect(() => {
    let cancelled = false;
    bridge.loadLastMap().then((result) => {
      if (!cancelled && result.ok) adoptMap(result.map, result.path, false);
    });
    return () => { cancelled = true; };
  }, [adoptMap]);

  // Persist dragged node positions into the map so a later save keeps them.
  // applyPositions returns the same map when nothing moved, which is how a
  // plain click on a node avoids marking the map dirty.
  const handlePositionsChange = useCallback((nodes) => {
    const next = applyPositions(map, nodes);
    if (next === map) return;
    setMap(next);
    setDirty(true);
  }, [map]);

  /** Scan from scratch: whatever's on the canvas is replaced. */
  const handleScan = useCallback(() => withScan((scan) => {
    // A fresh scan is unsaved work, but it keeps the current file as its
    // destination so Save doesn't re-prompt.
    adoptMap(buildMapFromScan(scan), filePath, true);
    setNotice(unprivilegedWarning(scan));
  }), [withScan, filePath, adoptMap]);

  /**
   * Rescan: merge into the existing map instead of replacing it, so layout,
   * labels and notes survive and departed devices go offline rather than
   * vanishing.
   */
  const handleRescan = useCallback(() => withScan((scan) => {
    const { map: merged, newIds: found, summary } = mergeScan(map, scan);

    setMap(merged);
    setDirty(true);
    setNewIds(found);
    setNotice(
      unprivilegedWarning(scan)
      ?? { tone: 'info', text: `Rescan: ${describeSummary(summary)}` },
    );
  }), [withScan, map]);

  const handleSave = useCallback(async (saveAs = false) => {
    const result = await bridge.saveMap(map, filePath, saveAs);
    if (result.cancelled) return;

    if (!result.ok) {
      setNotice({ tone: 'error', text: result.error });
      return;
    }
    setFilePath(result.path);
    setDirty(false);
  }, [map, filePath]);

  const handleLoad = useCallback(async () => {
    const result = await bridge.loadMap();
    if (result.cancelled) return;

    if (!result.ok) {
      setNotice({ tone: 'error', text: result.error });
      return;
    }
    adoptMap(result.map, result.path, false);
    setNotice(null);
  }, [adoptMap]);

  const handleTrace = useCallback(async (device) => {
    setTracing(true);
    setTraceError(null);

    const result = await bridge.traceroute(device.ip);
    setTracing(false);

    if (!result.ok) {
      setTraceError(result.error);
      setTrace(null);
      return;
    }
    setTrace({ ...result.trace, deviceId: device.id });
  }, []);

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    setTraceError(null);
  }, []);

  useShortcuts({ onSave: handleSave, onLoad: handleLoad });

  const selectedDevice = findDevice(map, selectedId);

  return (
    <div className="app">
      <Toolbar
        map={map}
        filePath={filePath}
        dirty={dirty}
        scanning={scanning}
        elapsed={elapsed}
        quickScan={quickScan}
        onQuickScanChange={setQuickScan}
        onScan={handleScan}
        onRescan={handleRescan}
        onSave={handleSave}
        onLoad={handleLoad}
      />

      <StatusBanner tone={notice?.tone} onDismiss={() => setNotice(null)}>
        {notice?.text}
      </StatusBanner>

      <main className="canvas-area">
        <TopologyCanvas
          map={map}
          newIds={newIds}
          selectedId={selectedId}
          trace={trace}
          onSelect={handleSelect}
          onPositionsChange={handlePositionsChange}
        />

        <DeviceDetails
          device={selectedDevice}
          trace={trace}
          tracing={tracing}
          traceError={traceError}
          onTrace={handleTrace}
          onClose={() => handleSelect(null)}
        />
      </main>
    </div>
  );
}

/** Look up a device (or the router) by id. */
function findDevice(map, id) {
  if (!id) return null;
  if (map.router?.id === id) return map.router;
  return map.devices.find((device) => device.id === id) ?? null;
}

/**
 * nmap can only ARP as root. Without it a scan finds just the few hosts that
 * answer a TCP ping and reports no MAC addresses — and MAC is what identifies
 * a device across rescans, so this is worth saying loudly rather than letting
 * the user wonder where their devices went.
 */
function unprivilegedWarning(scan) {
  if (scan.privileged) return null;
  return {
    tone: 'warn',
    text: 'Scanned without root, so this is only partial: nmap can\'t send ARP '
      + 'requests, which means no MAC addresses and only hosts that answer a '
      + 'TCP ping. Relaunch nTracer with sudo for a full picture.',
  };
}

/** Ticks a seconds counter while a scan is in flight, so the UI isn't frozen. */
function useScanClock(scanning, setElapsed) {
  const startedAt = useRef(0);

  useEffect(() => {
    if (!scanning) return undefined;

    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [scanning, setElapsed]);
}

/** Cmd/Ctrl+S to save, Cmd/Ctrl+Shift+S to save as, Cmd/Ctrl+O to open. */
function useShortcuts({ onSave, onLoad }) {
  useEffect(() => {
    const handler = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        onSave(event.shiftKey);
      } else if (key === 'o') {
        event.preventDefault();
        onLoad();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, onLoad]);
}
