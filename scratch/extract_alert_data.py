import re

with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\astro_index.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Search for alert definitions / mock alerts / actions
matches = re.findall(r'(\{[^{}]*["\']why["\'][^{}]*\})', text)
print(f"Matches for 'why': {len(matches)}")
for m in matches[:10]:
    print(m)
    print("-" * 50)

# Search for checklist / steps
step_matches = re.findall(r'(\{[^{}]*["\']steps["\'][^{}]*\})', text)
print(f"Matches for 'steps': {len(step_matches)}")
for m in step_matches[:10]:
    print(m)
    print("-" * 50)
