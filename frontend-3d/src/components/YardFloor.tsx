import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

const SX = 6.5
const SZ = 2.8

interface Props {
  bays: number
  rows: number
}

export function YardFloor({ bays, rows }: Props) {
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

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[totalX / 2 - SX / 2, 0, totalZ / 2 - SZ / 2]} receiveShadow>
        <planeGeometry args={[totalX + 10, totalZ + 10]} />
        <meshStandardMaterial color="#1a1f2e" roughness={0.9} />
      </mesh>

      {/* Grid lines */}
      <lineSegments geometry={gridGeometry}>
        <lineBasicMaterial color="#2a3f56" transparent opacity={0.4} />
      </lineSegments>

      {/* Bay labels */}
      {Array.from({ length: bays }, (_, b) => (
        <Text
          key={`bay-${b}`}
          position={[b * SX, 0.05, -SZ / 2 - 1.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.8}
          color="#556677"
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
          color="#556677"
          anchorX="center"
          anchorY="middle"
        >
          R{r}
        </Text>
      ))}
    </group>
  )
}
