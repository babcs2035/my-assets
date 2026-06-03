#!/usr/bin/env bash
set -euo pipefail

# Load .env if present
[ -f .env ] && export $(grep -v '^#' .env | xargs) || true

# Export service account token if available (preferred on headless Linux)
if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  export OP_SERVICE_ACCOUNT_TOKEN
fi

if [ -z "${OP_VAULT:-}" ]; then
  echo "⚠️  OP_VAULT not set. Skipping."
  exit 0
fi

# Parse comma-separated OP_MF_ITEM_ID values into an array
if [ -z "${OP_MF_ITEM_ID:-}" ]; then
  echo "⚠️  OP_MF_ITEM_ID not set. Skipping."
  exit 0
fi

IFS=',' read -ra ITEM_IDS <<< "$OP_MF_ITEM_ID"

if [ ${#ITEM_IDS[@]} -eq 0 ]; then
  echo "⚠️  OP_MF_ITEM_ID is empty. Skipping."
  exit 0
fi

echo "Retrieving ${#ITEM_IDS[@]} item(s) from 1Password vault: $OP_VAULT"

# Clear temp file
> /tmp/op-secrets-item-tmp.json

for item_id in "${ITEM_IDS[@]}"; do
  # Trim whitespace
  item_id=$(echo "$item_id" | xargs)
  [ -z "$item_id" ] && continue

  echo "  Retrieving item: $item_id ..."

  if op item get "$item_id" --reveal --vault "$OP_VAULT" --format json > /tmp/op-secrets-tmp.json 2>&1; then
    # Output compact JSON (single line) so line-by-line reading works
    python3 -c "
import sys, json

d = json.load(sys.stdin)
fields = {}
for f in d.get('fields', []):
    label = f.get('label')
    if label and 'value' in f:
        fields[label] = f['value']

key = d.get('title') or d.get('id')
print(json.dumps({key: fields}))
" < /tmp/op-secrets-tmp.json >> /tmp/op-secrets-item-tmp.json
    echo "  ✅ Retrieved: $item_id"
  else
    echo "  ⚠️  Failed to retrieve: $item_id"
    rm -f /tmp/op-secrets-tmp.json
    continue
  fi
done

rm -f /tmp/op-secrets-tmp.json

# Combine all items into final JSON
if [ -f /tmp/op-secrets-item-tmp.json ]; then
  python3 -c "
import json

all_items = {}
with open('/tmp/op-secrets-item-tmp.json', 'r') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            all_items.update(item)
        except json.JSONDecodeError:
            pass

print(json.dumps({'items': all_items}, indent=2))
" < /tmp/op-secrets-item-tmp.json > op-secrets.json

  rm -f /tmp/op-secrets-item-tmp.json
  echo "✅ Generated op-secrets.json with ${#ITEM_IDS[@]} item(s)."
else
  echo "⚠️  No items were successfully retrieved."
  rm -f op-secrets.json
  exit 1
fi
