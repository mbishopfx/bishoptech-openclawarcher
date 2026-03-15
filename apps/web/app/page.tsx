'use client';

import { useEffect, useMemo, useState } from 'react';
import AgentRoom3D from './components/AgentRoom3D';
import type { AgentLog, Bucket } from './components/types';

type Tab = 'topics' | 'endpoints' | 'verbose';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

function buildAgentPrompt(bucket: Bucket) {
  const fetchUrl = `${apiBase}/api/agent/fetch/${bucket.endpoint_key}`;
  const reportUrl = `${apiBase}/api/agent/report`;

  return `You are connected to OpenClaw Topic: ${bucket.name}\n\n1) Every run, fetch queued instructions:\nGET ${fetchUrl}\n\n2) Execute the returned items locally in your OpenClaw runtime.\n\n3) Send progress + verbose output back:\nPOST ${reportUrl}\nJSON body:\n{\n  "endpointKey": "${bucket.endpoint_key}",\n  "agentId": "<your-agent-id>",\n  "itemId": "<bucket-item-id-if-present>",\n  "status": "working|complete|failed",\n  "summary": "short status",\n  "output": "full verbose output"\n}\n\nAlways include verbose output so the dashboard incoming stream is complete.`;
}

export default function Page() {
  const [tab, setTab] = useState<Tab>('topics');
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
    loadLogs(selectedBucket);
    const timer = setInterval(() => loadLogs(selectedBucket), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [selectedBucket]);

  const current = useMemo(() => buckets.find((b) => b.id === selectedBucket) ?? null, [buckets, selectedBucket]);

  return (
    <main className="min-h-screen p-6 space-y-6">
      <AgentRoom3D buckets={buckets} logs={logs} />

      <section className="cyber-panel p-3 flex gap-2 w-fit">
        <button className={`px-3 py-1.5 rounded text-sm ${tab === 'topics' ? 'bg-cyan-600 text-black font-semibold' : 'bg-black/50 text-cyan-200'}`} onClick={() => setTab('topics')}>Topics</button>
        <button className={`px-3 py-1.5 rounded text-sm ${tab === 'endpoints' ? 'bg-cyan-600 text-black font-semibold' : 'bg-black/50 text-cyan-200'}`} onClick={() => setTab('endpoints')}>Endpoints</button>
        <button className={`px-3 py-1.5 rounded text-sm ${tab === 'verbose' ? 'bg-cyan-600 text-black font-semibold' : 'bg-black/50 text-cyan-200'}`} onClick={() => setTab('verbose')}>Verbose Stream</button>
      </section>

      {tab === 'topics' && (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="cyber-panel p-4 space-y-3">
            <h2 className="text-lg font-semibold text-cyan-300">Topics</h2>
            <div className="flex gap-2">
              <input
                className="bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm flex-1"
                placeholder="Topic name (ex: Coding Sprint)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
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
                  setTab('endpoints');
                }}
              >
                Create Topic
              </button>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-auto">
              {buckets.map((b) => (
                <button key={b.id} onClick={() => setSelectedBucket(b.id)} className={`w-full text-left p-3 rounded border ${selectedBucket === b.id ? 'border-cyan-300 bg-cyan-900/30' : 'border-cyan-500/20 bg-black/40'}`}>
                  <p className="font-medium text-cyan-100">{b.name}</p>
                  <p className="text-xs text-cyan-300/60">{b.description || 'No description'}</p>
                  <p className="text-[11px] mt-1 text-cyan-200/70 font-mono">Endpoint Key: {b.endpoint_key}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="cyber-panel p-4 space-y-3">
            <h2 className="text-lg font-semibold text-cyan-300">Ingest Content</h2>
            <p className="text-xs text-cyan-300/70">Paste shared Grok/Gemini/ChatGPT URL or raw notes. OpenClaw agents will fetch from this topic endpoint.</p>
            <input className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm" placeholder="Shared chat URL" value={sharedUrl} onChange={(e) => setSharedUrl(e.target.value)} />
            <textarea className="w-full h-44 bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm" placeholder="Raw text notes, corrections, requirements..." value={rawText} onChange={(e) => setRawText(e.target.value)} />
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
              Queue for Topic
            </button>
          </div>
        </section>
      )}

      {tab === 'endpoints' && (
        <section className="cyber-panel p-4 space-y-4">
          <h2 className="text-lg font-semibold text-cyan-300">Endpoint Registry</h2>
          <p className="text-xs text-cyan-300/70">Each topic auto-generates its own endpoint. Copy the prompt snippet and paste it into any OpenClaw agent.</p>

          <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
            {buckets.map((bucket) => {
              const fetchUrl = `${apiBase}/api/agent/fetch/${bucket.endpoint_key}`;
              const prompt = buildAgentPrompt(bucket);

              return (
                <div key={bucket.id} className="border border-cyan-500/25 rounded-lg p-3 bg-black/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-cyan-100 font-medium">{bucket.name}</p>
                      <p className="text-xs text-cyan-300/60">{bucket.description || 'No description'}</p>
                    </div>
                    <button
                      className="px-2.5 py-1.5 rounded text-xs bg-cyan-600 text-black font-semibold"
                      onClick={async () => {
                        await navigator.clipboard.writeText(prompt);
                      }}
                    >
                      Copy Agent Prompt
                    </button>
                  </div>

                  <div className="text-xs font-mono text-cyan-200/90 space-y-1">
                    <p>Fetch URL</p>
                    <code className="block p-2 rounded bg-black/70 border border-cyan-500/20 break-all">{fetchUrl}</code>
                    <p>Report URL</p>
                    <code className="block p-2 rounded bg-black/70 border border-cyan-500/20 break-all">{apiBase}/api/agent/report</code>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'verbose' && (
        <section className="cyber-panel p-4 space-y-3">
          <h2 className="text-lg font-semibold text-cyan-300">Verbose Output Feed</h2>
          <p className="text-xs text-cyan-300/70">This stream shows full output posted by OpenClaw agents.</p>

          <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
            {logs.length === 0 ? (
              <p className="text-xs text-cyan-200/50 font-mono">No output yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-3 border border-cyan-500/30 rounded bg-black/60 text-xs font-mono">
                  <p className="text-cyan-200">[{new Date(log.created_at).toLocaleString()}] {log.agent_id}</p>
                  <p className="text-cyan-100/80">Status: {log.status}</p>
                  {log.summary && <p className="text-cyan-100 mt-1">{log.summary}</p>}
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-cyan-100/90">{log.output}</pre>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}
