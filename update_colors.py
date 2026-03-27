import json, os, time

d = {"colors": [], "sequences": []}
if os.path.exists("config.json"):
    with open("config.json", "r") as f:
        try:
            d = json.load(f)
        except:
            pass

bs = [
    {"name": "Red", "hex": "#ff0000", "rgb": {"r": 255, "g": 0, "b": 0}},
    {"name": "Orange", "hex": "#ff8800", "rgb": {"r": 255, "g": 136, "b": 0}},
    {"name": "Yellow", "hex": "#ffff00", "rgb": {"r": 255, "g": 255, "b": 0}},
    {"name": "Green", "hex": "#00ff00", "rgb": {"r": 0, "g": 255, "b": 0}},
    {"name": "Cyan", "hex": "#00ffff", "rgb": {"r": 0, "g": 255, "b": 255}},
    {"name": "Blue", "hex": "#0000ff", "rgb": {"r": 0, "g": 0, "b": 255}},
    {"name": "Purple", "hex": "#8800ff", "rgb": {"r": 136, "g": 0, "b": 255}},
    {"name": "Pink", "hex": "#ff00ff", "rgb": {"r": 255, "g": 0, "b": 255}},
    {"name": "White", "hex": "#ffffff", "rgb": {"r": 255, "g": 255, "b": 255}}
]

for b in bs:
    if not any(c.get("name") == b["name"] for c in d.get("colors", [])):
        b["id"] = f"c_{int(time.time() * 1000)}_{b['name']}"
        time.sleep(0.01) # to ensure unique IDs
        d["colors"].append(b)

with open("config.json", "w") as f:
    json.dump(d, f, indent=4)
