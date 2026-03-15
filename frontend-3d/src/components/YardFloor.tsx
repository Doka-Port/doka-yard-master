import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

const SX = 6.5
const SZ = 2.8

interface Props {
  bays: number
  rows: number
  heatmap?: number[][] | null
  reeferSlots?: number[][] | null
}

// 5-step color scale: empty → low → medium → high → full
const HEAT_STOPS: [number, THREE.Color][] = [
  [0.0, new THREE.Color('#1A2E38')],  // empty — dark teal
  [0.25, new THREE.Color('#2E8B57')], // low — green
  [0.5, new THREE.Color('#E8A838')],  // medium — gold
  [0.75, new THREE.Color('#D4652A')], // high — orange
  [1.0, new THREE.Color('#C94F4F')],  // full — red
]

function heatColor(v: number): THREE.Color {
  if (v <= 0) return HEAT_STOPS[0][1].clone()
  if (v >= 1) return HEAT_STOPS[HEAT_STOPS.length - 1][1].clone()
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (v <= HEAT_STOPS[i][0]) {
      const t = (v - HEAT_STOPS[i - 1][0]) / (HEAT_STOPS[i][0] - HEAT_STOPS[i - 1][0])
      return HEAT_STOPS[i - 1][1].clone().lerp(HEAT_STOPS[i][1], t)
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1].clone()
}

export function YardFloor({ bays, rows, heatmap, reeferSlots }: Props) {
  const totalX = bays * SX
  const totalZ = rows * SZ

  const gridGeometry = useMemo(() => {
    const points: number[] = []
    for (let b = 0; b <= bays; b++) {
      const x = b * SX - SX / 2
      points.push(x, 0.02, -SZ / 2, x, 0.02, totalZ - SZ / 2)
    }
    for (let r = 0; r <= rows; r++) {
      const z = r * SZ - SZ / 2
      points.push(-SX / 2, 0.02, z, totalX - SX / 2, 0.02, z)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return geo
  }, [bays, rows, totalX, totalZ])

  // Heatmap cells with value labels
  const heatCells = useMemo(() => {
    if (!heatmap) return null
    const cells: { x: number; z: number; color: THREE.Color; value: number; bay: number; row: number }[] = []
    for (let b = 0; b < heatmap.length; b++) {
      for (let r = 0; r < (heatmap[b]?.length ?? 0); r++) {
        const v = heatmap[b][r]
        cells.push({ x: b * SX, z: r * SZ, color: heatColor(v), value: v, bay: b, row: r })
      }
    }
    return cells
  }, [heatmap])

  // Aggregate stats per bay (for top bar labels)
  const bayAverages = useMemo(() => {
    if (!heatmap) return null
    return heatmap.map(bayRows => {
      const avg = bayRows.reduce((s, v) => s + v, 0) / bayRows.length
      return Math.round(avg * 100)
    })
  }, [heatmap])

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[totalX / 2 - SX / 2, 0, totalZ / 2 - SZ / 2]} receiveShadow>
        <planeGeometry args={[totalX + 10, totalZ + 10]} />
        <meshStandardMaterial color="#0A0A0A" roughness={0.9} />
      </mesh>

      {/* Heatmap overlay */}
      {heatCells && heatCells.map((cell, i) => (
        <group key={i}>
          {/* Colored cell */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cell.x, 0.03, cell.z]}>
            <planeGeometry args={[SX * 0.92, SZ * 0.92]} />
            <meshBasicMaterial color={cell.color} transparent opacity={0.55} side={THREE.DoubleSide} />
          </mesh>
          {/* Percentage label on each cell */}
          <Text
            position={[cell.x, 0.06, cell.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.7}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            fontWeight={700}
            outlineWidth={0.04}
            outlineColor="#000000"
          >
            {Math.round(cell.value * 100)}%
          </Text>
        </group>
      ))}

      {/* Bay average occupancy bar (shown above bay labels when heatmap active) */}
      {bayAverages && bayAverages.map((avg, b) => (
        <group key={`bay-avg-${b}`}>
          {/* Small bar */}
          <mesh position={[b * SX, 0.04, -SZ / 2 - 3.5]}>
            <boxGeometry args={[SX * 0.7 * (avg / 100), 0.08, 0.6]} />
            <meshBasicMaterial color={heatColor(avg / 100)} />
          </mesh>
          {/* Bar background */}
          <mesh position={[b * SX, 0.03, -SZ / 2 - 3.5]}>
            <boxGeometry args={[SX * 0.7, 0.06, 0.6]} />
            <meshBasicMaterial color="#1A2E38" transparent opacity={0.5} />
          </mesh>
          {/* Percentage */}
          <Text
            position={[b * SX, 0.1, -SZ / 2 - 4.5]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.55}
            color={avg > 75 ? '#C94F4F' : avg > 50 ? '#E8A838' : '#2E8B57'}
            anchorX="center"
            anchorY="middle"
            fontWeight={700}
          >
            {avg}%
          </Text>
        </group>
      ))}

      {/* Reefer slot markers */}
      {reeferSlots && reeferSlots.map((slot, i) => (
        <group key={`reefer-${i}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[slot[0] * SX, 0.04, slot[1] * SZ]}>
            <planeGeometry args={[SX * 0.85, SZ * 0.85]} />
            <meshBasicMaterial color="#2E5E73" transparent opacity={0.35} side={THREE.DoubleSide} />
          </mesh>
          <Text
            position={[slot[0] * SX, 0.06, slot[1] * SZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.6}
            color="#84B8D9"
            anchorX="center"
            anchorY="middle"
          >
            ❄
          </Text>
        </group>
      ))}

      {/* Grid lines */}
      <lineSegments geometry={gridGeometry}>
        <lineBasicMaterial color="#5B7F8F" transparent opacity={0.3} />
      </lineSegments>

      {/* Bay labels */}
      {Array.from({ length: bays }, (_, b) => (
        <Text
          key={`bay-${b}`}
          position={[b * SX, 0.05, -SZ / 2 - 1.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.8}
          color="#9BA8B4"
          anchorX="center"
          anchorY="middle"
        >
          B{b}
        </Text>
      ))}

      {/* Row labels */}
      {Array.from({ length: rows }, (_, r) => (
        <Text
          key={`row-${r}`}
          position={[-SX / 2 - 2, 0.05, r * SZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.8}
          color="#9BA8B4"
          anchorX="center"
          anchorY="middle"
        >
          R{r}
        </Text>
      ))}
    </group>
  )
}
