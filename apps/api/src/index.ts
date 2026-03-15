import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
  }),
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const createBucketSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  color: z.string().optional(),
});

const ingestSchema = z.object({
  text: z.string().optional(),
  sharedUrl: z.string().url().optional(),
  source: z.enum(['manual', 'grok', 'gemini', 'chatgpt', 'other']).default('manual'),
  title: z.string().optional(),
});

const reportSchema = z.object({
  endpointKey: z.string().min(8),
  agentId: z.string().min(2),
  itemId: z.string().uuid().optional(),
  status: z.enum(['started', 'working', 'complete', 'failed']).default('working'),
  summary: z.string().optional(),
  output: z.string().min(1),
  meta: z.record(z.any()).optional(),
});

function requireDb(res: express.Response) {
  if (!db) {
    res.status(503).json({
      error: 'API is not configured yet. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Railway variables.',
    });
    return false;
  }
  return true;
}

async function scrapeToMarkdown(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'OpenClaw-Agent-Command-Center/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status})`);
  }

  const html = await res.text();
  const dom = new JSDOM(html);
  const title = dom.window.document.title?.trim() || url;

  const text = dom.window.document.body?.textContent
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, 45000);

  const markdown = `# ${title}\n\nSource: ${url}\n\n${text ?? ''}`;
  return marked.parse(markdown) as string;
}

app.get('/health', (_req, res) => res.json({ ok: true, configured: Boolean(db) }));

app.get('/api/buckets', async (_req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;
  const { data, error } = await dbClient
    .from('agent_buckets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

app.post('/api/buckets', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;
  const parsed = createBucketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const endpointKey = `oc_${nanoid(18)}`;
  const { data, error } = await dbClient
    .from('agent_buckets')
    .insert({ ...parsed.data, endpoint_key: endpointKey })
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

app.post('/api/buckets/:bucketId/ingest', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;
  const bucketId = req.params.bucketId;
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (!parsed.data.text && !parsed.data.sharedUrl) {
    return res.status(400).json({ error: 'text or sharedUrl is required' });
  }

  let normalized = parsed.data.text ?? '';

  if (parsed.data.sharedUrl) {
    normalized = await scrapeToMarkdown(parsed.data.sharedUrl);
  }

  const { data, error } = await dbClient
    .from('bucket_items')
    .insert({
      bucket_id: bucketId,
      title: parsed.data.title ?? null,
      raw_text: parsed.data.text ?? null,
      normalized_text: normalized,
      shared_url: parsed.data.sharedUrl ?? null,
      source: parsed.data.source,
      status: 'queued',
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

app.get('/api/agent/fetch/:endpointKey', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;
  const endpointKey = req.params.endpointKey;

  const { data: bucket, error: bucketError } = await dbClient
    .from('agent_buckets')
    .select('*')
    .eq('endpoint_key', endpointKey)
    .single();

  if (bucketError || !bucket) return res.status(404).json({ error: 'Bucket endpoint not found' });

  const { data: items, error: itemsError } = await dbClient
    .from('bucket_items')
    .select('*')
    .eq('bucket_id', bucket.id)
    .in('status', ['queued', 'in_progress'])
    .order('created_at', { ascending: true })
    .limit(20);

  if (itemsError) return res.status(500).json({ error: itemsError.message });
  return res.json({ bucket, items });
});

app.post('/api/agent/report', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { endpointKey, itemId, status, output, agentId, summary, meta } = parsed.data;

  const { data: bucket, error: bucketError } = await dbClient
    .from('agent_buckets')
    .select('*')
    .eq('endpoint_key', endpointKey)
    .single();

  if (bucketError || !bucket) return res.status(404).json({ error: 'Bucket endpoint not found' });

  if (itemId) {
    const { error: itemErr } = await dbClient
      .from('bucket_items')
      .update({
        status: status === 'failed' ? 'failed' : status === 'complete' ? 'done' : 'in_progress',
        last_agent_id: agentId,
        last_update_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (itemErr) return res.status(500).json({ error: itemErr.message });
  }

  const { data, error } = await dbClient
    .from('agent_logs')
    .insert({
      bucket_id: bucket.id,
      bucket_item_id: itemId ?? null,
      agent_id: agentId,
      status,
      summary: summary ?? null,
      output,
      meta: meta ?? {},
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

app.get('/api/logs', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;
  const bucketId = req.query.bucketId as string | undefined;
  let query = dbClient.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(100);
  if (bucketId) query = query.eq('bucket_id', bucketId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});
