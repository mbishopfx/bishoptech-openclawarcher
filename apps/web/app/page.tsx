'use client';

import { useEffect, useMemo, useState } from 'react';
import AgentRoom3D from './components/AgentRoom3D';
import type { AgentLog, Bucket } from './components/types';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export default function Page() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rawText, setRawText] = useState('');
  const [sharedUrl, setSharedUrl] = useState('');

  async function loadBuckets() {
    const res = await fetch(`${apiBase}/api/buckets`);
    const data = await res.json();
    setBuckets(data);
    if (!selectedBucket && data[0]) setSelectedBucket(data[0].id);
  }

  async function loadLogs(bucketId?: string | null) {
    const qp = bucketId ? `?bucketId=${bucketId}` : '';
    const res = await fetch(`${apiBase}/api/logs${qp}`);
    const data = await res.json();
    setLogs(data);
  }

  useEffect(() => {
    loadBuckets();
  }, []);

  useEffect(() => {
    if (!selectedBucket) return;
    loadLogs(selectedBucket);
    const timer = setInterval(() => loadLogs(selectedBucket), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [selectedBucket]);

  const current = useMemo(() => buckets.find((b) => b.id === selectedBucket) ?? null, [buckets, selectedBucket]);

  return (
    <main className="min-h-screen p-6 space-y-6">
      <AgentRoom3D logs={logs} />

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="cyber-panel p-4 space-y-3">
          <h2 className="text-lg font-semibold text-cyan-300">Buckets / Topics</h2>
          <div className="flex gap-2">
            <input className="bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm flex-1" placeholder="Bucket name (e.g. Coding)
" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm flex-1" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <button
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-semibold text-sm"
              onClick={async () => {
                if (!name.trim()) return;
                await fetch(`${apiBase}/api/buckets`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name, description }),
                });
                setName('');
                setDescription('');
                await loadBuckets();
              }}
            >
              Create
            </button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-auto">
            {buckets.map((b) => (
              <button key={b.id} onClick={() => setSelectedBucket(b.id)} className={`w-full text-left p-3 rounded border ${selectedBucket === b.id ? 'border-cyan-300 bg-cyan-900/30' : 'border-cyan-500/20 bg-black/40'}`}>
                <p className="font-medium text-cyan-100">{b.name}</p>
                <p className="text-xs text-cyan-300/60">{b.description || 'No description'}</p>
                <p className="text-[11px] mt-1 text-cyan-200/70 font-mono">Endpoint: {apiBase}/api/agent/fetch/{b.endpoint_key}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="cyber-panel p-4 space-y-3">
          <h2 className="text-lg font-semibold text-cyan-300">Ingest Content</h2>
          <p className="text-xs text-cyan-300/70">Paste shared Grok/Gemini/ChatGPT URL or raw text. Backend normalizes to agent-friendly text.</p>
          <input className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm" placeholder="Shared chat URL" value={sharedUrl} onChange={(e) => setSharedUrl(e.target.value)} />
          <textarea className="w-full h-44 bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm" placeholder="Raw text notes, corrections, scope updates..." value={rawText} onChange={(e) => setRawText(e.target.value)} />
          <button
            className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm"
            disabled={!current}
            onClick={async () => {
              if (!current) return;
              await fetch(`${apiBase}/api/buckets/${current.id}/ingest`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text: rawText || undefined, sharedUrl: sharedUrl || undefined, source: 'manual' }),
              });
              setRawText('');
              setSharedUrl('');
              await loadLogs(current.id);
            }}
          >
            Queue for Agents
          </button>

          <div className="border-t border-cyan-500/20 pt-3 text-xs font-mono text-cyan-200/80 space-y-1">
            <p>Agent fetch:</p>
            <code className="block p-2 rounded bg-black/60 border border-cyan-500/20">GET {current ? `${apiBase}/api/agent/fetch/${current.endpoint_key}` : '{select bucket first}'}</code>
            <p>Agent report:</p>
            <code className="block p-2 rounded bg-black/60 border border-cyan-500/20">POST {apiBase}/api/agent/report</code>
          </div>
        </div>
      </section>
    </main>
  );
}
