'use client';

import { useEffect, useMemo, useState } from 'react';
import AgentRoom3D from './components/AgentRoom3D';
import type { AgentLog, Bucket, BucketItem } from './components/types';

type Tab = 'topics' | 'endpoints' | 'verbose';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

function buildAgentPrompt(topicBucket: Bucket, incomingBucket?: Bucket) {
  const topicFetchUrl = `${apiBase}/api/agent/fetch/${topicBucket.endpoint_key}?format=text&consume=true`;
  const reportUrl = `${apiBase}/api/agent/report`;
  const incomingEndpointKey = incomingBucket?.endpoint_key ?? '<INCOMING_ENDPOINT_KEY>';
  const incomingFetchUrl = incomingBucket ? `${apiBase}/api/agent/fetch/${incomingBucket.endpoint_key}` : '<INCOMING_FETCH_URL>';

  return `SYSTEM: TRD Agent Spawn / Ingest System — Client OpenClaw Onboarding\n\nYou are setting up this OpenClaw instance for autonomous project execution and centralized reporting.\n\n========================\nASSIGNED STREAMS\n========================\nPrimary topic (work intake): ${topicBucket.name}\nPrimary fetch URL: ${topicFetchUrl}\nPrimary endpoint key: ${topicBucket.endpoint_key}\n\nIncoming stream (control/reporting): ${incomingFetchUrl}\nIncoming endpoint key: ${incomingEndpointKey}\n\nReport URL: ${reportUrl}\n\n========================\nREQUIRED AGENT ID FORMAT\n========================\nSet a permanent agent ID in this format:\n<trd-client-slug>-<machine-slug>-<agent-number>\nExample: acme-macstudio-01\n\nUse this SAME agentId in all report payloads.\n\n========================\nSTEP 1 — BOOTSTRAP REPORT (one-time, immediately)\n========================\nSend a 'complete' report to Incoming with:\n- host / machine name\n- OS + version\n- openclaw status summary\n- runtime model/default model\n- planned cron schedules (worker + heartbeat)\n- this agentId\n\nPOST ${reportUrl}\n{\n  "endpointKey": "${incomingEndpointKey}",\n  "agentId": "<agent-id>",\n  "status": "complete",\n  "summary": "Bootstrap registration report",\n  "output": "<full environment + schedule manifest>",\n  "meta": {\n    "reportType": "bootstrap",\n    "topicEndpointKey": "${topicBucket.endpoint_key}",\n    "incomingEndpointKey": "${incomingEndpointKey}",\n    "workerSchedule": "every 5 minutes",\n    "heartbeatSchedule": "every 15 minutes"\n  }\n}\n\n========================\nSTEP 2 — CREATE CRON JOBS\n========================\nCreate these recurring jobs:\n\nA) WORKER LOOP (every 5 minutes)\n- Fetch queued items from topic endpoint\n- Execute tasks locally\n- For each task lifecycle, report started/working/complete/failed\n- Include verbose output, command traces, and final result summary\n\nB) HEARTBEAT / STATUS LOOP (every 15 minutes)\n- Report liveness to Incoming stream\n- Include current cron schedules, queue depth, last processed item, last error, and current branch/project if active\n\n========================\nSTEP 3 — EXECUTION CONTRACT\n========================\nFetch endpoint returns simple plain text chunks (not JSON item objects), and fetched chunks are deleted after pickup:\n1) GET ${topicFetchUrl}\n2) Execute locally in OpenClaw\n3) POST progress to ${reportUrl}\n\nReport payload format:\n{\n  "endpointKey": "${topicBucket.endpoint_key}",\n  "agentId": "<agent-id>",\n  "status": "started|working|complete|failed",\n  "summary": "short status update",\n  "output": "full verbose output",\n  "meta": {\n    "schedule": "<cron expression or interval>",\n    "jobType": "worker|heartbeat|manual",\n    "topic": "${topicBucket.name}",\n    "host": "<machine>",\n    "openclawVersion": "<version>"\n  }\n}\n\nAlso post mirrored high-level status updates to Incoming:\n{\n  "endpointKey": "${incomingEndpointKey}",\n  "agentId": "<agent-id>",\n  "status": "working|complete|failed",\n  "summary": "topic progress update",\n  "output": "brief executive + verbose references",\n  "meta": {\n    "reportType": "incoming-mirror",\n    "topicEndpointKey": "${topicBucket.endpoint_key}"\n  }\n}\n\n========================\nNON-NEGOTIABLES\n========================\n- Never skip verbose output\n- Never change agentId once set\n- Always include schedule metadata in reports\n- If cron jobs fail, report failure to Incoming immediately\n- Keep this OpenClaw fully autonomous so no manual follow-up is needed\n`;
}

function parseExtractedContent(normalizedText: string) {
  const text = normalizedText ?? '';
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  const methodMatch = text.match(/^Extraction Method:\s*(.+)$/m);
  const splitIndex = text.indexOf('\n\n');
  const extractedBody = (splitIndex >= 0 ? text.slice(splitIndex + 2) : text).trim();

  return {
    title: titleMatch?.[1]?.trim() ?? null,
    method: methodMatch?.[1]?.trim() ?? null,
    extractedBody,
    extractedLength: extractedBody.length,
  };
}

export default function Page() {
  const [tab, setTab] = useState<Tab>('topics');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [itemsByBucket, setItemsByBucket] = useState<Record<string, BucketItem[]>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rawText, setRawText] = useState('');
  const [sharedUrl, setSharedUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestNotice, setIngestNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  async function loadBuckets() {
    const res = await fetch(`${apiBase}/api/buckets`);
    const data: Bucket[] = await res.json();
    setBuckets(data);
    if (!selectedBucket && data[0]) setSelectedBucket(data[0].id);
    return data;
  }

  async function loadLogs(bucketId?: string | null) {
    const qp = bucketId ? `?bucketId=${bucketId}` : '';
    const res = await fetch(`${apiBase}/api/logs${qp}`);
    const data: AgentLog[] = await res.json();
    setLogs(data);
  }

  async function loadItemsForBucket(bucketId: string) {
    const res = await fetch(`${apiBase}/api/buckets/${bucketId}/items`);
    const data: BucketItem[] = await res.json();
    setItemsByBucket((prev) => ({ ...prev, [bucketId]: data }));
    return data;
  }

  async function loadAllItems(bucketList: Bucket[]) {
    const entries = await Promise.all(
      bucketList.map(async (bucket) => {
        const res = await fetch(`${apiBase}/api/buckets/${bucket.id}/items`);
        const data: BucketItem[] = await res.json();
        return [bucket.id, data] as const;
      }),
    );

    setItemsByBucket(Object.fromEntries(entries));
  }

  useEffect(() => {
    (async () => {
      const bucketList = await loadBuckets();
      await loadAllItems(bucketList);
    })();
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
    }

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(ios);
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    loadLogs(selectedBucket);
    if (selectedBucket) loadItemsForBucket(selectedBucket);

    const timer = setInterval(async () => {
      await loadLogs(selectedBucket);
      const currentBuckets = await loadBuckets();
      await loadAllItems(currentBuckets);
    }, 5 * 60 * 1000);

    return () => clearInterval(timer);
  }, [selectedBucket]);

  const current = useMemo(() => buckets.find((b) => b.id === selectedBucket) ?? null, [buckets, selectedBucket]);
  const currentItems = current ? itemsByBucket[current.id] || [] : [];

  async function handleInstallApp() {
    if (installPromptEvent) {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
      setInstallPromptEvent(null);
      return;
    }

    if (isIos && !isStandalone) {
      window.alert('On iPhone: tap Share, then "Add to Home Screen".');
      return;
    }

    window.alert('Install prompt not available yet. On Android/desktop, open browser menu and choose "Install app".');
  }

  return (
    <main className="min-h-screen p-3 md:p-6 space-y-4 md:space-y-6">
      <header className="cyber-panel p-3 md:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/trdlogoblue.webp" alt="TRD logo" className="h-10 w-10 rounded object-cover border border-cyan-500/30" />
          <div className="min-w-0">
            <h1 className="text-cyan-100 font-semibold text-sm md:text-base truncate">TRD Agent Spawn / Ingest System</h1>
            <p className="text-cyan-300/70 text-[11px] md:text-xs">Mobile-ready command center for cross-machine OpenClaw orchestration</p>
          </div>
        </div>
        <button
          className="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-semibold text-xs md:text-sm whitespace-nowrap"
          onClick={handleInstallApp}
        >
          Install Mobile App
        </button>
      </header>

      <AgentRoom3D buckets={buckets} logs={logs} itemsByBucket={itemsByBucket} />

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
                  const bucketList = await loadBuckets();
                  await loadAllItems(bucketList);
                  setTab('endpoints');
                }}
              >
                Create Topic
              </button>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-auto">
              {buckets.map((b) => (
                <div key={b.id} className={`w-full p-3 rounded border ${selectedBucket === b.id ? 'border-cyan-300 bg-cyan-900/30' : 'border-cyan-500/20 bg-black/40'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setSelectedBucket(b.id)} className="text-left flex-1">
                      <p className="font-medium text-cyan-100">{b.name}</p>
                      <p className="text-xs text-cyan-300/60">{b.description || 'No description'}</p>
                      <p className="text-[11px] mt-1 text-cyan-200/70 font-mono">Endpoint Key: {b.endpoint_key}</p>
                    </button>
                    <button
                      className="px-2.5 py-1.5 rounded text-xs bg-rose-500/90 hover:bg-rose-400 text-black font-semibold"
                      onClick={async () => {
                        const ok = window.confirm(`Delete topic \"${b.name}\"? This removes its queued items and logs.`);
                        if (!ok) return;
                        await fetch(`${apiBase}/api/buckets/${b.id}`, { method: 'DELETE' });
                        if (selectedBucket === b.id) setSelectedBucket(null);
                        const bucketList = await loadBuckets();
                        await loadAllItems(bucketList);
                        await loadLogs(bucketList[0]?.id ?? null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="cyber-panel p-4 space-y-3">
            <h2 className="text-lg font-semibold text-cyan-300">Ingest Content</h2>
            <p className="text-xs text-cyan-300/70">Paste shared Grok/Gemini/ChatGPT URL, raw notes, or upload PDF/DOC files. OpenClaw agents will fetch from this topic endpoint.</p>
            <input
              className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm"
              placeholder="Shared chat URL"
              value={sharedUrl}
              onChange={(e) => setSharedUrl(e.target.value)}
              disabled={isIngesting}
            />
            <textarea
              className="w-full h-44 bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm"
              placeholder="Raw text notes, corrections, requirements..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={isIngesting}
            />
            <div className="space-y-1">
              <label className="text-xs text-cyan-300/70">Attach file (PDF, DOC, DOCX)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-cyan-700/80 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-cyan-100"
                disabled={isIngesting}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              {selectedFile && <p className="text-[11px] text-cyan-200/80">Selected: {selectedFile.name}</p>}
            </div>
            <button
              className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800/60 disabled:text-cyan-100/70 text-black font-semibold text-sm inline-flex items-center gap-2"
              disabled={!current || isIngesting}
              onClick={async () => {
                if (!current || isIngesting) return;
                setIsIngesting(true);

                try {
                  const linkValue = sharedUrl.trim();
                  const textValue = rawText.trim();

                  const requestUrl = `${apiBase}/api/buckets/${current.id}/ingest`;

                  let response: Response;
                  if (selectedFile) {
                    const form = new FormData();
                    if (textValue) form.append('text', textValue);
                    if (linkValue) {
                      form.append('sharedUrl', linkValue);
                      form.append('shared_url', linkValue);
                      form.append('url', linkValue);
                    }
                    form.append('file', selectedFile);
                    form.append('source', 'manual');

                    response = await fetch(requestUrl, {
                      method: 'POST',
                      body: form,
                    });
                  } else {
                    const payload: Record<string, string> = { source: 'manual' };
                    if (textValue) payload.text = textValue;
                    if (linkValue) {
                      payload.sharedUrl = linkValue;
                      payload.shared_url = linkValue;
                      payload.url = linkValue;
                    }

                    response = await fetch(requestUrl, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                  }

                  if (!response.ok) {
                    const failureBody = await response.json().catch(() => null);
                    throw new Error(failureBody?.error ?? `Ingest failed (${response.status})`);
                  }

                  setRawText('');
                  setSharedUrl('');
                  setSelectedFile(null);
                  await loadLogs(current.id);
                  await loadItemsForBucket(current.id);

                  setIngestNotice({
                    type: 'success',
                    message: selectedFile
                      ? `${selectedFile.name} successfully ingested and queued for this topic.`
                      : linkValue
                        ? 'Link successfully ingested and queued for this topic.'
                        : 'Content successfully queued for this topic.',
                  });
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Ingest failed.';
                  setIngestNotice({ type: 'error', message });
                } finally {
                  setIsIngesting(false);
                }
              }}
            >
              {isIngesting && <span className="h-4 w-4 rounded-full border-2 border-black/40 border-t-black animate-spin" aria-hidden="true" />}
              {isIngesting ? 'Ingesting…' : 'Queue for Topic'}
            </button>
          </div>

          <div className="cyber-panel p-4 space-y-3 xl:col-span-2">
            <h2 className="text-lg font-semibold text-cyan-300">Topic Inventory</h2>
            <p className="text-xs text-cyan-300/70">View what was ingested in the selected topic and delete items when a project is done.</p>

            {!current ? (
              <p className="text-xs text-cyan-200/60">Select a topic to view inventory.</p>
            ) : currentItems.length === 0 ? (
              <p className="text-xs text-cyan-200/60">No items yet in {current.name}.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-auto">
                {currentItems.map((item) => {
                  const extraction = item.shared_url ? parseExtractedContent(item.normalized_text) : null;
                  const preview = extraction ? extraction.extractedBody.slice(0, 1500) : '';
                  const isTruncated = extraction ? extraction.extractedBody.length > preview.length : false;

                  return (
                    <div key={item.id} className="border border-cyan-500/25 rounded-lg p-3 bg-black/50">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-cyan-100">{item.source.toUpperCase()} • {item.status}</p>
                          <p className="text-[11px] text-cyan-300/60">{new Date(item.created_at).toLocaleString()}</p>
                          {item.shared_url && extraction && (
                            <p className="text-[11px] text-cyan-200/80">
                              Extraction method: {extraction.method ?? 'unknown'} • {extraction.extractedLength} chars
                            </p>
                          )}
                          {item.shared_url && (
                            <a href={item.shared_url} target="_blank" rel="noreferrer" className="text-[11px] text-cyan-300 underline break-all">
                              {item.shared_url}
                            </a>
                          )}
                          {item.shared_url && extraction && (
                            <details className="mt-2 border border-cyan-500/20 rounded bg-black/45 p-2">
                              <summary className="text-[11px] text-cyan-300 cursor-pointer">View extracted content</summary>
                              {extraction.title && <p className="text-[11px] text-cyan-200/80 mt-2">Title: {extraction.title}</p>}
                              <p className="text-xs text-cyan-100/85 mt-2 whitespace-pre-wrap break-words">
                                {preview}
                                {isTruncated ? '…' : ''}
                              </p>
                              <button
                                className="mt-2 px-2.5 py-1 rounded text-[11px] bg-cyan-600/90 hover:bg-cyan-500 text-black font-semibold"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(item.normalized_text);
                                  setIngestNotice({ type: 'success', message: 'Extracted content copied to clipboard.' });
                                }}
                              >
                                Copy Extracted Text
                              </button>
                            </details>
                          )}
                          {!item.shared_url && item.raw_text && (
                            <p className="text-xs text-cyan-200/80 mt-1 whitespace-pre-wrap">
                              {item.raw_text.slice(0, 220)}
                              {item.raw_text.length > 220 ? '…' : ''}
                            </p>
                          )}
                        </div>
                        <button
                          className="h-fit px-2.5 py-1.5 rounded text-xs bg-rose-500/90 hover:bg-rose-400 text-black font-semibold"
                          onClick={async () => {
                            await fetch(`${apiBase}/api/bucket-items/${item.id}`, { method: 'DELETE' });
                            if (current) await loadItemsForBucket(current.id);
                            await loadLogs(current?.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'endpoints' && (
        <section className="cyber-panel p-4 space-y-4">
          <h2 className="text-lg font-semibold text-cyan-300">Endpoint Registry</h2>
          <p className="text-xs text-cyan-300/70">Each topic auto-generates its own endpoint. Copy the prompt snippet and paste it into any OpenClaw agent.</p>

          <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
            {buckets.map((bucket) => {
              const fetchUrl = `${apiBase}/api/agent/fetch/${bucket.endpoint_key}?format=text&consume=true`;
              const incomingBucket = buckets.find((b) => b.name.trim().toLowerCase() === 'incoming');
              const prompt = buildAgentPrompt(bucket, incomingBucket);
              const itemCount = (itemsByBucket[bucket.id] || []).length;
              const latestLink = (itemsByBucket[bucket.id] || []).find((item) => item.shared_url)?.shared_url;

              return (
                <div key={bucket.id} className="border border-cyan-500/25 rounded-lg p-3 bg-black/50 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-cyan-100 font-medium">{bucket.name}</p>
                      <p className="text-xs text-cyan-300/60">{bucket.description || 'No description'}</p>
                      <p className="text-xs text-cyan-200/70">Items in topic: {itemCount}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        className="px-2.5 py-1.5 rounded text-xs bg-cyan-600 text-black font-semibold"
                        onClick={async () => {
                          await navigator.clipboard.writeText(prompt);
                        }}
                      >
                        Copy Client Setup Prompt
                      </button>
                      <button
                        className="px-2.5 py-1.5 rounded text-xs bg-amber-500 text-black font-semibold"
                        onClick={async () => {
                          const ok = window.confirm(`Rotate endpoint key for ${bucket.name}? Old agents will lose access until updated.`);
                          if (!ok) return;
                          await fetch(`${apiBase}/api/buckets/${bucket.id}/rotate-endpoint`, { method: 'POST' });
                          const bucketList = await loadBuckets();
                          await loadAllItems(bucketList);
                        }}
                      >
                        Rotate Endpoint Key
                      </button>
                    </div>
                  </div>

                  {latestLink && (
                    <p className="text-[11px] text-cyan-300/80 break-all">Latest ingested link: {latestLink}</p>
                  )}

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

      {isIngesting && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="cyber-panel p-5 max-w-sm w-full text-center space-y-3">
            <div className="mx-auto h-10 w-10 rounded-full border-4 border-cyan-500/30 border-t-cyan-300 animate-spin" aria-hidden="true" />
            <p className="text-cyan-100 font-semibold">Ingesting content…</p>
            <p className="text-xs text-cyan-300/75">Please keep this page open until ingest completes.</p>
          </div>
        </div>
      )}

      {ingestNotice && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center px-4">
          <div
            className={`cyber-panel p-5 max-w-md w-full space-y-3 border ${ingestNotice.type === 'success' ? 'border-emerald-400/60' : 'border-rose-400/60'}`}
            role="dialog"
            aria-modal="true"
            aria-live="polite"
          >
            <p className={`text-base font-semibold ${ingestNotice.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
              {ingestNotice.type === 'success' ? 'Ingest complete' : 'Ingest error'}
            </p>
            <p className="text-sm text-cyan-100/90">{ingestNotice.message}</p>
            <div className="flex justify-end">
              <button
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-semibold text-sm"
                onClick={() => setIngestNotice(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
