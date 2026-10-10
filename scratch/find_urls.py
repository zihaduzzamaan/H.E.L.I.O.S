import re

with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\astro_index.js', 'r', encoding='utf-8') as f:
    text = f.read()

urls = set(re.findall(r'https?://[a-zA-Z0-9_\-\./]+', text))
print("URLs in astro_index.js:")
for u in urls:
    print(u)
