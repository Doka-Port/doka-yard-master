import { useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { ContainerBox } from './ContainerBox'
import { YardFloor } from './YardFloor'
import { RTGCrane } from './RTGCrane'
import type { RTGTarget, RTGPositionRef } from './RTGCrane'
import type { Container3D } from '../types/api'

interface Props {
  containers: Container3D[]
  dimensions: { bays: number; rows: number; tiers: number } | null
  highlightId: number | null
  removingId: number | null
  xrayMode?: boolean
  simulatedHours?: number
  cameraTarget?: { x: number; y: number; z: number } | null
  heatmap?: number[][] | null
  viewMode?: 'normal' | 'heatmap'
  reeferSlots?: number[][] | null
  rtgTarget?: RTGTarget
  rtgCarriedId?: number | null
  searchId?: number | null
  onContainerClick?: (c: Container3D) => void
  theme?: 'dark' | 'light'
  is2D?: boolean
}

function CameraAnimator({ target, controlsRef }: { target: { x: number; y: number; z: number } | null; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree()
  const animating = useRef(false)
  const targetVec = useRef(new THREE.Vector3())
  const camPosTarget = useRef(new THREE.Vector3())

  useEffect(() => {
    if (target) {
      targetVec.current.set(target.x, 0, target.z)
      camPosTarget.current.set(target.x + 12, target.y + 10, target.z + 14)
      animating.current = true
    }
  }, [target])

  useFrame(() => {
    if (!animating.current || !controlsRef.current) return
    camera.position.lerp(camPosTarget.current, 0.035)
    // Smoothly move OrbitControls target to the searched container
    const ct = controlsRef.current.target as THREE.Vector3
    ct.lerp(targetVec.current, 0.035)
    controlsRef.current.update()
    if (camera.position.distanceTo(camPosTarget.current) < 0.3) {
      animating.current = false
    }
  })

  return null
}

export function YardScene({ containers, dimensions, highlightId, removingId, xrayMode, simulatedHours, cameraTarget, heatmap, viewMode, reeferSlots, rtgTarget, rtgCarriedId, searchId, onContainerClick, theme = 'dark', is2D = false }: Props) {
  const bays = dimensions?.bays ?? 30
  const rows = dimensions?.rows ?? 6
  const SX = 6.5
  const SZ = 2.8

  const centerX = (bays * SX) / 2
  const centerZ = (rows * SZ) / 2

  const rtgPosRef = useRef<RTGPositionRef>({ x: 0, y: 0, z: 0, phase: 'idle', arrivedX: true, arrivedZ: true, arrivedY: true })
  const orbitRef = useRef<any>(null)

  const fogColor = theme === 'light' ? '#F2F2F2' : '#0A0A0A'

  return (
    <Canvas
      shadows
      style={{ background: 'transparent' }}
    >
      <fog attach="fog" args={[fogColor, 100, 350]} />

      {is2D ? (
        <OrthographicCamera makeDefault position={[centerX, 150, centerZ]} zoom={22} near={0.1} far={1000} rotation={[-Math.PI / 2, 0, 0]} />
      ) : (
        <PerspectiveCamera makeDefault position={[centerX + 40, 50, centerZ + 60]} fov={45} near={0.1} far={1000} />
      )}

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
      <pointLight position={[centerX, 40, centerZ]} intensity={0.4} color="#84B8D9" />

      {/* Floor */}
      <YardFloor bays={bays} rows={rows} heatmap={viewMode === 'heatmap' ? heatmap : null} reeferSlots={reeferSlots} />

      {/* Containers */}
      {containers.map((c) => (
        <ContainerBox
          key={c.id}
          data={c}
          highlight={c.id === highlightId}
          removing={c.id === removingId}
          xrayMode={xrayMode}
          simulatedHours={simulatedHours}
          carriedByRtg={c.id === rtgCarriedId}
          dimmed={searchId != null && c.id !== searchId}
          heatmapMode={viewMode === 'heatmap'}
          rtgPositionRef={rtgPosRef}
          onClick={onContainerClick}
        />
      ))}

      {/* RTG Crane */}
      {rtgTarget && <RTGCrane target={rtgTarget} rows={rows} positionRef={rtgPosRef} />}

      {/* Camera animation for search */}
      <CameraAnimator target={cameraTarget ?? null} controlsRef={orbitRef} />

      {/* Controls */}
      <OrbitControls
        ref={orbitRef}
        target={[centerX, 4, centerZ]}
        maxPolarAngle={is2D ? 0 : Math.PI / 2.1}
        minPolarAngle={is2D ? 0 : 0}
        enableRotate={!is2D}
        minDistance={15}
        maxDistance={250}
        minZoom={5}
        maxZoom={150}
        enableDamping
        dampingFactor={0.05}
      />
    </Canvas>
  )
}
