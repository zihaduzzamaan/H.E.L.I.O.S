import re

with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\astro_index.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Search for /alerts in routes or strings
routes = re.findall(r'["\']([^"\']*/alerts[^"\']*)["\']', text)
print("Routes with alerts:", set(routes))

# Find lines around /alerts
for m in re.finditer(r'/alerts', text):
    start = max(0, m.start() - 300)
    end = min(len(text), m.end() + 300)
    print("--- CONTEXT ---")
    print(text[start:end])
    print("=" * 50)
