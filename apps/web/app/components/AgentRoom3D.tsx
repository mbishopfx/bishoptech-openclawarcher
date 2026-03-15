'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Activity, Calendar, Code, BookOpen, Headset, Network, BarChart3, Database, Cpu, Server, Workflow, Radio } from 'lucide-react';
import type { Agent, AgentLog } from './types';

const TASKS = [
  'Processing incoming requests',
  'Analyzing system metrics',
  'Optimizing workflows',
  'Reviewing documentation',
  'Coordinating tasks',
  'Gathering insights',
  'Synchronizing data',
  'Planning sprints',
  'Monitoring performance',
  'Generating reports',
];

const initialAgents: Agent[] = [
  { id: 'atlas', name: 'Atlas', role: 'Schedule Manager', color: '#3b82f6', position: { x: 150, y: 150 }, status: 'idle', currentTask: 'Coordinating team meetings', trail: [] },
  { id: 'sage', name: 'Sage', role: 'Data Analyst', color: '#10b981', position: { x: 450, y: 200 }, status: 'idle', currentTask: 'Analyzing performance metrics', trail: [] },
  { id: 'cipher', name: 'Cipher', role: 'Code Reviewer', color: '#8b5cf6', position: { x: 750, y: 180 }, status: 'idle', currentTask: 'Reviewing pull request #247', trail: [] },
  { id: 'echo', name: 'Echo', role: 'Customer Support', color: '#f59e0b', position: { x: 250, y: 450 }, status: 'idle', currentTask: 'Monitoring support queue', trail: [] },
  { id: 'nova', name: 'Nova', role: 'Research Assistant', color: '#ec4899', position: { x: 550, y: 480 }, status: 'idle', currentTask: 'Gathering market insights', trail: [] },
  { id: 'nexus', name: 'Nexus', role: 'Task Orchestrator', color: '#06b6d4', position: { x: 800, y: 500 }, status: 'idle', currentTask: 'Optimizing workflow pipelines', trail: [] },
];

const stations = [
  { x: 150, y: 150, label: 'Planning Station', color: '#3b82f6', icon: Calendar },
  { x: 450, y: 200, label: 'Analytics Hub', color: '#10b981', icon: Database },
  { x: 750, y: 180, label: 'Code Terminal', color: '#8b5cf6', icon: Cpu },
  { x: 250, y: 450, label: 'Support Console', color: '#f59e0b', icon: Server },
  { x: 550, y: 480, label: 'Research Lab', color: '#ec4899', icon: Workflow },
  { x: 800, y: 500, label: 'Command Node', color: '#06b6d4', icon: Radio },
];

function pickTask() {
  return TASKS[Math.floor(Math.random() * TASKS.length)];
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function iconFor(name: string) {
  if (name === 'Atlas') return Calendar;
  if (name === 'Sage') return BarChart3;
  if (name === 'Cipher') return Code;
  if (name === 'Echo') return Headset;
  if (name === 'Nova') return BookOpen;
  return Network;
}

export default function AgentRoom3D({ logs }: { logs: AgentLog[] }) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [activity, setActivity] = useState<string[]>([]);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const rotateX = useMotionValue(60);
  const rotateZ = useMotionValue(-45);
  const zoom = useMotionValue(1);

  const sx = useSpring(rotateX, { stiffness: 100, damping: 30 });
  const sz = useSpring(rotateZ, { stiffness: 100, damping: 30 });
  const szoom = useSpring(zoom, { stiffness: 120, damping: 25 });

  useEffect(() => {
    const trailTimer = setInterval(() => {
      setAgents(prev =>
        prev.map(a => ({
          ...a,
          trail: [...a.trail.slice(-14), { x: a.position.x, y: a.position.y }],
        })),
      );
    }, 100);

    const moveTimer = setInterval(() => {
      setAgents(prev =>
        prev.map(agent => {
          if (Math.random() > 0.3 || agent.status === 'collaborating') return agent;
          const station = stations[Math.floor(Math.random() * stations.length)];
          return {
            ...agent,
            position: {
              x: clamp(station.x + (Math.random() * 25 - 12.5), 80, 820),
              y: clamp(station.y + (Math.random() * 25 - 12.5), 80, 520),
            },
            status: Math.random() > 0.5 ? 'working' : 'thinking',
            currentTask: pickTask(),
          };
        }),
      );
    }, 5000);

    const collabTimer = setInterval(() => {
      if (Math.random() > 0.4) return;
      setAgents(prev => {
        const copy = [...prev];
        const a = copy[Math.floor(Math.random() * copy.length)];
        let b = copy[Math.floor(Math.random() * copy.length)];
        while (b.id === a.id) b = copy[Math.floor(Math.random() * copy.length)];
        setPair([a.id, b.id]);
        setActivity(msgs => [`${a.name} synced with ${b.name}`, ...msgs].slice(0, 6));
        return copy.map(agent => {
          if (agent.id === a.id) return { ...agent, position: { x: 400, y: 350 }, status: 'collaborating' };
          if (agent.id === b.id) return { ...agent, position: { x: 500, y: 350 }, status: 'collaborating' };
          return agent;
        });
      });

      setTimeout(() => {
        setPair(null);
        setAgents(prev => prev.map(a => (a.status === 'collaborating' ? { ...a, status: 'idle' } : a)));
      }, 3500);
    }, 8000);

    return () => {
      clearInterval(trailTimer);
      clearInterval(moveTimer);
      clearInterval(collabTimer);
    };
  }, []);

  useEffect(() => {
    if (logs.length === 0) return;
    const newItems = logs.slice(0, 3).map(l => `${l.agent_id}: ${l.summary ?? l.status}`);
    setActivity(prev => [...newItems, ...prev].slice(0, 6));
  }, [logs]);

  const working = useMemo(() => agents.filter(a => a.status === 'working').length, [agents]);

  return (
    <div className="space-y-4">
      <div className="cyber-panel p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
            OpenClaw Agent Command Center - 3D View
          </div>
          <p className="text-cyan-300/70 text-sm">Neural Network Monitoring System v3.0 • Drag to rotate • Scroll to zoom</p>
        </div>
        <div className="flex gap-3">
          <div className="cyber-panel px-4 py-2 text-center">
            <p className="text-xs text-cyan-300/70">Active</p>
            <p className="text-xl font-bold text-cyan-300">{agents.length}</p>
          </div>
          <div className="cyber-panel px-4 py-2 text-center border-green-500/40">
            <p className="text-xs text-green-300/70">Working</p>
            <p className="text-xl font-bold text-green-300">{working}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="cyber-panel p-4 relative">
          <div className={`absolute right-4 top-4 text-xs font-mono ${dragging ? 'opacity-50' : 'opacity-100'} text-cyan-200`}>
            X:{Math.round(sx.get())}° Z:{Math.round(sz.get())}° Zoom:{Math.round(szoom.get() * 100)}%
          </div>
          <div className="absolute left-4 top-4 text-xs text-cyan-300/70">🎮 Drag to Rotate | 🖱️ Scroll to Zoom</div>

          <div
            className="h-[600px] rounded-xl overflow-hidden relative cursor-grab active:cursor-grabbing"
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

                {stations.map((station) => {
                  const Icon = station.icon;
                  return (
                    <div key={station.label} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: station.x, top: station.y, transform: 'translateZ(8px)' }}>
                      <div className="w-16 h-16 rounded-xl border-2 flex items-center justify-center" style={{ borderColor: station.color, background: `${station.color}33`, boxShadow: `0 0 20px ${station.color}88` }}>
                        <Icon size={24} color={station.color} />
                      </div>
                      <div className="mt-2 text-[9px] px-1 py-0.5 rounded bg-black/80 border text-center font-mono" style={{ borderColor: station.color, color: station.color }}>
                        {station.label}
                      </div>
                    </div>
                  );
                })}

                <div className="absolute -translate-x-1/2 -translate-y-1/2 w-[100px] h-[100px] rounded-full border-2 border-dashed border-purple-500/70 shadow-[0_0_30px_rgba(168,85,247,0.4)]" style={{ left: 450, top: 350, transform: 'translateZ(5px)' }} />

                {agents.map((agent) => {
                  const Icon = iconFor(agent.name);
                  return (
                    <div key={agent.id} className="absolute -translate-x-1/2 -translate-y-1/2 group" style={{ left: agent.position.x, top: agent.position.y, transform: 'translateZ(20px)' }}>
                      {agent.trail.map((p, i) => (
                        <div
                          key={`${agent.id}-${i}`}
                          className="absolute w-[2px] h-[2px] rounded-full"
                          style={{ left: p.x - agent.position.x, top: p.y - agent.position.y, background: agent.color, opacity: (i / 15) * 0.6 }}
                        />
                      ))}

                      <motion.div animate={agent.status === 'collaborating' ? { y: [0, -3, 0] } : {}} transition={{ duration: 0.6, repeat: Infinity }}>
                        <div className="w-9 h-7 rounded-md border-2 border-white/80" style={{ background: agent.color }}>
                          <div className="flex justify-center gap-1 pt-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-md border-2 border-white/80 mt-1 flex items-center justify-center" style={{ background: agent.color }}>
                          <Icon size={16} className="text-white" />
                        </div>
                      </motion.div>

                      <div className="mt-1 text-[9px] font-mono px-2 py-0.5 rounded bg-black/80 border text-center" style={{ borderColor: agent.color, color: agent.color }}>
                        {agent.name}
                      </div>

                      <div className="hidden group-hover:block absolute -top-16 left-1/2 -translate-x-1/2 w-48 p-2 rounded-md border bg-black/90 text-xs" style={{ borderColor: agent.color }}>
                        <p className="font-semibold" style={{ color: agent.color }}>{agent.role}</p>
                        <p className="text-cyan-100/90">{agent.currentTask}</p>
                      </div>
                    </div>
                  );
                })}

                {pair && (() => {
                  const a = agents.find(x => x.id === pair[0]);
                  const b = agents.find(x => x.id === pair[1]);
                  if (!a || !b) return null;
                  return (
                    <svg className="absolute inset-0 pointer-events-none" style={{ transform: 'translateZ(18px)' }}>
                      <motion.line
                        x1={a.position.x}
                        y1={a.position.y}
                        x2={b.position.x}
                        y2={b.position.y}
                        stroke={a.color}
                        strokeWidth={3}
                        strokeDasharray="8 4"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 0.8 }}
                        transition={{ duration: 0.8 }}
                      />
                    </svg>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="cyber-panel p-4 flex flex-col gap-4">
          <h3 className="text-cyan-300 text-lg font-semibold flex gap-2 items-center"><Activity size={18} /> System Log</h3>
          <div className="flex-1 space-y-2 overflow-auto max-h-[320px]">
            {activity.length === 0 ? (
              <p className="text-xs text-cyan-200/50 font-mono">Monitoring neural activity...</p>
            ) : (
              activity.map((item, idx) => (
                <motion.div key={`${item}-${idx}`} className="p-2 border border-cyan-500/30 rounded bg-black/60 text-xs font-mono" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  <p className="text-cyan-100">{item}</p>
                  <p className="text-[10px] text-cyan-300/50">{new Date().toLocaleTimeString()}</p>
                </motion.div>
              ))
            )}
          </div>

          <div className="border-t border-cyan-500/20 pt-3">
            <h4 className="text-xs font-mono text-cyan-300 mb-2">AGENT ROSTER</h4>
            <div className="space-y-1">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }} /> <span style={{ color: a.color }}>{a.name}</span></span>
                  <span className="text-cyan-300/60">{a.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
