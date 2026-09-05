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

export default function TopologyCanvas({ map, onPositionsChange }) {
  // Registered once: re-creating this object each render remounts every node.
  const nodeTypes = useMemo(() => ({ device: DeviceNode }), []);

  const flow = useMemo(() => mapToFlow(map), [map]);
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  // Re-derive the graph whenever the underlying map is replaced (scan, load).
  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow, setNodes, setEdges]);

  // Only report positions when a drag finishes — reporting on every frame
  // would rewrite the map dozens of times per second.
  const handleDragStop = useCallback(() => {
    onPositionsChange?.(nodes);
  }, [nodes, onPositionsChange]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={handleDragStop}
      fitView
      minZoom={0.2}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={24} size={1} color="#22303f" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={() => '#3d7eff'} maskColor="rgba(8,14,20,0.7)" />
    </ReactFlow>
  );
}
