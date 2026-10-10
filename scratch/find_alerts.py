import re

with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\astro_index.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Look for route paths or page components
paths = set(re.findall(r'path:\s*["\']([^"\']+)["\']', text))
print("Paths found:", paths)

# Search for alert-related components / sections / classes
matches = re.findall(r'(\b[a-zA-Z0-9_-]*(?:alert|Alert)[a-zA-Z0-9_-]*\b)', text)
print("Alert tokens:", set(matches[:30]))

# Search for matches with /app/
app_routes = set(re.findall(r'["\'](/app/[^"\']*)["\']', text))
print("App routes:", app_routes)
