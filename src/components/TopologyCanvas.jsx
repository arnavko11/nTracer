/**
 * The drag-and-drop topology canvas.
 *
 * Owns React Flow's node/edge state and pushes dragged positions back up to
 * App, which holds the authoritative .nettrace map.
 */

import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import DeviceNode from './DeviceNode';
import { mapToFlow } from '../lib/graph';

export default function TopologyCanvas({
  map,
  newIds,
  selectedId,
  trace,
  onSelect,
  onPositionsChange,
}) {
  // Registered once: re-creating this object each render remounts every node.
  const nodeTypes = useMemo(() => ({ device: DeviceNode }), []);

  const flow = useMemo(
    () => mapToFlow(map, { newIds, selectedId, trace }),
    [map, newIds, selectedId, trace],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  // Re-derive the graph whenever the underlying map changes (scan, load, drag).
  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow, setNodes, setEdges]);

  // Remount React Flow when the *set* of devices changes — a scan or a load —
  // so its own `fitView` re-runs and frames the new topology. Keying on the
  // id list means dragging a node doesn't remount (and doesn't yank the
  // viewport around under the user).
  const topologyKey = useMemo(
    () => flow.nodes.map((node) => node.id).sort().join(','),
    [flow],
  );

  // Only report positions when a drag finishes — reporting on every frame
  // would rewrite the map dozens of times per second.
  const handleDragStop = useCallback(() => {
    onPositionsChange?.(nodes);
  }, [nodes, onPositionsChange]);

  return (
    <ReactFlow
      key={topologyKey}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={handleDragStop}
      onNodeClick={(_event, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={24} size={1} color="#22303f" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={() => '#3d7eff'} maskColor="rgba(8,14,20,0.7)" />
    </ReactFlow>
  );
}
