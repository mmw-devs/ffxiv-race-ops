#!/bin/bash
# lark-cli 飞书 Bot — 事件守护 + 自动回复
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CLI=$(find "$PROJECT_DIR/.pi/npm/node_modules/@larksuite" -name "lark-cli" -type f | head -1)
[ -z "$CLI" ] && { echo "[bot] lark-cli 未找到"; exit 1; }

export HTTP_PROXY="${HTTP_PROXY:-http://172.28.176.1:7890}"
export HTTPS_PROXY="${HTTPS_PROXY:-http://172.28.176.1:7890}"
"$CLI" profile use ffxiv-bot >/dev/null 2>&1

for p in $(pgrep -f "lark-cli.*event consume" 2>/dev/null); do
  [ "$p" != "$$" ] && kill "$p" 2>/dev/null
done
sleep 1

echo "[bot] 启动..."

"$CLI" event consume im.message.receive_v1 --as bot < <(tail -f /dev/null) 2>/dev/null \
| python3 -c "
import sys, json, subprocess, os
cli = '$CLI'
env = os.environ.copy()
env['HTTP_PROXY'] = 'http://172.28.176.1:7890'
env['HTTPS_PROXY'] = 'http://172.28.176.1:7890'
for line in sys.stdin:
    line = line.strip()
    if not line.startswith('{'): continue
    evt = json.loads(line)
    cid = evt.get('chat_id',''); txt = evt.get('content','')
    if not cid or not txt: continue
    print(f'[bot] {txt}', flush=True)
    body = json.dumps({'receive_id':cid,'msg_type':'text','content':json.dumps({'text':f'收到:{txt}'})})
    r = subprocess.run([cli,'api','POST','/open-apis/im/v1/messages',
        '--params','{\"receive_id_type\":\"chat_id\"}',
        '--data',body], env=env, capture_output=True, text=True)
    print(f'[bot] reply={\"OK\" if \"ok\" in r.stdout[:50] else \"FAIL\"}', flush=True)
"
