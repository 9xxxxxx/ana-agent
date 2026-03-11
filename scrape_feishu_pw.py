import asyncio
from playwright.async_api import async_playwright
import json
import re

urls = {
    "image": "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/image",
    "multi_image": "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/multi-image-laylout",
    "rich_text": "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text",
    "title": "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/title",
    "plain_text": "https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/plain-text"
}

async def fetch_json_snippets():
    results = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for name, url in urls.items():
            page = await browser.new_page()
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                # Scroll down a bit to trigger lazy loading if any
                await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
                await page.wait_for_timeout(2000)
                
                # Extract pre codes
                code_blocks = await page.locator("pre").all_text_contents()
                # Find JSON structures with "tag"
                snippets = []
                for b in code_blocks:
                    if '"tag"' in b or '"text"' in b or '"content"' in b:
                        snippets.append(b)
                results[name] = snippets
            except Exception as e:
                results[name] = [f"Error: {e}"]
            finally:
                await page.close()
        await browser.close()
        
    with open("feishu_v2_snippets.txt", "w", encoding="utf-8") as f:
        for name, snippets in results.items():
            f.write(f"\n{'='*50}\n--- {name} ---\n{'='*50}\n")
            for i, snippet in enumerate(snippets[:3]):
                f.write(f"Snippet {i+1}:\n{snippet}\n")
                
if __name__ == "__main__":
    asyncio.run(fetch_json_snippets())
