"""Regenerate docs/screenshots/*.png against a locally running app (pnpm dev).

    pip install playwright && playwright install chromium
    LYNX_JOB=<a completed job id> python docs/shoot.py
"""
import os, time
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT, exist_ok=True)
BASE = os.environ.get("LYNX_BASE", "http://localhost:3000")
JOB = os.environ.get("LYNX_JOB", "a836922b-77bd-47fa-8b2a-554007b10ad9")  # a completed run
VW, VH = 1512, 850

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": VW, "height": VH}, device_scale_factor=2, color_scheme="dark")

        # 1. landing
        pg.goto(BASE, wait_until="networkidle")
        time.sleep(1.5)
        pg.screenshot(path=f"{OUT}/01-landing.png")
        print("landing ok")

        # 2. dashboard (wait for site preview screenshot to load)
        pg.goto(f"{BASE}/research/{JOB}", wait_until="networkidle")
        time.sleep(5)
        pg.screenshot(path=f"{OUT}/02-dashboard.png")
        print("dashboard ok")

        # 5. key people card (element crop) — while on dashboard
        try:
            card = pg.locator('section:has(h3:has-text("Key People"))').first
            card.scroll_into_view_if_needed()
            time.sleep(0.5)
            card.screenshot(path=f"{OUT}/05-key-people.png")
            print("key-people ok")
        except Exception as e:
            print("key-people fail", e)

        # 3. graph
        pg.get_by_role("button", name="Graph", exact=True).click()
        time.sleep(6)  # let the force sim settle + zoom-to-fit
        pg.screenshot(path=f"{OUT}/03-graph.png")
        print("graph ok")

        # 4. documentary
        pg.get_by_role("button", name="Documentary", exact=True).click()
        time.sleep(3)
        pg.screenshot(path=f"{OUT}/04-documentary.png")
        print("documentary ok")

        # 6. config keys panel (landing)
        pg.goto(BASE, wait_until="networkidle")
        time.sleep(1)
        pg.get_by_role("button", name="Model & options").click()
        time.sleep(0.6)
        pg.get_by_role("button", name="Configure keys").click()
        time.sleep(1.2)
        pg.screenshot(path=f"{OUT}/06-config-keys.png")
        print("config ok")

        # 7-8. the public surfaces: docs and about
        for name, path in (("07-docs", "/docs/architecture"), ("08-about", "/about")):
            pg.goto(f"{BASE}{path}", wait_until="networkidle")
            time.sleep(1)
            pg.screenshot(path=f"{OUT}/{name}.png")
            print(name, "ok")

        b.close()

run()
print("DONE")
