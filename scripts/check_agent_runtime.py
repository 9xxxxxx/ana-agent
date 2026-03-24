import json
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

MODEL = sys.argv[1]
DATABASE_URL = sys.argv[2]
BASE = "http://localhost:8000"


def fetch(url, payload=None, timeout=180):
    data = None
    headers = {}
    method = "GET"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_sse(text):
    events = []
    current = {"event": "message", "data": ""}
    for line in text.splitlines():
        if not line.strip():
            if current["data"] or current["event"] != "message":
                events.append(current)
            current = {"event": "message", "data": ""}
            continue
        if line.startswith("event:"):
            current["event"] = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data = line.split(":", 1)[1].strip()
            current["data"] = current["data"] + ("\n" if current["data"] else "") + data
    if current["data"] or current["event"] != "message":
        events.append(current)
    return events


def assert_ok(name, condition, detail):
    if condition:
        print(f"[PASS] {name}: {detail}")
    else:
        print(f"[FAIL] {name}: {detail}")
        raise SystemExit(1)


health = json.loads(fetch(f"{BASE}/api/health", timeout=30))
assert_ok("health", health.get("status") == "ok", health)

model_resp = json.loads(fetch(
    f"{BASE}/api/models/test",
    {"model": MODEL},
    timeout=120,
))
assert_ok("model", model_resp.get("success") is True, model_resp)

db_resp = json.loads(fetch(
    f"{BASE}/api/db/test",
    {"url": DATABASE_URL},
    timeout=60,
))
assert_ok("database", db_resp.get("success") is True, db_resp)

cases = [
    ("list tables", "当前数据库有哪些表？", ["list_tables_tool"]),
    ("describe table", "请描述 public.movies 表的结构。", ["describe_table_tool"]),
    ("nl query", "public.movies 表有多少行？", ["describe_table_tool", "run_sql_query_tool"]),
    ("analysis", "如果我要分析电影相关数据，应该优先看哪些表？请给出理由。", ["list_tables_tool"]),
]

for index, (label, prompt, expected_tools) in enumerate(cases, start=1):
    thread_id = f"regression-{int(time.time() * 1000)}-{index}"
    body = fetch(
        f"{BASE}/api/chat",
        {
            "message": prompt,
            "thread_id": thread_id,
            "model": MODEL,
            "database_url": DATABASE_URL,
        },
        timeout=240,
    )
    events = parse_sse(body)
    tool_names = [json.loads(event["data"])["name"] for event in events if event["event"] == "tool_start"]
    errors = [event["data"] for event in events if event["event"] == "error"]
    final_text = "".join(json.loads(event["data"]).get("content", "") for event in events if event["event"] == "token")
    assert_ok(f"{label}-no-error", len(errors) == 0, errors or "ok")
    assert_ok(f"{label}-tools", tool_names == expected_tools, tool_names)
    assert_ok(f"{label}-answer", bool(final_text.strip()), final_text[:200])

print("")
print("Agent regression checks passed.")
