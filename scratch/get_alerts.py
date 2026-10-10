import urllib.request
import os

url = "https://astro-doc-x-app.vercel.app/assets/AlertsPage-DxduW4u0.js"
out_path = r"C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\AlertsPage.js"

try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        content = res.read().decode('utf-8')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully downloaded AlertsPage.js! Length:", len(content))
except Exception as e:
    print("Download failed:", e)
