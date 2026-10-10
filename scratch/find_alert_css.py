import re

with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\astro_index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Find rules mentioning alert
rules = re.findall(r'([^{}]*alert[^{}]*\{[^{}]*\})', css, re.IGNORECASE)
print(f"Found {len(rules)} alert rules in CSS.")
for r in rules[:25]:
    print(r.strip())
    print("-" * 40)
