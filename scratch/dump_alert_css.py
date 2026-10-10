import re

with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\scratch\astro_index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Find the block around alert-list
pos = css.find('.alert-list')
if pos != -1:
    print(css[pos-100:pos+2500])
