#!/usr/bin/env bash
set -euo pipefail

# The temporary files hold passwords and TOTP secrets: create them readable by this user only
umask 077

# Load .env if present. Sourcing keeps values with spaces or quotes intact (export $(... | xargs) split them)
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi

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

# 出力先は docker-compose(.yml) がマウントする data/runtime/op-secrets.json と揃える
OUTPUT_DIR=data/runtime
OUTPUT_FILE="$OUTPUT_DIR/op-secrets.json"

work_dir=$(mktemp -d)
output_tmp=""
cleanup() {
  rm -rf "$work_dir"
  [ -n "$output_tmp" ] && rm -f "$output_tmp"
  return 0
}
trap cleanup EXIT

items_file="$work_dir/items.jsonl"
: > "$items_file"
failed_count=0

echo "Retrieving ${#ITEM_IDS[@]} item(s) from 1Password vault: $OP_VAULT"

for item_id in "${ITEM_IDS[@]}"; do
  # Trim whitespace
  item_id=$(echo "$item_id" | xargs)
  [ -z "$item_id" ] && continue

  echo "  Retrieving item: $item_id ..."

  # stderr goes to its own file so op's messages cannot end up in the JSON
  if op item get "$item_id" --reveal --vault "$OP_VAULT" --format json > "$work_dir/item.json" 2> "$work_dir/op-error.log"; then
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
" < "$work_dir/item.json" >> "$items_file"
    echo "  ✅ Retrieved: $item_id"
  else
    echo "  ⚠️  Failed to retrieve: $item_id: $(cat "$work_dir/op-error.log")"
    failed_count=$((failed_count + 1))
  fi
done

# Same rule as the deploy workflow: a partial file would only fail later, at the next sync
if [ "$failed_count" -gt 0 ]; then
  echo "❌ Failed to retrieve $failed_count item(s). Keeping the existing $OUTPUT_FILE."
  exit 1
fi

# The file stays 0644 so uid 1001 in the container can read the bind mount; the 0700 directory keeps other users out
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"

# Write next to the target and rename, so an interrupted run cannot leave a broken file
output_tmp=$(mktemp "$OUTPUT_DIR/.op-secrets.XXXXXX")
python3 -c "
import json, sys

all_items = {}
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    all_items.update(json.loads(line))

print(json.dumps({'items': all_items}, indent=2))
" < "$items_file" > "$output_tmp"
chmod 644 "$output_tmp"
mv "$output_tmp" "$OUTPUT_FILE"
output_tmp=""

echo "✅ Generated $OUTPUT_FILE with ${#ITEM_IDS[@]} item(s)."
