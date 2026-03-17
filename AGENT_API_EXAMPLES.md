# OpenClaw Agent API Examples

## 1) Fetch queued work (plain text + consume)

```bash
curl "$API_BASE/api/agent/fetch/$ENDPOINT_KEY?format=text&consume=true"
```

This returns simple extracted text chunks. Any fetched chunks are deleted after pickup.

## 2) Report progress/completion

```bash
curl -X POST "$API_BASE/api/agent/report" \
  -H "content-type: application/json" \
  -d '{
    "endpointKey": "oc_xxxxx",
    "agentId": "claw-macbook-01",
    "itemId": "<bucket-item-id>",
    "status": "complete",
    "summary": "Built landing page MVP",
    "output": "All tasks complete. PR opened.",
    "meta": { "branch": "feature/landing" }
  }'
```

## 3) Cron snippet (OpenClaw)

Use this in a scheduled task to pull dashboard instructions and push back completion logs:

```bash
API_BASE="https://your-railway-api.up.railway.app"
ENDPOINT_KEY="oc_xxxxx"
AGENT_ID="claw-macbook-01"

ITEMS_JSON=$(curl -s "$API_BASE/api/agent/fetch/$ENDPOINT_KEY")
# parse ITEMS_JSON in your script and execute items...

curl -s -X POST "$API_BASE/api/agent/report" \
  -H "content-type: application/json" \
  -d "{\"endpointKey\":\"$ENDPOINT_KEY\",\"agentId\":\"$AGENT_ID\",\"status\":\"working\",\"output\":\"Heartbeat report\"}"
```
