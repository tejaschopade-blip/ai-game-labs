// Pure level data + parsing. No Phaser imports — this file must stay runtime-agnostic
// so level definitions can later be generated/validated outside the scene.

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface GridPos { col: number; row: number }

export const DIR_VEC: Record<Dir, { dc: number; dr: number }> = {
  up:    { dc:  0, dr: -1 },
  down:  { dc:  0, dr:  1 },
  left:  { dc: -1, dr:  0 },
  right: { dc:  1, dr:  0 },
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
}

export function opposite(d: Dir): Dir { return OPPOSITE[d] }

export type ObjectKind = 'key' | 'gate' | 'exit'

export interface LevelObject {
  id: string
  kind: ObjectKind
  pos: GridPos
  opensWith?: string
}

export interface LevelDef {
  id: string
  name: string
  theme: string
  ascii: string
  objects: LevelObject[]
  mission: { requireExit: boolean }
}

export interface ParsedLevel {
  id: string
  name: string
  width: number
  height: number
  walls: Set<string>
  playerStart: GridPos
  objects: LevelObject[]
  mission: { requireExit: boolean }
}

export function posKey(p: GridPos): string { return `${p.col},${p.row}` }

export function parseLevel(def: LevelDef): ParsedLevel {
  const rows = def.ascii.split('\n').filter(r => r.length > 0)
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const walls = new Set<string>()
  let playerStart: GridPos = { col: 1, row: 1 }

  rows.forEach((row, r) => {
    for (let c = 0; c < width; c++) {
      // Ragged rows pad as wall rather than silently becoming open floor.
      const ch = row[c] ?? '#'
      if (ch === '@') playerStart = { col: c, row: r }
      else if (ch !== '.') walls.add(posKey({ col: c, row: r }))
    }
  })

  return {
    id: def.id,
    name: def.name,
    width,
    height: rows.length,
    walls,
    playerStart,
    objects: def.objects,
    mission: def.mission,
  }
}

// Flood fill over open tiles. Used by the dev maze check and by nothing at runtime.
export function reachableFrom(
  level: ParsedLevel,
  start: GridPos,
  extraBlocked?: Set<string>,
): Set<string> {
  const seen = new Set<string>([posKey(start)])
  const queue: GridPos[] = [start]

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const v of Object.values(DIR_VEC)) {
      const next = { col: cur.col + v.dc, row: cur.row + v.dr }
      const k = posKey(next)
      if (seen.has(k)) continue
      if (next.col < 0 || next.col >= level.width) continue
      if (next.row < 0 || next.row >= level.height) continue
      if (level.walls.has(k) || extraBlocked?.has(k)) continue
      seen.add(k)
      queue.push(next)
    }
  }
  return seen
}

export const GARDEN_SHORTCUT: LevelDef = {
  id: 'garden-shortcut',
  name: 'The Garden Shortcut',
  theme: 'cozy_garden',
  ascii: [
    '###################',
    '#@....#.....#.....#',
    '#.###.#.###.#.###.#',
    '#.#...#.#.#.#.#...#',
    '#.#.###.#.#.#.#.###',
    '#...#...#...#.#...#',
    '###.#.###.###.###.#',
    '#...#.#...#.....#.#',
    '#.###.#.#.#####.#.#',
    '#.......#.......#.#',
    '###################',
  ].join('\n'),
  objects: [
    { id: 'key1',  kind: 'key',  pos: { col:  9, row: 5 } },
    { id: 'gate1', kind: 'gate', pos: { col: 17, row: 7 }, opensWith: 'key1' },
    { id: 'exit1', kind: 'exit', pos: { col: 17, row: 9 } },
  ],
  mission: { requireExit: true },
}
