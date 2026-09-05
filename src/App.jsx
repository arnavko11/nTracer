/**
 * Root component. Holds the one authoritative copy of the current .nettrace
 * map; every other component reads from it and reports changes back up.
 *
 * Milestone 2 loads a hardcoded sample map. Milestone 3 replaces that with a
 * real scan, and milestone 4 with a file the user opens.
 */

import { useCallback, useState } from 'react';

import Toolbar from './components/Toolbar';
import TopologyCanvas from './components/TopologyCanvas';
import { applyPositions } from './lib/graph';
import './styles/app.css';

// The sample map is committed as a real .nettrace file so it doubles as
// schema documentation; ?raw imports it verbatim and we parse it here.
import sampleMapRaw from '../saved-maps/sample.nettrace?raw';

const SAMPLE_MAP = JSON.parse(sampleMapRaw);

export default function App() {
  const [map, setMap] = useState(SAMPLE_MAP);

  // Persist dragged node positions into the map so a later save keeps them.
  const handlePositionsChange = useCallback((nodes) => {
    setMap((current) => applyPositions(current, nodes));
  }, []);

  return (
    <div className="app">
      <Toolbar map={map} />
      <main className="canvas-area">
        <TopologyCanvas map={map} onPositionsChange={handlePositionsChange} />
      </main>
    </div>
  );
}
