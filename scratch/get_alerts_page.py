import urllib.request
import json
import os

url = "https://astrodocx.com/assets/AlertsPage-DxduW4u0.js" # let's test if astrodocx.com or similar was the origin
print("Checking target website...")
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        content = res.read().decode('utf-8')
        with open('scratch/AlertsPage.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully downloaded AlertsPage.js! Length:", len(content))
except Exception as e:
    print("Could not download from astrodocx.com:", e)
