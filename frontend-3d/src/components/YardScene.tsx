import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ContainerBox } from './ContainerBox'
import { YardFloor } from './YardFloor'
import type { Container3D } from '../types/api'

interface Props {
  containers: Container3D[]
  dimensions: { bays: number; rows: number; tiers: number } | null
  highlightId: number | null
  removingId: number | null
  onContainerClick?: (c: Container3D) => void
}

export function YardScene({ containers, dimensions, highlightId, removingId, onContainerClick }: Props) {
  const bays = dimensions?.bays ?? 30
  const rows = dimensions?.rows ?? 6
  const SX = 6.5
  const SZ = 2.8

  const centerX = (bays * SX) / 2
  const centerZ = (rows * SZ) / 2

  return (
    <Canvas
      shadows
      camera={{
        position: [centerX + 40, 50, centerZ + 60],
        fov: 45,
        near: 0.1,
        far: 1000,
      }}
      style={{ background: '#0A0A0A' }}
    >
      <fog attach="fog" args={['#0A0A0A', 100, 350]} />

      {/* Lighting */}
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[centerX + 30, 60, centerZ - 20]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <pointLight position={[centerX, 40, centerZ]} intensity={0.4} color="#7BB3CC" />

      {/* Floor */}
      <YardFloor bays={bays} rows={rows} />

      {/* Containers */}
      {containers.map((c) => (
        <ContainerBox
          key={c.id}
          data={c}
          highlight={c.id === highlightId}
          removing={c.id === removingId}
          onClick={onContainerClick}
        />
      ))}

      {/* Controls */}
      <OrbitControls
        target={[centerX, 4, centerZ]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={15}
        maxDistance={250}
        enableDamping
        dampingFactor={0.05}
      />
    </Canvas>
  )
}
