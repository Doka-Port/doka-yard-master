import { useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SX = 6.5
const SZ = 2.8

// Crane dimensions
const LEG_WIDTH = 0.6
const LEG_DEPTH = 0.6
const LEG_HEIGHT = 28
const BEAM_HEIGHT = 1.5
const TROLLEY_W = 2.0
const TROLLEY_H = 1.0
const TROLLEY_D = 1.5
const SPREADER_W = 5.8
const SPREADER_H = 0.4
const SPREADER_D = 2.2
const CABLE_RADIUS = 0.04

const CRANE_COLOR = '#2E5E73'
const ACCENT_COLOR = '#5B7F8F'
const SPREADER_COLOR = '#E8A838'

export interface RTGTarget {
  bay: number
  row: number
  tier: number
  phase: 'idle' | 'moving' | 'lowering' | 'lifting' | 'locked'
}

/** Shared ref so ContainerBox can read the spreader's real-time world position */
export interface RTGPositionRef {
  x: number
  y: number
  z: number
  phase: RTGTarget['phase']
  arrivedX: boolean
  arrivedZ: boolean
  arrivedY: boolean
}

interface Props {
  target: RTGTarget
  rows: number
  positionRef?: MutableRefObject<RTGPositionRef>
}

export function RTGCrane({ target, rows, positionRef }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const trolleyRef = useRef<THREE.Group>(null)
  const spreaderRef = useRef<THREE.Group>(null)
  const cable1Ref = useRef<THREE.Mesh>(null)
  const cable2Ref = useRef<THREE.Mesh>(null)

  // Crane X position (gantry moves along bays)
  const targetX = target.bay * SX

  // Trolley Z position (trolley moves along rows on the crossbeam)
  const targetZ = target.row * SZ

  // Spreader Y position
  const SY = 2.9
  const restY = LEG_HEIGHT - BEAM_HEIGHT - TROLLEY_H - 1
  const loweredY = target.tier * SY + SY / 2 + SPREADER_H
  const targetSpreaderY = (target.phase === 'lowering' || target.phase === 'locked')
    ? loweredY
    : target.phase === 'lifting'
      ? restY
      : restY

  // Span width (across all rows)
  const spanZ = (rows - 1) * SZ + 8

  useFrame((_, delta) => {
    if (!groupRef.current || !trolleyRef.current || !spreaderRef.current) return

    // Gantry X movement
    const speed = delta * 25
    const gx = groupRef.current.position.x
    const dx = targetX - gx
    const arrivedX = Math.abs(dx) <= 0.1
    if (!arrivedX) {
      groupRef.current.position.x += Math.sign(dx) * Math.min(speed, Math.abs(dx))
    } else {
      groupRef.current.position.x = targetX
    }

    // Trolley Z movement
    const tz = trolleyRef.current.position.z
    const dz = targetZ - tz
    const trolleySpeed = delta * 15
    const arrivedZ = Math.abs(dz) <= 0.1
    if (!arrivedZ) {
      trolleyRef.current.position.z += Math.sign(dz) * Math.min(trolleySpeed, Math.abs(dz))
    } else {
      trolleyRef.current.position.z = targetZ
    }

    // Spreader Y movement
    const sy = spreaderRef.current.position.y
    const dy = targetSpreaderY - sy
    const spreaderSpeed = delta * 12
    const arrivedY = Math.abs(dy) <= 0.1
    if (!arrivedY) {
      spreaderRef.current.position.y += Math.sign(dy) * Math.min(spreaderSpeed, Math.abs(dy))
    } else {
      spreaderRef.current.position.y = targetSpreaderY
    }

    // Sync spreader & cables Z with trolley
    const trolleyZ = trolleyRef.current.position.z
    spreaderRef.current.position.z = trolleyZ

    // Update cable lengths
    const trolleyBaseY = LEG_HEIGHT - BEAM_HEIGHT - TROLLEY_H
    const cableLen = trolleyBaseY - spreaderRef.current.position.y - SPREADER_H / 2
    if (cable1Ref.current && cable2Ref.current && cableLen > 0) {
      cable1Ref.current.scale.y = cableLen
      cable1Ref.current.position.set(SPREADER_W / 2 - 0.3, spreaderRef.current.position.y + SPREADER_H / 2 + cableLen / 2, trolleyZ)
      cable2Ref.current.scale.y = cableLen
      cable2Ref.current.position.set(-(SPREADER_W / 2 - 0.3), spreaderRef.current.position.y + SPREADER_H / 2 + cableLen / 2, trolleyZ)
    }

    // Publish real-time position for ContainerBox to follow
    if (positionRef) {
      positionRef.current.x = groupRef.current.position.x
      positionRef.current.y = spreaderRef.current.position.y - SPREADER_H / 2
      positionRef.current.z = trolleyZ
      positionRef.current.phase = target.phase
      positionRef.current.arrivedX = arrivedX
      positionRef.current.arrivedZ = arrivedZ
      positionRef.current.arrivedY = arrivedY
    }
  })

  const centerZ = ((rows - 1) * SZ) / 2
  const legOffsetZ = spanZ / 2

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Left leg */}
      <mesh position={[0, LEG_HEIGHT / 2, centerZ - legOffsetZ]}>
        <boxGeometry args={[LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH]} />
        <meshStandardMaterial color={CRANE_COLOR} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Right leg */}
      <mesh position={[0, LEG_HEIGHT / 2, centerZ + legOffsetZ]}>
        <boxGeometry args={[LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH]} />
        <meshStandardMaterial color={CRANE_COLOR} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Crossbeam */}
      <mesh position={[0, LEG_HEIGHT - BEAM_HEIGHT / 2, centerZ]}>
        <boxGeometry args={[2.0, BEAM_HEIGHT, spanZ]} />
        <meshStandardMaterial color={ACCENT_COLOR} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Top rail (decorative) */}
      <mesh position={[0, LEG_HEIGHT + 0.3, centerZ]}>
        <boxGeometry args={[1.2, 0.6, spanZ + 2]} />
        <meshStandardMaterial color={CRANE_COLOR} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Trolley (moves along Z on the crossbeam) */}
      <group ref={trolleyRef} position={[0, LEG_HEIGHT - BEAM_HEIGHT - TROLLEY_H / 2, 0]}>
        <mesh>
          <boxGeometry args={[TROLLEY_W, TROLLEY_H, TROLLEY_D]} />
          <meshStandardMaterial color={ACCENT_COLOR} metalness={0.3} roughness={0.6} />
        </mesh>
      </group>

      {/* Cables */}
      <mesh ref={cable1Ref} position={[0, restY / 2 + 5, 0]}>
        <cylinderGeometry args={[CABLE_RADIUS, CABLE_RADIUS, 1, 6]} />
        <meshStandardMaterial color="#8899aa" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh ref={cable2Ref} position={[0, restY / 2 + 5, 0]}>
        <cylinderGeometry args={[CABLE_RADIUS, CABLE_RADIUS, 1, 6]} />
        <meshStandardMaterial color="#8899aa" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Spreader */}
      <group ref={spreaderRef} position={[0, restY, 0]}>
        <mesh>
          <boxGeometry args={[SPREADER_W, SPREADER_H, SPREADER_D]} />
          <meshStandardMaterial color={SPREADER_COLOR} metalness={0.4} roughness={0.5} emissive={SPREADER_COLOR} emissiveIntensity={0.15} />
        </mesh>
        {/* Corner locks */}
        {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([xm, zm], i) => (
          <mesh key={i} position={[xm * (SPREADER_W / 2 - 0.2), -SPREADER_H / 2 - 0.15, zm * (SPREADER_D / 2 - 0.15)]}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#C94F4F" metalness={0.3} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
