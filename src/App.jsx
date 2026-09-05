/**
 * Root component. Holds the one authoritative copy of the current .nettrace
 * map; every other component reads from it and reports changes back up.
 *
 * Starts on a hardcoded sample map so there's something to look at before the
 * first scan. Milestone 4 replaces that with the last file the user opened.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import Toolbar from './components/Toolbar';
import StatusBanner from './components/StatusBanner';
import TopologyCanvas from './components/TopologyCanvas';
import { applyPositions, buildMapFromScan } from './lib/graph';
import './styles/app.css';

// The sample map is committed as a real .nettrace file so it doubles as
// schema documentation; ?raw imports it verbatim and we parse it here.
import sampleMapRaw from '../saved-maps/sample.nettrace?raw';

const SAMPLE_MAP = JSON.parse(sampleMapRaw);

export default function App() {
  const [map, setMap] = useState(SAMPLE_MAP);
  const [scanning, setScanning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [quickScan, setQuickScan] = useState(true);
  const [notice, setNotice] = useState(null);   // { tone, text }

  useScanClock(scanning, setElapsed);

  // Persist dragged node positions into the map so a later save keeps them.
  const handlePositionsChange = useCallback((nodes) => {
    setMap((current) => applyPositions(current, nodes));
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setNotice(null);

    const result = await window.ntracer.scan({ discoverOnly: quickScan });
    setScanning(false);

    if (!result.ok) {
      setNotice({ tone: 'error', text: result.error });
      return;
    }

    setMap(buildMapFromScan(result.map));
    setNotice(unprivilegedWarning(result.map));
  }, [quickScan]);

  return (
    <div className="app">
      <Toolbar
        map={map}
        scanning={scanning}
        elapsed={elapsed}
        quickScan={quickScan}
        onQuickScanChange={setQuickScan}
        onScan={handleScan}
      />

      <StatusBanner tone={notice?.tone} onDismiss={() => setNotice(null)}>
        {notice?.text}
      </StatusBanner>

      <main className="canvas-area">
        <TopologyCanvas map={map} onPositionsChange={handlePositionsChange} />
      </main>
    </div>
  );
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
