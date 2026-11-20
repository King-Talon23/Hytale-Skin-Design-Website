# Writes site/app/scene-data.js: which game files the in-game backgrounds and the move set pieces are built from.
# Everything is read from the game's own definitions in Assets.zip (block textures, models, tints, tree prefabs), so the
# site draws them the way the game does. The output holds only file paths, names and colours, never game art.
# Run: python -I dev/make-scene-data.py "<path to Assets.zip>"
import json, sys, zipfile, os

z = zipfile.ZipFile(sys.argv[1]); names = z.namelist()
ITEMS = {p.split('/')[-1][:-5]: p for p in names if p.startswith('Server/Item/Items/') and p.endswith('.json')}

def item(name):
    d = json.loads(z.read(ITEMS[name]))
    if d.get('Parent') and d['Parent'] in ITEMS:   # a block that copies another one and changes a few keys
        base = item(d['Parent']); bt = {**base.get('BlockType', {}), **d.get('BlockType', {})}; d = {**base, **d, 'BlockType': bt}
    return d

def block(name):
    bt = item(name).get('BlockType', {}); out = {}
    if bt.get('CustomModel'):
        tx = bt.get('CustomModelTexture') or []
        out = {'model': bt['CustomModel'], 'tex': [t['Texture'] for t in tx]}
    elif bt.get('Textures'):
        t = bt['Textures'][0]
        side = t.get('Sides') or t.get('All'); top = t.get('Up') or t.get('UpDown') or t.get('All'); bottom = t.get('Down') or t.get('UpDown') or t.get('All')
        tops = [x.get('Up') or x.get('UpDown') or x.get('All') for x in bt['Textures']]
        out = {'cube': {'side': side, 'top': sorted(set(tops)) if len(set(tops)) > 1 else top, 'bottom': bottom}}
        if bt.get('TextureSideMask'): out['cube']['sideMask'] = bt['TextureSideMask']
        if bt.get('BiomeTintUp'): out['tintUp'] = True
    if bt.get('Tint'): out['tint'] = bt['Tint'][0] if isinstance(bt['Tint'], list) else bt['Tint']
    return out

def first(prefix):   # the first prefab of a tree stage, in the game's own numbering
    for root in ('Server/Prefabs/Orbis/Trees/', 'Server/Prefabs/Trees/'):   # most trees live under Orbis, a few (Jungle) only in the older folder
        found = sorted(p for p in names if p.startswith(root + prefix) and p.endswith('.prefab.json'))
        if found: return found[0]
    raise KeyError('no tree prefab ' + prefix)

SCENES = {
    'meadow': {'name': 'Meadow', 'weather': 'Server/Weathers/Zone1/Zone1_Sunny.json', 'tintFrom': 'Server/HytaleGenerator/Biomes/Plains1/Plains1_Oak.json',
               'ground': 'Soil_Grass', 'under': 'Soil_Dirt', 'hills': 2,
               # Plains1_Oak_Grasses, Plains1_Hills_Flowers and Plains1_Oak_Trees: what grows on the game's oak plains
               'plants': [['Plant_Grass_Lush_Short', 30, 1], ['Plant_Grass_Sharp', 24, 2], ['Plant_Grass_Sharp_Tall', 10], ['Plant_Grass_Sharp_Wild', 4], ['Plant_Flower_Common_Red2', 2, 1], ['Plant_Flower_Common_Cyan2', 2, 1]], 'density': 0.45,
               'trees': [first('Oak/Stage_4/'), first('Oak/Stage_3/'), first('Beech/Stage_2/')]},
    'desert': {'name': 'Desert', 'weather': 'Server/Weathers/Zone2/Zone2_Sunny.json', 'ground': 'Soil_Sand', 'under': 'Soil_Sand', 'hills': 2,
               # Desert1 stacks and rivers: dry grass, arid bushes, dead trees
               'plants': [['Plant_Grass_Arid_Short', 10, 1], ['Plant_Grass_Arid', 6, 2], ['Plant_Bush_Arid', 3]], 'density': 0.08,
               'trees': [first('Dry_Dead/Stage_2/'), first('Petrified_Dead/Stage_5')]},
    'tundra': {'name': 'Snow', 'weather': 'Server/Weathers/Zone3/Zone3_Cloudy_Light.json', 'ground': 'Soil_Snow', 'under': 'Soil_Snow', 'hills': 3,
               # Boreal1 henges: snowy firs, winter bushes and brambles
               'plants': [['Plant_Bush_Winter_Snow', 4], ['Plant_Bramble_Winter', 3, 2]], 'density': 0.06,
               'trees': [first('Fir_Snow/Stage_3/'), first('Fir_Snow/Stage_1/')]},
    # Zone 4: the Volcanic1 jungle under the zone's own weather (Env_Zone4 -> Zone4_Light, the reddish haze over the devastated lands)
    'volcanic': {'name': 'Volcanic', 'weather': 'Server/Weathers/Zone4/Zone4_Light.json', 'tintFrom': 'Server/HytaleGenerator/Biomes/Volcanic1/Volcanic1_Jungle.json',
               'ground': 'Soil_Grass', 'under': 'Soil_Dirt', 'hills': 3,
               # Volcanic1_Jungle_Grasses, _Bushes_Jungles, _Trees and _Trees_Jungles
               'plants': [['Plant_Grass_Lush_Short', 20, 1], ['Plant_Grass_Sharp', 16, 2], ['Plant_Grass_Sharp_Tall', 10], ['Plant_Grass_Sharp_Wild', 6], ['Plant_Fern_Tall', 6], ['Plant_Bush_Jungle', 4], ['Plant_Bush_Dead_Twisted', 1]], 'density': 0.5,
               'trees': [first('Banyan/Stage_3/'), first('Jungle/Stage_2/'), first('Fig_Blue/Stage_2/')]},
}
# the things the moves use, from the game's village furniture set and benches
SET_PIECES = {'chair': 'Furniture_Village_Chair', 'bed': 'Furniture_Village_Bed', 'ladder': 'Furniture_Village_Ladder', 'bench': 'Bench_WorkBench', 'wall': 'Wood_Softwood_Planks'}

blocks = {}
for s in SCENES.values():
    for b in [s['ground'], s['under']] + [p[0] for p in s['plants']]: blocks[b] = block(b)
    for t in s['trees']:
        for b in {x['name'] for x in json.loads(z.read(t))['blocks']}:
            try: blocks[b] = block(b)
            except KeyError: print('no definition for', b)
for k, b in SET_PIECES.items(): blocks[b] = block(b)

files = set()
for s in SCENES.values(): files |= {s['weather'], *s['trees']} | ({s['tintFrom']} if s.get('tintFrom') else set())
for b in blocks.values():
    if 'model' in b: files |= {'Common/' + b['model'], *('Common/' + t for t in b['tex'])}
    for k, v in b.get('cube', {}).items(): files |= {'Common/' + x for x in (v if isinstance(v, list) else [v])}
missing = sorted(f for f in files if f not in set(names))
if missing: print('MISSING', missing)

out = os.path.join(os.path.dirname(__file__), '..', 'site', 'app', 'scene-data.js')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Made by dev/make-scene-data.py from the game\'s own definitions: which of the player\'s game files the in-game backgrounds\n')
    f.write('// and the move set pieces are built from. Paths, names and colours only.\n')
    f.write('export const SCENES = ' + json.dumps(SCENES, indent=1) + ';\n')
    f.write('export const SET_PIECES = ' + json.dumps(SET_PIECES) + ';\n')
    f.write('export const BLOCKS = ' + json.dumps(blocks, indent=1) + ';\n')
    f.write('export const SCENE_FILES = ' + json.dumps(sorted(files)) + ';\n')
print(len(blocks), 'blocks,', len(files), 'files')
