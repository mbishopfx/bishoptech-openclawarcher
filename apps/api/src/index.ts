import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import mammoth from 'mammoth';

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

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

const idParamSchema = z.object({
  bucketId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
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

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function extractReadableFromHtml(html: string, url: string) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const reader = new Readability(doc).parse();
  const readerTitle = normalizeText(reader?.title);
  const readerText = normalizeText(reader?.textContent);

  if (readerText.length > 200) {
    return {
      title: readerTitle || normalizeText(doc.title) || url,
      text: readerText,
      method: 'readability',
    };
  }

  doc.querySelectorAll('script,style,noscript,svg,canvas,iframe').forEach((el) => el.remove());
  const contentRoot = doc.querySelector('main,article,[role="main"],.content,.markdown,.prose,.chat,.conversation') || doc.body;
  const fallbackText = normalizeText(contentRoot?.textContent);

  return {
    title: normalizeText(doc.title) || url,
    text: fallbackText,
    method: 'dom-fallback',
  };
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'OpenClaw-Agent-Command-Center/1.0',
      accept: 'text/html, text/plain, application/xhtml+xml, */*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status})`);
  }

  return res.text();
}

function asSimpleText(value: string | null | undefined) {
  const raw = value ?? '';
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    const dom = new JSDOM(raw);
    return normalizeText(dom.window.document.body.textContent);
  }
  return normalizeText(raw);
}

function getFileExtension(name: string | undefined) {
  if (!name) return '';
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx).toLowerCase();
}

async function extractTextFromUpload(file: Express.Multer.File) {
  const ext = getFileExtension(file.originalname);
  const mime = file.mimetype;

  if (mime === 'application/pdf' || ext === '.pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: file.buffer });

      try {
        const parsed = await parser.getText();
        const text = normalizeText(parsed.text);
        if (!text) throw new Error('PDF text extraction returned empty content');
        return text;
      } finally {
        await parser.destroy();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown PDF extraction error';
      throw new Error(`PDF extraction failed on this runtime: ${message}`);
    }
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    const text = normalizeText(result.value);
    if (!text) throw new Error('DOCX text extraction returned empty content');
    return text;
  }

  if (mime === 'application/msword' || ext === '.doc') {
    const bestEffort = normalizeText(file.buffer.toString('latin1').replace(/\u0000/g, ' '));
    if (!bestEffort) throw new Error('DOC extraction returned empty content');
    return bestEffort;
  }

  throw new Error('Unsupported file type. Upload PDF, DOC, or DOCX.');
}

async function scrapeToSimpleText(url: string): Promise<string> {
  let title = url;
  let text = '';
  let method = 'none';

  try {
    const html = await fetchText(url);
    const extracted = extractReadableFromHtml(html, url);
    title = extracted.title;
    text = extracted.text;
    method = extracted.method;
  } catch (error) {
    console.warn('Primary extraction failed:', error);
  }

  // Dynamic page fallback (works for many JS-rendered pages)
  if (text.length < 700) {
    try {
      const readerProxy = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
      const proxied = await fetchText(readerProxy);
      const proxiedText = normalizeText(proxied);
      if (proxiedText.length > text.length) {
        text = proxiedText;
        method = 'jina-reader';
      }
    } catch (error) {
      console.warn('Jina reader fallback failed:', error);
    }
  }

  if (!text) {
    text = `Content could not be fully extracted from this share URL at ingest time.\n\nSource URL: ${url}`;
    method = 'unresolved';
  }

  const clipped = text.slice(0, 60000);
  return `Title: ${title}\nSource: ${url}\nExtraction Method: ${method}\n\n${clipped}`;
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

app.get('/api/buckets/:bucketId/items', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;

  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success || !parsedParams.data.bucketId) {
    return res.status(400).json({ error: 'Invalid bucketId' });
  }

  const { data, error } = await dbClient
    .from('bucket_items')
    .select('*')
    .eq('bucket_id', parsedParams.data.bucketId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

app.delete('/api/bucket-items/:itemId', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;

  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success || !parsedParams.data.itemId) {
    return res.status(400).json({ error: 'Invalid itemId' });
  }

  const itemId = parsedParams.data.itemId;

  const { error: logsError } = await dbClient.from('agent_logs').delete().eq('bucket_item_id', itemId);
  if (logsError) return res.status(500).json({ error: logsError.message });

  const { error } = await dbClient.from('bucket_items').delete().eq('id', itemId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(204).send();
});

app.post('/api/buckets/:bucketId/rotate-endpoint', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;

  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success || !parsedParams.data.bucketId) {
    return res.status(400).json({ error: 'Invalid bucketId' });
  }

  const newEndpointKey = `oc_${nanoid(18)}`;

  const { data, error } = await dbClient
    .from('agent_buckets')
    .update({ endpoint_key: newEndpointKey })
    .eq('id', parsedParams.data.bucketId)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

app.delete('/api/buckets/:bucketId', async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;

  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success || !parsedParams.data.bucketId) {
    return res.status(400).json({ error: 'Invalid bucketId' });
  }

  const { error } = await dbClient.from('agent_buckets').delete().eq('id', parsedParams.data.bucketId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(204).send();
});

app.post('/api/buckets/:bucketId/ingest', upload.single('file'), async (req, res) => {
  if (!requireDb(res)) return;
  const dbClient = db!;
  const bucketId = req.params.bucketId;

  const stringField = (...values: unknown[]) => {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    return undefined;
  };

  const rawPayload = {
    text: stringField(req.body?.text, req.body?.rawText),
    sharedUrl: stringField(
      req.body?.sharedUrl,
      req.body?.shared_url,
      req.body?.sharedURL,
      req.body?.url,
      req.body?.link,
    ),
    source: stringField(req.body?.source),
    title: stringField(req.body?.title),
  };

  const parsed = ingestSchema.safeParse(rawPayload);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (!parsed.data.text && !parsed.data.sharedUrl && !req.file) {
    return res.status(400).json({ error: 'text, sharedUrl, or file is required' });
  }

  let normalized = parsed.data.text ?? '';
  let finalTitle = parsed.data.title ?? null;

  try {
    if (req.file) {
      const fileText = await extractTextFromUpload(req.file);
      normalized = `File: ${req.file.originalname}\n\n${fileText}`;
      if (!finalTitle) finalTitle = req.file.originalname;
    } else if (parsed.data.sharedUrl) {
      normalized = await scrapeToSimpleText(parsed.data.sharedUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to extract file content';
    return res.status(400).json({ error: message });
  }

  const { data, error } = await dbClient
    .from('bucket_items')
    .insert({
      bucket_id: bucketId,
      title: finalTitle,
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
  const format = String(req.query.format ?? 'text').toLowerCase();

  const { data: bucket, error: bucketError } = await dbClient
    .from('agent_buckets')
    .select('*')
    .eq('endpoint_key', endpointKey)
    .single();

  if (bucketError || !bucket) return res.status(404).json({ error: 'Bucket endpoint not found' });

  if (format === 'json') {
    const { data: items, error: itemsError } = await dbClient
      .from('bucket_items')
      .select('*')
      .eq('bucket_id', bucket.id)
      .in('status', ['queued', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(20);

    if (itemsError) return res.status(500).json({ error: itemsError.message });
    return res.json({ bucket, items });
  }

  const consume = req.query.consume !== 'false';

  const { data: items, error: itemsError } = await dbClient
    .from('bucket_items')
    .select('*')
    .eq('bucket_id', bucket.id)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(20);

  if (itemsError) return res.status(500).json({ error: itemsError.message });

  const payload = (items ?? [])
    .map((item) => asSimpleText(item.normalized_text || item.raw_text || ''))
    .filter(Boolean)
    .join('\n\n-----\n\n');

  if (consume && items && items.length > 0) {
    const itemIds = items.map((item) => item.id);
    const { error: deleteError } = await dbClient.from('bucket_items').delete().in('id', itemIds);
    if (deleteError) return res.status(500).json({ error: deleteError.message });
  }

  res.setHeader('content-type', 'text/plain; charset=utf-8');
  return res.status(200).send(payload);
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
