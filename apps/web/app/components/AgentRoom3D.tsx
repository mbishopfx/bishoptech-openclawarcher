'use client';

import { useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Activity, FolderKanban } from 'lucide-react';
import type { AgentLog, Bucket, BucketItem } from './types';

const stationPositions = [
  { x: 150, y: 150 },
  { x: 450, y: 200 },
  { x: 750, y: 180 },
  { x: 250, y: 450 },
  { x: 550, y: 480 },
  { x: 800, y: 500 },
];

const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

type TopicState = 'idle' | 'working' | 'complete' | 'failed';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function topicStateForBucket(bucket: Bucket, logs: AgentLog[], items: BucketItem[]): TopicState {
  if (items.some((item) => item.status === 'queued' || item.status === 'in_progress')) return 'working';
  if (items.some((item) => item.status === 'failed')) return 'failed';

  const latest = logs.find((log) => log.bucket_id === bucket.id);
  if (!latest) return items.some((item) => item.status === 'done') ? 'complete' : 'idle';
  if (latest.status === 'failed') return 'failed';
  if (latest.status === 'complete') return 'complete';

  const recentMs = Date.now() - new Date(latest.created_at).getTime();
  if (recentMs < 10 * 60 * 1000) return 'working';
  return items.some((item) => item.status === 'done') ? 'complete' : 'idle';
}

export default function AgentRoom3D({
  buckets,
  logs,
  itemsByBucket,
}: {
  buckets: Bucket[];
  logs: AgentLog[];
  itemsByBucket: Record<string, BucketItem[]>;
}) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const rotateX = useMotionValue(60);
  const rotateZ = useMotionValue(-45);
  const zoom = useMotionValue(1);

  const sx = useSpring(rotateX, { stiffness: 100, damping: 30 });
  const sz = useSpring(rotateZ, { stiffness: 100, damping: 30 });
  const szoom = useSpring(zoom, { stiffness: 120, damping: 25 });

  const topics = useMemo(
    () =>
      buckets.slice(0, 6).map((bucket, idx) => {
        const bucketItems = itemsByBucket[bucket.id] || [];
        return {
          ...bucket,
          color: bucket.color || palette[idx % palette.length],
          position: stationPositions[idx],
          state: topicStateForBucket(bucket, logs, bucketItems),
          latestLog: logs.find((log) => log.bucket_id === bucket.id),
          itemCount: bucketItems.length,
          pendingCount: bucketItems.filter((i) => i.status === 'queued' || i.status === 'in_progress').length,
        };
      }),
    [buckets, logs, itemsByBucket],
  );

  const workingCount = topics.filter((t) => t.state === 'working').length;
  const recentActivity = logs.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="cyber-panel p-4 flex items-center justify-between">
        <div>
          <div className="text-xl md:text-2xl font-bold bg-gradient-to-r from-cyan-300 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
            TRD Agent Spawn / Ingest System
          </div>
          <p className="text-cyan-300/70 text-xs md:text-sm">Topic orchestration map • drag to rotate • scroll to zoom</p>
        </div>
        <div className="flex gap-3">
          <div className="cyber-panel px-4 py-2 text-center">
            <p className="text-xs text-cyan-300/70">Topics</p>
            <p className="text-xl font-bold text-cyan-300">{topics.length}</p>
          </div>
          <div className="cyber-panel px-4 py-2 text-center border-green-500/40">
            <p className="text-xs text-green-300/70">Active</p>
            <p className="text-xl font-bold text-green-300">{workingCount}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="cyber-panel p-4 relative">
          <div className={`absolute right-4 top-4 text-xs font-mono ${dragging ? 'opacity-50' : 'opacity-100'} text-cyan-200`}>
            X:{Math.round(sx.get())}° Z:{Math.round(sz.get())}° Zoom:{Math.round(szoom.get() * 100)}%
          </div>
          <div className="absolute left-4 top-4 text-xs text-cyan-300/70">🎮 Drag to Rotate | 🖱️ Scroll to Zoom</div>

          <div
            className="h-[420px] md:h-[600px] rounded-xl overflow-hidden relative cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              setDragging(true);
              dragRef.current = { x: e.clientX, y: e.clientY };
            }}
            onMouseMove={(e) => {
              if (!dragRef.current) return;
              const dx = e.clientX - dragRef.current.x;
              const dy = e.clientY - dragRef.current.y;
              rotateX.set(clamp(rotateX.get() + dy * 0.3, 20, 80));
              rotateZ.set(rotateZ.get() + dx * 0.3);
              dragRef.current = { x: e.clientX, y: e.clientY };
            }}
            onMouseUp={() => {
              setDragging(false);
              dragRef.current = null;
            }}
            onMouseLeave={() => {
              setDragging(false);
              dragRef.current = null;
            }}
            onWheel={(e) => {
              e.preventDefault();
              zoom.set(clamp(zoom.get() - e.deltaY * 0.001, 0.5, 1.5));
            }}
            style={{ perspective: 1500 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                transformStyle: 'preserve-3d',
                rotateX: sx,
                rotateZ: sz,
                scale: szoom,
              }}
            >
              <div className="absolute left-1/2 top-1/2 w-[900px] h-[600px] -translate-x-1/2 -translate-y-1/2">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-900 via-black to-slate-900 shadow-[0_30px_80px_rgba(0,0,0,0.9)]" style={{ transform: 'translateZ(-40px)' }} />
                <div className="absolute inset-0 rounded-2xl grid-floor" style={{ transform: 'translateZ(0px)' }} />

                {topics.map((topic) => {
                  const glow = topic.state === 'working' ? `${topic.color}cc` : `${topic.color}66`;
                  const statusColor =
                    topic.state === 'failed'
                      ? '#ef4444'
                      : topic.state === 'complete'
                      ? '#22c55e'
                      : topic.state === 'working'
                      ? '#22c55e'
                      : '#9ca3af';

                  return (
                    <motion.div
                      key={topic.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 group"
                      style={{ left: topic.position.x, top: topic.position.y, transform: 'translateZ(18px)' }}
                      animate={topic.state === 'working' ? { y: [0, -4, 0] } : { y: 0 }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      <div
                        className="w-20 h-20 rounded-xl border-2 flex items-center justify-center"
                        style={{
                          borderColor: topic.color,
                          background: `${topic.color}30`,
                          boxShadow: `0 0 24px ${glow}`,
                        }}
                      >
                        <FolderKanban size={28} color={topic.color} />
                      </div>

                      <div className="mt-2 text-[10px] px-2 py-1 rounded bg-black/85 border text-center font-mono min-w-[130px]" style={{ borderColor: topic.color, color: topic.color }}>
                        {topic.name}
                      </div>

                      <div className="mt-1 text-[9px] font-mono text-center" style={{ color: statusColor }}>
                        {topic.state.toUpperCase()} • {topic.itemCount} ITEMS • {topic.pendingCount} PENDING
                      </div>

                      <div className="hidden group-hover:block absolute -top-24 left-1/2 -translate-x-1/2 w-64 p-2 rounded-md border bg-black/95 text-xs" style={{ borderColor: topic.color }}>
                        <p className="font-semibold" style={{ color: topic.color }}>
                          {topic.name}
                        </p>
                        <p className="text-cyan-100/90">{topic.latestLog?.summary || topic.description || 'No latest output yet.'}</p>
                        <p className="text-cyan-300/70 mt-1">Items: {topic.itemCount} • Pending: {topic.pendingCount}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="cyber-panel p-4 flex flex-col gap-4">
          <h3 className="text-cyan-300 text-lg font-semibold flex gap-2 items-center">
            <Activity size={18} /> Incoming Stream
          </h3>
          <div className="flex-1 space-y-2 overflow-auto max-h-[520px] pr-1">
            {recentActivity.length === 0 ? (
              <p className="text-xs text-cyan-200/50 font-mono">Waiting for verbose agent output...</p>
            ) : (
              recentActivity.map((log) => (
                <motion.div
                  key={log.id}
                  className="p-2 border border-cyan-500/30 rounded bg-black/60 text-xs font-mono"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <p className="text-cyan-200">[{new Date(log.created_at).toLocaleTimeString()}] {log.agent_id}</p>
                  <p className="text-cyan-100/80">Status: {log.status}</p>
                  {log.summary && <p className="text-cyan-100 mt-1">{log.summary}</p>}
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-cyan-100/90 max-h-40 overflow-auto">{log.output}</pre>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
