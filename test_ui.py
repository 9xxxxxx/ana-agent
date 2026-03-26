import time

try:
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover - optional dependency for manual UI script
    sync_playwright = None

def run():
    if sync_playwright is None:
        print("playwright 未安装，跳过 UI 脚本。")
        return
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})
        
        print("Navigating to app...")
        page.goto("http://localhost:3000")
        page.wait_for_load_state('networkidle')
        time.sleep(2)  # wait for animations
        
        # 截取首页整体 UI
        page.screenshot(path="C:\\Users\\26375\\.gemini\\antigravity\\brain\\8571431b-d36b-494f-a2df-0125be23ca76\\final_ui_main.png")
        print("Captured main UI")
        
        # 点击打开数据库连接面板
        try:
            page.locator("text=数据表连接参数").click()
            time.sleep(1)
            page.screenshot(path="C:\\Users\\26375\\.gemini\\antigravity\\brain\\8571431b-d36b-494f-a2df-0125be23ca76\\final_ui_db_panel.png")
            print("Captured DB Panel")
            page.keyboard.press("Escape")
            time.sleep(1)
        except Exception as e:
            print("Could not open DB panel:", e)

        # 尝试生成一条图表看看（如果有历史记录点击即可，没有就发送一条）
        try:
            # 找到历史记录里的带有"图表"或者随便一个点击
            history_items = page.locator(".sidebar-scroller .group\\/item").all()
            if history_items:
                history_items[0].click()
                time.sleep(3)
                page.screenshot(path="C:\\Users\\26375\\.gemini\\antigravity\\brain\\8571431b-d36b-494f-a2df-0125be23ca76\\final_ui_chat.png")
                print("Captured Chat UI")
                
                # 点击图表设置
                settings_btn = page.locator("button:has-text('外观配色')").first
                if settings_btn.is_visible():
                    settings_btn.click()
                    time.sleep(1)
                    page.screenshot(path="C:\\Users\\26375\\.gemini\\antigravity\\brain\\8571431b-d36b-494f-a2df-0125be23ca76\\final_ui_chart_panel.png")
                    print("Captured Chart Panel")
        except Exception as e:
            print("Could not interact with chat:", e)
            
        browser.close()

if __name__ == "__main__":
    run()
