import urllib.request
import re
from bs4 import BeautifulSoup

urls = [
    "https://open.feishu.cn/document/feishu-cards/card-json-v2-structure",
    "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/chart",
    "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text",
    "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/table",
    "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/multi-image-laylout"
]

def fetch_and_extract(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        
        # We know it's a JS rendered page, but maybe the initial state has some JSON
        # Let's search for "window.INITIAL_STATE =" or similar, or just dump all text inside <script>
        
        # A simple regex to find JSON-like blocks that mention "tag"
        blocks = re.findall(r'(\{\s*"tag"\s*:\s*"[^"]+".*?\})', html, re.DOTALL)
        if blocks:
            print(f"--- {url} ---")
            for b in blocks[:2]:
                print(b[:200] + '...')
        else:
            print(f"--- {url} --- No obvious JSON blocks found.")
            
    except Exception as e:
        print(f"Error fetching {url}: {e}")

for u in urls:
    fetch_and_extract(u)
