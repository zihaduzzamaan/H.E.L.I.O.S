with open(r'C:\Users\ZISHAN\.gemini\antigravity-ide\brain\9b288223-cd22-49cd-8439-77997b8d2813\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'astro_index.js' in line and 'curl' in line or 'wget' in line or 'fetch' in line or 'CommandLine' in line:
            print(line[:400])
