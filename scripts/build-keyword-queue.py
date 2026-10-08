"""Builds keyword_queue.json: the ranked list the daily publishing task works through.

Source: Ubersuggest (US, en), pulled 2026-10-08. Rerun after editing SEEDS:
    python scripts/build-keyword-queue.py

opportunity_score = volume / max(difficulty, 5). The task always takes the first
entry with "used": false. Existing `used` flags are preserved on rebuild.

type tells the generator what page shape to produce (see PUBLISHING.md):
  traditional  a known traditional prayer exists, lead with it (traditional.text)
  psalm        full KJV psalm as traditional.text + meaning + prayer
  novena       nine `days`
  verses       bible-verses page, KJV `verses` required
  prayer       original prayer(s) + context
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "keyword_queue.json"

# (keyword, volume, difficulty, category, type, secondary keywords)
SEEDS = [
    ("psalm 91", 673000, 17, "psalms", "psalm", ["psalm 91 king james", "king james psalm 91", "prayers psalm 91"]),
    ("psalm 121", 135000, 51, "psalms", "psalm", ["king james psalm 121", "psalm 121 kjv"]),
    ("psalm 23", 673000, 63, "psalms", "psalm", ["psalm 23 king james", "psalm 23 in kjv", "lord is my shepherd psalm 23"]),
    ("psalm 35", 90500, 35, "psalms", "psalm", []),
    ("psalm 27", 135000, 62, "psalms", "psalm", ["psalm 27 king james version"]),
    ("psalm 46", 40500, 59, "psalms", "psalm", ["psalm 46 10", "psalm 46 1"]),
    ("psalm 103", 49500, 33, "psalms", "psalm", []),
    ("psalm 34", 60500, 65, "psalms", "psalm", ["psalm 34 18"]),
    ("psalm 139", 74000, 71, "psalms", "psalm", ["psalm 139 14"]),
    ("psalm 100", 49500, 61, "psalms", "psalm", []),
    ("psalm 22", 60500, 45, "psalms", "psalm", []),
    ("bible verses about encouragement", 135000, 27, "bible-verses", "verses", []),
    ("bible verses about healing", 49500, 25, "bible-verses", "verses", ["kjv bible verses about healing", "bible verses about healing the sick"]),
    ("bible verses about friendship", 49500, 27, "bible-verses", "verses", []),
    ("bible verses about relationships", 27100, 24, "bible-verses", "verses", ["bible verses about relationship"]),
    ("bible verses about fruit of the spirit", 33100, 18, "bible-verses", "verses", []),
    ("bible verses about forgiveness", 33100, 32, "bible-verses", "verses", []),
    ("bible verses about being thankful", 22200, 18, "bible-verses", "verses", ["bible verses about thankfulness", "bible verses about thanksgiving"]),
    ("bible verses about trust in god", 14800, 16, "bible-verses", "verses", ["bible verses about trusting god"]),
    ("bible verses about prayer", 18100, 21, "bible-verses", "verses", ["bible verses about praying", "bible verses about prayers"]),
    ("bible verses about grief", 18100, 22, "bible-verses", "verses", ["bible verses about death", "bible verses about death of loved ones"]),
    ("bible verses about hope", 18100, 24, "bible-verses", "verses", []),
    ("bible verses about life", 18100, 22, "bible-verses", "verses", []),
    ("bible verses about mothers", 18100, 16, "bible-verses", "verses", ["bible verses about mother's"]),
    ("bible verses about protection", 18100, 34, "bible-verses", "verses", []),
    ("bible verses about marriage", 27100, 31, "bible-verses", "verses", ["love bible verses about marriage"]),
    ("bible verses about communion", 33100, 32, "bible-verses", "verses", []),
    ("bible verses about joy", 12100, 20, "bible-verses", "verses", []),
    ("bible verses about peace", 12100, 24, "bible-verses", "verses", []),
    ("bible verses about family", 12100, 34, "bible-verses", "verses", []),
    ("bible verses about humility", 12100, 25, "bible-verses", "verses", []),
    ("bible verses about the holy spirit", 9900, 34, "bible-verses", "verses", []),
    ("bible verses about a broken heart", 9900, 10, "bible-verses", "verses", []),
    ("bible verses about anger", 9900, 11, "bible-verses", "verses", []),
    ("bible verses for athletes", 9900, 11, "bible-verses", "verses", ["bible verses about athletes", "bible verses about sports"]),
    ("bible verses about hard work", 9900, 10, "bible-verses", "verses", ["bible verses about working hard"]),
    ("bible verses about loving your enemies", 6600, 7, "bible-verses", "verses", []),
    ("divine mercy novena", 14800, 10, "novenas", "novena", ["divine of mercy novena"]),
    ("novena to st jude", 18100, 11, "novenas", "novena", ["novena of st jude", "novena to saint jude"]),
    ("novena of surrender", 27100, 22, "novenas", "novena", []),
    ("mary undoer of knots novena", 5400, 7, "novenas", "novena", ["mary who unties knots novena"]),
    ("novena to saint joseph", 9900, 16, "novenas", "novena", ["novena st joseph", "novena to st joseph"]),
    ("novena of the miraculous medal", 5400, 10, "novenas", "novena", ["novena of miraculous medal"]),
    ("st peregrine novena", 4400, 16, "novenas", "novena", ["novena st peregrine"]),
    ("sacred heart novena", 6600, 26, "novenas", "novena", ["novena to the sacred heart of jesus"]),
    ("st therese novena", 6600, 26, "novenas", "novena", ["novena of st therese", "st therese of lisieux novena"]),
    ("54 day rosary novena", 5400, 29, "novenas", "novena", ["rosary novena 54 day"]),
    ("mother of perpetual help novena", 5400, 22, "novenas", "novena", ["novena mother perpetual help"]),
    ("st andrew christmas novena", 5400, 24, "novenas", "novena", ["novena st andrew"]),
    ("st anne novena", 4400, 31, "novenas", "novena", ["novena for st anne"]),
    ("what is a novena", 4400, 8, "novenas", "prayer", ["novena what is it", "pray a novena"]),
    ("chaplet of divine mercy", 49500, 21, "saint-prayers", "traditional", ["prayer for divine mercy chaplet", "rosary divine mercy"]),
    ("prayer to saint anthony", 14800, 14, "saint-prayers", "traditional", ["prayer to saint anthony for lost things", "unfailing prayer to saint anthony"]),
    ("prayer to saint padre pio", 14800, 17, "saint-prayers", "traditional", ["padre pio prayer for healing"]),
    ("prayer to saint raphael the archangel", 9900, 13, "saint-prayers", "traditional", ["prayer to saint raphael", "prayer to saint raphael for healing"]),
    ("prayer to the holy spirit", 12100, 9, "saint-prayers", "traditional", ["prayer for the holy spirit", "come holy spirit prayer"]),
    ("prayer to saint jude", 27100, 25, "saint-prayers", "traditional", ["prayer for st jude"]),
    ("prayer to saint joseph", 3600, 35, "saint-prayers", "traditional", ["prayer to saint joseph to sell house", "ancient prayer to saint joseph"]),
    ("prayer to saint gabriel the archangel", 3600, 18, "saint-prayers", "traditional", ["prayer to saint gabriel"]),
    ("prayer to saint dymphna", 3600, 21, "saint-prayers", "traditional", []),
    ("prayer to saint rita", 3600, 26, "saint-prayers", "traditional", ["prayer to saint rita for impossible cases"]),
    ("prayer to saint joseph of cupertino", 3600, 17, "saint-prayers", "traditional", []),
    ("prayer to saint benedict", 1300, 10, "saint-prayers", "traditional", ["prayer to saint benedict for protection"]),
    ("prayer to saint christopher", 880, 15, "saint-prayers", "traditional", []),
    ("prayer to saint anne", 1600, 13, "saint-prayers", "traditional", []),
    ("prayer to saint monica", 1900, 33, "saint-prayers", "traditional", []),
    ("prayer to saint lucy", 1900, 29, "saint-prayers", "traditional", []),
    ("act of contrition", 33100, 47, "saint-prayers", "traditional", ["prayer for contrition", "catholic prayers act of contrition"]),
    ("hail mary prayer", 135000, 44, "saint-prayers", "traditional", ["prayer for hail mary"]),
    ("prayer before confession", 3600, 13, "saint-prayers", "traditional", ["catholic prayers for confession"]),
    ("catholic prayers for night", 9900, 8, "night-prayer", "prayer", ["catholic prayers before bed", "catholic prayers before sleep"]),
    ("short prayer before bed", 4400, 7, "night-prayer", "prayer", ["night prayer before sleep", "prayer before bed"]),
    ("prayer for good night", 14800, 13, "night-prayer", "prayer", []),
    ("catholic morning prayers", 27100, 25, "morning-prayer", "prayer", ["catholic prayers for morning", "catholic prayer for morning"]),
    ("catholic prayer before meals", 8100, 11, "morning-prayer", "traditional", ["catholic prayer before eating", "simple prayer before meals", "grace prayer before meal"]),
    ("prayer for thanksgiving", 22200, 26, "morning-prayer", "prayer", ["prayer for thanksgiving day", "catholic prayers of thanksgiving"]),
    ("prayer before work", 2400, 32, "morning-prayer", "prayer", []),
    ("prayer for birthday", 9900, 23, "morning-prayer", "prayer", []),
    ("prayer for strength", 60500, 26, "peace-prayer", "prayer", ["prayer for the strength"]),
    ("prayer for forgiveness of sins", 22200, 14, "peace-prayer", "prayer", ["prayer for repentance", "prayer for sinners"]),
    ("prayer for intercession", 14800, 18, "peace-prayer", "prayer", ["prayer for interceding"]),
    ("prayer for peacefulness", 22200, 25, "peace-prayer", "prayer", []),
    ("prayer for salvation", 14800, 27, "peace-prayer", "prayer", ["sinners prayer for salvation"]),
    ("prayer for fasting", 9900, 41, "peace-prayer", "prayer", []),
    ("prayer for a family", 18100, 11, "protection-prayer", "prayer", ["catholic prayers family"]),
    ("prayer for safe travel", 9900, 8, "protection-prayer", "prayer", ["prayer for travel safe"]),
    ("prayer before surgery", 12100, 33, "healing-prayer", "prayer", ["prayer before operation", "prayer for the operation"]),
    ("prayer for miracles", 12100, 21, "healing-prayer", "prayer", []),
    ("prayer for a friend", 12100, 18, "healing-prayer", "prayer", ["prayer for friends"]),
    ("catholic prayers for the dead", 8100, 35, "healing-prayer", "traditional", ["prayer for the death"]),
    ("prayer before reading the bible", 2400, 23, "bible-verses", "prayer", []),
    # Upgrades of pages that already exist: publish with the SAME slug + category.
    ("prayer to saint michael the archangel", 135000, 34, "protection-prayer", "traditional", ["the prayer to saint michael", "prayer to saint michael catholic"]),
    ("bible verses about love", 165000, 27, "bible-verses", "verses", []),
    ("bible verses about strength", 90500, 37, "bible-verses", "verses", ["bible verses about strength in hard times"]),
    ("bible verses about anxiety", 49500, 19, "bible-verses", "verses", ["bible verses about worrying", "bible verses about worry"]),
]

UPGRADES = {
    "prayer to saint michael the archangel": "saint-michael-prayer",
    "bible verses about love": "bible-verses-about-love",
    "bible verses about strength": "bible-verses-about-strength",
    "bible verses about anxiety": "bible-verses-about-anxiety",
}


def slugify(k):
    return re.sub(r"[^a-z0-9]+", "-", k.lower()).strip("-")


def main():
    used = {}
    if OUT.exists():
        used = {e["keyword"]: e.get("used", False) for e in json.loads(OUT.read_text(encoding="utf-8"))}
    out, seen = [], set()
    for k, vol, sd, cat, typ, sec in SEEDS:
        if k in seen:
            continue
        seen.add(k)
        e = {
            "keyword": k,
            "volume": vol,
            "difficulty": sd,
            "opportunity_score": round(vol / max(sd, 5), 1),
            "category": cat,
            "type": typ,
            "secondary_keywords": sec,
            "slug_hint": UPGRADES.get(k, slugify(k)),
            "upgrade": k in UPGRADES,
            "used": used.get(k, False),
        }
        out.append(e)
    out.sort(key=lambda e: -e["opportunity_score"])
    for i, e in enumerate(out, 1):
        e["queue_position"] = i
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(out)} keywords -> {OUT.name}")
    for e in out[:12]:
        print(f'{e["queue_position"]:>3} {e["opportunity_score"]:>9} {e["category"]:<18} {e["type"]:<12} {e["keyword"]}')


if __name__ == "__main__":
    main()
