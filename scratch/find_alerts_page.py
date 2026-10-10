import re

with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\astro_index.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Find occurrences of AlertsPage
for m in re.finditer(r'AlertsPage', text):
    start = max(0, m.start() - 200)
    end = min(len(text), m.end() + 1500)
    print("--- MATCH AT", m.start(), "---")
    print(text[start:end])
    print("\n" + "="*50 + "\n")
