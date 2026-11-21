// Made by dev/make-scene-data.py from the game's own definitions: which of the player's game files the in-game backgrounds
// and the move set pieces are built from. Paths, names and colours only.
export const SCENES = {
 "meadow": {
  "name": "Meadow",
  "weather": "Server/Weathers/Zone1/Zone1_Sunny.json",
  "tintFrom": "Server/HytaleGenerator/Biomes/Plains1/Plains1_Oak.json",
  "ground": "Soil_Grass",
  "under": "Soil_Dirt",
  "hills": 2,
  "plants": [
   [
    "Plant_Grass_Lush_Short",
    30,
    1
   ],
   [
    "Plant_Grass_Sharp",
    24,
    2
   ],
   [
    "Plant_Grass_Sharp_Tall",
    10
   ],
   [
    "Plant_Grass_Sharp_Wild",
    4
   ],
   [
    "Plant_Flower_Common_Red2",
    2,
    1
   ],
   [
    "Plant_Flower_Common_Cyan2",
    2,
    1
   ]
  ],
  "density": 0.45,
  "trees": [
   "Server/Prefabs/Orbis/Trees/Oak/Stage_4/Oak_Stage4_001.prefab.json",
   "Server/Prefabs/Orbis/Trees/Oak/Stage_3/Oak_Stage3_001.prefab.json",
   "Server/Prefabs/Orbis/Trees/Beech/Stage_2/Beech_Stage2_001.prefab.json"
  ]
 },
 "desert": {
  "name": "Desert",
  "weather": "Server/Weathers/Zone2/Zone2_Sunny.json",
  "ground": "Soil_Sand",
  "under": "Soil_Sand",
  "hills": 2,
  "plants": [
   [
    "Plant_Grass_Arid_Short",
    10,
    1
   ],
   [
    "Plant_Grass_Arid",
    6,
    2
   ],
   [
    "Plant_Bush_Arid",
    3
   ]
  ],
  "density": 0.08,
  "trees": [
   "Server/Prefabs/Orbis/Trees/Dry_Dead/Stage_2/Dry_Dead_Stage2_001.prefab.json",
   "Server/Prefabs/Orbis/Trees/Petrified_Dead/Stage_5/Petrified_Dead_Stage5_001.prefab.json"
  ]
 },
 "tundra": {
  "name": "Snow",
  "weather": "Server/Weathers/Zone3/Zone3_Cloudy_Light.json",
  "ground": "Soil_Snow",
  "under": "Soil_Snow",
  "hills": 3,
  "plants": [
   [
    "Plant_Bush_Winter_Snow",
    4
   ],
   [
    "Plant_Bramble_Winter",
    3,
    2
   ]
  ],
  "density": 0.06,
  "trees": [
   "Server/Prefabs/Orbis/Trees/Fir_Snow/Stage_3/Fir_Snow_Stage3_001.prefab.json",
   "Server/Prefabs/Orbis/Trees/Fir_Snow/Stage_1/Fir_Snow_Stage1_001.prefab.json"
  ]
 },
 "volcanic": {
  "name": "Jungle",
  "weather": "Server/Weathers/Zone4/Zone4_Light.json",
  "tintFrom": "Server/HytaleGenerator/Biomes/Volcanic1/Volcanic1_Jungle.json",
  "ground": "Soil_Grass",
  "under": "Soil_Dirt",
  "hills": 3,
  "plants": [
   [
    "Plant_Grass_Lush_Short",
    20,
    1
   ],
   [
    "Plant_Grass_Sharp",
    16,
    2
   ],
   [
    "Plant_Grass_Sharp_Tall",
    10
   ],
   [
    "Plant_Grass_Sharp_Wild",
    6
   ],
   [
    "Plant_Fern_Tall",
    6
   ],
   [
    "Plant_Bush_Jungle",
    4
   ],
   [
    "Plant_Bush_Dead_Twisted",
    1
   ]
  ],
  "density": 0.5,
  "trees": [
   "Server/Prefabs/Orbis/Trees/Banyan/Stage_3/Banyan_Stage3_001.prefab.json",
   "Server/Prefabs/Trees/Jungle/Stage_2/Jungle_Stage_2_001.prefab.json",
   "Server/Prefabs/Orbis/Trees/Fig_Blue/Stage_2/Fig_Blue_Stage2_001.prefab.json"
  ]
 }
};
export const SET_PIECES = {"chair": "Furniture_Village_Chair", "bed": "Furniture_Village_Bed", "ladder": "Furniture_Village_Ladder", "bench": "Bench_WorkBench", "wall": "Wood_Softwood_Planks"};
export const BLOCKS = {
 "Soil_Grass": {
  "cube": {
   "side": "BlockTextures/Soil_Grass_Side.png",
   "top": [
    "BlockTextures/Soil_Grass_GS.png",
    "BlockTextures/Soil_Grass_GS_02.png"
   ],
   "bottom": "BlockTextures/Soil_Dirt.png",
   "sideMask": "BlockTextures/Soil_grass_Side_Mask_GS.png"
  },
  "tintUp": true
 },
 "Soil_Dirt": {
  "cube": {
   "side": "BlockTextures/Soil_Dirt.png",
   "top": "BlockTextures/Soil_Dirt.png",
   "bottom": "BlockTextures/Soil_Dirt.png"
  }
 },
 "Plant_Grass_Lush_Short": {
  "model": "Blocks/Foliage/Plants/Cross_10px.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Cross_10px_Textures/Grass_Small.png"
  ],
  "tint": "#297430"
 },
 "Plant_Grass_Sharp": {
  "model": "Blocks/Foliage/Grass/Dense_Small_3Rows.blockymodel",
  "tex": [
   "Blocks/Foliage/Grass/Dense_Small_4Rows_Textures/default.png"
  ],
  "tint": "#67b62d"
 },
 "Plant_Grass_Sharp_Tall": {
  "model": "Blocks/Foliage/Grass/Dense_Tall_3Rows.blockymodel",
  "tex": [
   "Blocks/Foliage/Grass/Dense_Tall_4Rows_Texture.png"
  ],
  "tint": "#67b62d"
 },
 "Plant_Grass_Sharp_Wild": {
  "model": "Blocks/Foliage/Grass/Dense_VeryTall_4Rows.blockymodel",
  "tex": [
   "Blocks/Foliage/Grass/Dense_VeryTall_4Rows_Sharp.png"
  ],
  "tint": "#67b62d"
 },
 "Plant_Flower_Common_Red2": {
  "model": "Blocks/Foliage/Plants/Cross_25px.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Cross_25px_Textures/Flower_Red.png"
  ]
 },
 "Plant_Flower_Common_Cyan2": {
  "model": "Blocks/Foliage/Flowers/Flower.blockymodel",
  "tex": [
   "Blocks/Foliage/Flowers/Flower_Textures/Cyan.png"
  ]
 },
 "Wood_Oak_Branch_Corner": {
  "model": "Blocks/Structures/Tubes/Corner.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Oak.png"
  ]
 },
 "Wood_Oak_Roots": {
  "model": "Blocks/Foliage/Tree/Roots.blockymodel",
  "tex": [
   "Blocks/Foliage/Tree/Roots_Textures/Oak.png"
  ]
 },
 "Wood_Oak_Branch_Long": {
  "model": "Blocks/Structures/Tubes/Long.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Oak.png"
  ]
 },
 "Plant_Leaves_Oak": {
  "model": "Blocks/Foliage/Leaves/Ball.blockymodel",
  "tex": [
   "Blocks/Foliage/Leaves/Ball_Textures/Oak.png"
  ]
 },
 "Wood_Oak_Trunk": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Oak_Side.png",
   "top": "BlockTextures/Wood_Trunk_Oak_Top.png",
   "bottom": "BlockTextures/Wood_Trunk_Oak_Top.png"
  }
 },
 "Wood_Oak_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Oak_Side.png",
   "top": "BlockTextures/Wood_Trunk_Oak_Full.png",
   "bottom": "BlockTextures/Wood_Trunk_Oak_Full.png"
  }
 },
 "Wood_Oak_Branch_Short": {
  "model": "Blocks/Structures/Tubes/Short.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Oak.png"
  ]
 },
 "Wood_Beech_Trunk": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Beech_Side.png",
   "top": "BlockTextures/Wood_Trunk_Beech_Top.png",
   "bottom": "BlockTextures/Wood_Trunk_Beech_Top.png"
  }
 },
 "Wood_Beech_Branch_Long": {
  "model": "Blocks/Structures/Tubes/Long.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Beech.png"
  ]
 },
 "Plant_Leaves_Beech": {
  "model": "Blocks/Foliage/Leaves/Ball.blockymodel",
  "tex": [
   "Blocks/Foliage/Leaves/Ball_Textures/Beech.png"
  ]
 },
 "Wood_Beech_Branch_Corner": {
  "model": "Blocks/Structures/Tubes/Corner.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Beech.png"
  ]
 },
 "Wood_Beech_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Beech_Side.png",
   "top": "BlockTextures/Wood_Trunk_Beech_Full.png",
   "bottom": "BlockTextures/Wood_Trunk_Beech_Full.png"
  }
 },
 "Soil_Sand": {
  "cube": {
   "side": "BlockTextures/Soil_Sand.png",
   "top": "BlockTextures/Soil_Sand.png",
   "bottom": "BlockTextures/Soil_Sand.png"
  }
 },
 "Plant_Grass_Arid_Short": {
  "model": "Blocks/Foliage/Plants/Cross_10px.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Cross_10px_Textures/Grassplant_Dry_Short_GS.png"
  ],
  "tint": "#e4c945"
 },
 "Plant_Grass_Arid": {
  "model": "Blocks/Foliage/Plants/Cross_25px.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Cross_25px_Textures/Grassplant_Dry_GS.png"
  ],
  "tint": "#e4c945"
 },
 "Plant_Bush_Arid": {
  "model": "Blocks/Foliage/Plants/Bush_Big.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Bush_Big_Textures/Arid.png"
  ]
 },
 "Wood_Dry_Branch_Corner": {
  "model": "Blocks/Structures/Tubes/Corner.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Dry.png"
  ]
 },
 "Wood_Dry_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Dry.png",
   "top": "BlockTextures/Wood_Trunk_Dry_Full.png",
   "bottom": "BlockTextures/Wood_Trunk_Dry_Full.png"
  }
 },
 "Wood_Dry_Trunk": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Dry.png",
   "top": "BlockTextures/Wood_Trunk_Dry_Top.png",
   "bottom": "BlockTextures/Wood_Trunk_Dry_Top.png"
  }
 },
 "Wood_Dry_Branch_Long": {
  "model": "Blocks/Structures/Tubes/Long.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Dry.png"
  ]
 },
 "Wood_Dry_Branch_Short": {
  "model": "Blocks/Structures/Tubes/Short.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Dry.png"
  ]
 },
 "Wood_Dry_Roots": {
  "model": "Blocks/Foliage/Tree/Roots.blockymodel",
  "tex": [
   "Blocks/Foliage/Tree/Roots_Textures/Dry.png"
  ]
 },
 "Wood_Petrified_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Petrified_Side.png",
   "top": "BlockTextures/Wood_Trunk_Petrified_Full.png",
   "bottom": "BlockTextures/Wood_Trunk_Petrified_Full.png"
  }
 },
 "Soil_Snow": {
  "cube": {
   "side": "BlockTextures/Soil_Snow.png",
   "top": "BlockTextures/Soil_Snow.png",
   "bottom": "BlockTextures/Soil_Snow.png"
  }
 },
 "Plant_Bush_Winter_Snow": {
  "model": "Blocks/Foliage/Plants/Bush_Big.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Bush_Big_Textures/Winter_Snow.png"
  ]
 },
 "Plant_Bramble_Winter": {
  "model": "Blocks/Foliage/Plants/Cross.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Cross_Textures/Bramble_Winter.png"
  ]
 },
 "Plant_Leaves_Fir_Snow": {
  "model": "Blocks/Foliage/Leaves/PineShape_NSEW.blockymodel",
  "tex": [
   "Blocks/Foliage/Leaves/PineShape_NSEW_Textures/Pine_Snowy.png"
  ]
 },
 "Wood_Fir_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_Fir_Trunk_Side.png",
   "top": "BlockTextures/Wood_Fir_Trunk_Full.png",
   "bottom": "BlockTextures/Wood_Fir_Trunk_Full.png"
  }
 },
 "Plant_Leaves_Fir_Tip_Snow": {
  "model": "Blocks/Foliage/Leaves/PineShape_Tip.blockymodel",
  "tex": [
   "Blocks/Foliage/Leaves/PineShape_NSEW_Textures/Pine_Snowy.png"
  ]
 },
 "Wood_Fir_Branch_Corner": {
  "model": "Blocks/Structures/Tubes/Corner.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Spruce.png"
  ]
 },
 "Wood_Fir_Roots": {
  "model": "Blocks/Foliage/Tree/Roots.blockymodel",
  "tex": [
   "Blocks/Foliage/Tree/Roots_Textures/Spruce.png"
  ]
 },
 "Wood_Fir_Branch_Long": {
  "model": "Blocks/Structures/Tubes/Long.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Spruce.png"
  ]
 },
 "Wood_Fir_Trunk": {
  "cube": {
   "side": "BlockTextures/Wood_Fir_Trunk_Side.png",
   "top": "BlockTextures/Wood_Fir_Trunk_Top.png",
   "bottom": "BlockTextures/Wood_Fir_Trunk_Top.png"
  }
 },
 "Plant_Fern_Tall": {
  "model": "Blocks/Foliage/Grass/Fern.blockymodel",
  "tex": [
   "Blocks/Foliage/Grass/Fern_Texture.png"
  ]
 },
 "Plant_Bush_Jungle": {
  "model": "Blocks/Foliage/Plants/Bush_Big.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Bush_Big_Textures/Jungle_Green.png"
  ]
 },
 "Plant_Bush_Dead_Twisted": {
  "model": "Blocks/Foliage/Plants/Bush_Big.blockymodel",
  "tex": [
   "Blocks/Foliage/Plants/Bush_Big_Textures/Dead.png",
   "Blocks/Foliage/Plants/Bush_Big_Textures/Dead_Stem.png"
  ]
 },
 "Wood_Banyan_Trunk": {
  "cube": {
   "side": "BlockTextures/Wood_trunk_Banyan_Side.png",
   "top": "BlockTextures/Wood_trunk_Banyan_Top.png",
   "bottom": "BlockTextures/Wood_trunk_Banyan_Top.png"
  }
 },
 "Plant_Leaves_Banyan": {
  "model": "Blocks/Foliage/Leaves/DownShape.blockymodel",
  "tex": [
   "Blocks/Foliage/Leaves/DownShape_Textures/Banyan.png"
  ]
 },
 "Wood_Banyan_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_trunk_Banyan_Side.png",
   "top": "BlockTextures/Wood_trunk_Banyan_Full.png",
   "bottom": "BlockTextures/Wood_trunk_Banyan_Full.png"
  }
 },
 "Wood_Banyan_Branch_Long": {
  "model": "Blocks/Structures/Tubes/Long.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Banyan.png"
  ]
 },
 "Wood_Banyan_Branch_Corner": {
  "model": "Blocks/Structures/Tubes/Corner.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Banyan.png"
  ]
 },
 "Wood_Jungle_Roots": {
  "model": "Blocks/Foliage/Tree/Roots.blockymodel",
  "tex": [
   "Blocks/Foliage/Tree/Roots_Textures/Jungle.png"
  ]
 },
 "Plant_Leaves_Jungle": {
  "model": "Blocks/Foliage/Leaves/Tropical.blockymodel",
  "tex": [
   "Blocks/Foliage/Leaves/Tropical_Wide.png"
  ]
 },
 "Wood_Jungle_Branch_Corner": {
  "model": "Blocks/Structures/Tubes/Corner.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Jungle.png"
  ]
 },
 "Wood_Jungle_Branch_Long": {
  "model": "Blocks/Structures/Tubes/Long.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Jungle.png"
  ]
 },
 "Wood_Jungle_Trunk": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Jungle_Side.png",
   "top": "BlockTextures/Wood_Trunk_Jungle_Top.png",
   "bottom": "BlockTextures/Wood_Trunk_Jungle_Top.png"
  }
 },
 "Wood_Jungle_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Jungle_Side.png",
   "top": "BlockTextures/Wood_Trunk_Jungle_Full.png",
   "bottom": "BlockTextures/Wood_Trunk_Jungle_Full.png"
  }
 },
 "Wood_Fig_Blue_Branch_Long": {
  "model": "Blocks/Structures/Tubes/Long.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Fig_Blue.png"
  ]
 },
 "Wood_Fig_Blue_Trunk_Full": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Fig_Blue_Side.png",
   "top": "BlockTextures/Wood_Trunk_Fig_Blue_Full.png",
   "bottom": "BlockTextures/Wood_Trunk_Fig_Blue_Full.png"
  }
 },
 "Wood_Fig_Blue_Branch_Corner": {
  "model": "Blocks/Structures/Tubes/Corner.blockymodel",
  "tex": [
   "Blocks/Structures/Tubes/Corner_Textures/Fig_Blue.png"
  ]
 },
 "Wood_Fig_Blue_Trunk": {
  "cube": {
   "side": "BlockTextures/Wood_Trunk_Fig_Blue_Side.png",
   "top": "BlockTextures/Wood_Trunk_Fig_Blue_Top.png",
   "bottom": "BlockTextures/Wood_Trunk_Fig_Blue_Top.png"
  }
 },
 "Plant_Leaves_Fig_Blue": {
  "model": "Blocks/Foliage/Leaves/Ball.blockymodel",
  "tex": [
   "Blocks/Foliage/Leaves/Ball_Textures/Fig_Blue.png"
  ]
 },
 "Furniture_Village_Chair": {
  "model": "Blocks/Decorative_Sets/Village/Chair.blockymodel",
  "tex": [
   "Blocks/Decorative_Sets/Village/Chair_Texture.png"
  ]
 },
 "Furniture_Village_Bed": {
  "model": "Blocks/Decorative_Sets/Village/Bed.blockymodel",
  "tex": [
   "Blocks/Decorative_Sets/Village/Bed_Texture.png"
  ]
 },
 "Furniture_Village_Ladder": {
  "model": "Blocks/Decorative_Sets/Village/Ladder.blockymodel",
  "tex": [
   "Blocks/Decorative_Sets/Village/Ladder_Texture.png"
  ]
 },
 "Bench_WorkBench": {
  "model": "Blocks/Benches/Workbench.blockymodel",
  "tex": [
   "Blocks/Benches/Workbench_Texture.png"
  ]
 },
 "Wood_Softwood_Planks": {
  "cube": {
   "side": "BlockTextures/Wood_Softwood_Planks_Side.png",
   "top": [
    "BlockTextures/Wood_Softwood_Planks_02.png",
    "BlockTextures/Wood_Softwood_Planks_03.png",
    "BlockTextures/Wood_Softwood_Planks_Top.png"
   ],
   "bottom": "BlockTextures/Wood_Softwood_Planks_Top.png"
  }
 }
};
export const SCENE_FILES = ["Common/BlockTextures/Soil_Dirt.png", "Common/BlockTextures/Soil_Grass_GS.png", "Common/BlockTextures/Soil_Grass_GS_02.png", "Common/BlockTextures/Soil_Grass_Side.png", "Common/BlockTextures/Soil_Sand.png", "Common/BlockTextures/Soil_Snow.png", "Common/BlockTextures/Soil_grass_Side_Mask_GS.png", "Common/BlockTextures/Wood_Fir_Trunk_Full.png", "Common/BlockTextures/Wood_Fir_Trunk_Side.png", "Common/BlockTextures/Wood_Fir_Trunk_Top.png", "Common/BlockTextures/Wood_Softwood_Planks_02.png", "Common/BlockTextures/Wood_Softwood_Planks_03.png", "Common/BlockTextures/Wood_Softwood_Planks_Side.png", "Common/BlockTextures/Wood_Softwood_Planks_Top.png", "Common/BlockTextures/Wood_Trunk_Beech_Full.png", "Common/BlockTextures/Wood_Trunk_Beech_Side.png", "Common/BlockTextures/Wood_Trunk_Beech_Top.png", "Common/BlockTextures/Wood_Trunk_Dry.png", "Common/BlockTextures/Wood_Trunk_Dry_Full.png", "Common/BlockTextures/Wood_Trunk_Dry_Top.png", "Common/BlockTextures/Wood_Trunk_Fig_Blue_Full.png", "Common/BlockTextures/Wood_Trunk_Fig_Blue_Side.png", "Common/BlockTextures/Wood_Trunk_Fig_Blue_Top.png", "Common/BlockTextures/Wood_Trunk_Jungle_Full.png", "Common/BlockTextures/Wood_Trunk_Jungle_Side.png", "Common/BlockTextures/Wood_Trunk_Jungle_Top.png", "Common/BlockTextures/Wood_Trunk_Oak_Full.png", "Common/BlockTextures/Wood_Trunk_Oak_Side.png", "Common/BlockTextures/Wood_Trunk_Oak_Top.png", "Common/BlockTextures/Wood_Trunk_Petrified_Full.png", "Common/BlockTextures/Wood_Trunk_Petrified_Side.png", "Common/BlockTextures/Wood_trunk_Banyan_Full.png", "Common/BlockTextures/Wood_trunk_Banyan_Side.png", "Common/BlockTextures/Wood_trunk_Banyan_Top.png", "Common/Blocks/Benches/Workbench.blockymodel", "Common/Blocks/Benches/Workbench_Texture.png", "Common/Blocks/Decorative_Sets/Village/Bed.blockymodel", "Common/Blocks/Decorative_Sets/Village/Bed_Texture.png", "Common/Blocks/Decorative_Sets/Village/Chair.blockymodel", "Common/Blocks/Decorative_Sets/Village/Chair_Texture.png", "Common/Blocks/Decorative_Sets/Village/Ladder.blockymodel", "Common/Blocks/Decorative_Sets/Village/Ladder_Texture.png", "Common/Blocks/Foliage/Flowers/Flower.blockymodel", "Common/Blocks/Foliage/Flowers/Flower_Textures/Cyan.png", "Common/Blocks/Foliage/Grass/Dense_Small_3Rows.blockymodel", "Common/Blocks/Foliage/Grass/Dense_Small_4Rows_Textures/default.png", "Common/Blocks/Foliage/Grass/Dense_Tall_3Rows.blockymodel", "Common/Blocks/Foliage/Grass/Dense_Tall_4Rows_Texture.png", "Common/Blocks/Foliage/Grass/Dense_VeryTall_4Rows.blockymodel", "Common/Blocks/Foliage/Grass/Dense_VeryTall_4Rows_Sharp.png", "Common/Blocks/Foliage/Grass/Fern.blockymodel", "Common/Blocks/Foliage/Grass/Fern_Texture.png", "Common/Blocks/Foliage/Leaves/Ball.blockymodel", "Common/Blocks/Foliage/Leaves/Ball_Textures/Beech.png", "Common/Blocks/Foliage/Leaves/Ball_Textures/Fig_Blue.png", "Common/Blocks/Foliage/Leaves/Ball_Textures/Oak.png", "Common/Blocks/Foliage/Leaves/DownShape.blockymodel", "Common/Blocks/Foliage/Leaves/DownShape_Textures/Banyan.png", "Common/Blocks/Foliage/Leaves/PineShape_NSEW.blockymodel", "Common/Blocks/Foliage/Leaves/PineShape_NSEW_Textures/Pine_Snowy.png", "Common/Blocks/Foliage/Leaves/PineShape_Tip.blockymodel", "Common/Blocks/Foliage/Leaves/Tropical.blockymodel", "Common/Blocks/Foliage/Leaves/Tropical_Wide.png", "Common/Blocks/Foliage/Plants/Bush_Big.blockymodel", "Common/Blocks/Foliage/Plants/Bush_Big_Textures/Arid.png", "Common/Blocks/Foliage/Plants/Bush_Big_Textures/Dead.png", "Common/Blocks/Foliage/Plants/Bush_Big_Textures/Dead_Stem.png", "Common/Blocks/Foliage/Plants/Bush_Big_Textures/Jungle_Green.png", "Common/Blocks/Foliage/Plants/Bush_Big_Textures/Winter_Snow.png", "Common/Blocks/Foliage/Plants/Cross.blockymodel", "Common/Blocks/Foliage/Plants/Cross_10px.blockymodel", "Common/Blocks/Foliage/Plants/Cross_10px_Textures/Grass_Small.png", "Common/Blocks/Foliage/Plants/Cross_10px_Textures/Grassplant_Dry_Short_GS.png", "Common/Blocks/Foliage/Plants/Cross_25px.blockymodel", "Common/Blocks/Foliage/Plants/Cross_25px_Textures/Flower_Red.png", "Common/Blocks/Foliage/Plants/Cross_25px_Textures/Grassplant_Dry_GS.png", "Common/Blocks/Foliage/Plants/Cross_Textures/Bramble_Winter.png", "Common/Blocks/Foliage/Tree/Roots.blockymodel", "Common/Blocks/Foliage/Tree/Roots_Textures/Dry.png", "Common/Blocks/Foliage/Tree/Roots_Textures/Jungle.png", "Common/Blocks/Foliage/Tree/Roots_Textures/Oak.png", "Common/Blocks/Foliage/Tree/Roots_Textures/Spruce.png", "Common/Blocks/Structures/Tubes/Corner.blockymodel", "Common/Blocks/Structures/Tubes/Corner_Textures/Banyan.png", "Common/Blocks/Structures/Tubes/Corner_Textures/Beech.png", "Common/Blocks/Structures/Tubes/Corner_Textures/Dry.png", "Common/Blocks/Structures/Tubes/Corner_Textures/Fig_Blue.png", "Common/Blocks/Structures/Tubes/Corner_Textures/Jungle.png", "Common/Blocks/Structures/Tubes/Corner_Textures/Oak.png", "Common/Blocks/Structures/Tubes/Corner_Textures/Spruce.png", "Common/Blocks/Structures/Tubes/Long.blockymodel", "Common/Blocks/Structures/Tubes/Short.blockymodel", "Server/HytaleGenerator/Biomes/Plains1/Plains1_Oak.json", "Server/HytaleGenerator/Biomes/Volcanic1/Volcanic1_Jungle.json", "Server/Prefabs/Orbis/Trees/Banyan/Stage_3/Banyan_Stage3_001.prefab.json", "Server/Prefabs/Orbis/Trees/Beech/Stage_2/Beech_Stage2_001.prefab.json", "Server/Prefabs/Orbis/Trees/Dry_Dead/Stage_2/Dry_Dead_Stage2_001.prefab.json", "Server/Prefabs/Orbis/Trees/Fig_Blue/Stage_2/Fig_Blue_Stage2_001.prefab.json", "Server/Prefabs/Orbis/Trees/Fir_Snow/Stage_1/Fir_Snow_Stage1_001.prefab.json", "Server/Prefabs/Orbis/Trees/Fir_Snow/Stage_3/Fir_Snow_Stage3_001.prefab.json", "Server/Prefabs/Orbis/Trees/Oak/Stage_3/Oak_Stage3_001.prefab.json", "Server/Prefabs/Orbis/Trees/Oak/Stage_4/Oak_Stage4_001.prefab.json", "Server/Prefabs/Orbis/Trees/Petrified_Dead/Stage_5/Petrified_Dead_Stage5_001.prefab.json", "Server/Prefabs/Trees/Jungle/Stage_2/Jungle_Stage_2_001.prefab.json", "Server/Weathers/Zone1/Zone1_Sunny.json", "Server/Weathers/Zone2/Zone2_Sunny.json", "Server/Weathers/Zone3/Zone3_Cloudy_Light.json", "Server/Weathers/Zone4/Zone4_Light.json"];
