import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Container3D } from '../types/api'

// Real 20ft container proportions (scaled)
const CONTAINER_W = 5.8 // X — along bay
const CONTAINER_H = 2.4 // Y — height
const CONTAINER_D = 2.2 // Z — along row

const LERP_SPEED = 3.0 // units per second factor

interface Props {
  data: Container3D
  highlight?: boolean
  removing?: boolean
  onClick?: (c: Container3D) => void
}

export function ContainerBox({ data, highlight, removing, onClick }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const currentPos = useRef(new THREE.Vector3(data.x, data.y + CONTAINER_H / 2, data.z))
  const targetPos = useRef(new THREE.Vector3(data.x, data.y + CONTAINER_H / 2, data.z))
  const [isAnimating, setIsAnimating] = useState(false)

  // Update target when data changes
  useEffect(() => {
    const newTarget = new THREE.Vector3(data.x, data.y + CONTAINER_H / 2, data.z)
    const dist = targetPos.current.distanceTo(newTarget)
    targetPos.current.copy(newTarget)
    if (dist > 0.1) {
      setIsAnimating(true)
    }
  }, [data.x, data.y, data.z])

  useFrame((_, delta) => {
    if (!meshRef.current) return

    const target = targetPos.current
    const current = currentPos.current

    if (isAnimating) {
      // Animate: lift up, move horizontally, then drop down
      const dist = current.distanceTo(target)
      if (dist < 0.05) {
        current.copy(target)
        meshRef.current.position.copy(current)
        setIsAnimating(false)
        return
      }

      // Smooth arc movement
      const liftHeight = 20 // lift above everything
      const dx = target.x - current.x
      const dy = target.y - current.y
      const dz = target.z - current.z
      const horizDist = Math.sqrt(dx * dx + dz * dz)

      if (horizDist > 0.5 && current.y < liftHeight) {
        // Phase 1: lift up
        current.y = Math.min(current.y + delta * 30, liftHeight)
      } else if (horizDist > 0.5) {
        // Phase 2: move horizontally
        const speed = delta * LERP_SPEED * 15
        current.x += (dx / horizDist) * Math.min(speed, horizDist)
        current.z += (dz / horizDist) * Math.min(speed, horizDist)
      } else {
        // Phase 3: drop down
        current.y += (target.y - current.y) * Math.min(delta * 5, 1)
        current.x = target.x
        current.z = target.z
      }

      meshRef.current.position.copy(current)
    } else {
      // Static: just follow highlight bounce
      if (highlight) {
        meshRef.current.position.y = target.y + Math.sin(Date.now() * 0.005) * 0.15
      } else {
        meshRef.current.position.copy(target)
        current.copy(target)
      }
    }
  })

  const color = new THREE.Color(data.color)
  if (hovered) color.offsetHSL(0, 0, 0.15)
  if (removing) color.offsetHSL(0, 0.3, -0.1)

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[data.x, data.y + CONTAINER_H / 2, data.z]}
        onClick={() => onClick?.(data)}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default' }}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[CONTAINER_W, CONTAINER_H, CONTAINER_D]} />
        <meshStandardMaterial
          color={color}
          metalness={0.3}
          roughness={0.6}
          transparent={highlight || removing || isAnimating}
          opacity={removing ? 0.5 : isAnimating ? 0.9 : highlight ? 0.85 : 1}
        />
      </mesh>

      {/* Container ribs (visual detail) */}
      {!isAnimating && [-1.8, -0.6, 0.6, 1.8].map((xOff, i) => (
        <mesh
          key={i}
          position={[data.x + xOff, data.y + CONTAINER_H / 2, data.z + CONTAINER_D / 2 + 0.01]}
        >
          <boxGeometry args={[0.08, CONTAINER_H * 0.85, 0.02]} />
          <meshStandardMaterial color={color.clone().offsetHSL(0, 0, -0.15)} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}

      {/* ID label on hover */}
      {hovered && !isAnimating && (
        <Html
          position={[data.x, data.y + CONTAINER_H + 1.2, data.z]}
          center
          distanceFactor={80}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-accent)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--text-primary)',
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ color: 'var(--brand-primary)', fontWeight: 700, marginBottom: 2 }}>
              #{data.id}
            </div>
            <div>Bay {data.bay} · Row {data.row} · Tier {data.tier}</div>
            <div style={{ color: data.color, fontWeight: 600 }}>{data.weight_class} · {data.flow_type}</div>
          </div>
        </Html>
      )}

      {/* Animating label */}
      {isAnimating && (
        <Html
          position={[currentPos.current.x, currentPos.current.y + CONTAINER_H, currentPos.current.z]}
          center
          distanceFactor={80}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'var(--error)',
            borderRadius: 4,
            padding: '3px 8px',
            color: '#fff',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            #{data.id} MOVENDO
          </div>
        </Html>
      )}

      {/* Highlight glow ring */}
      {highlight && !isAnimating && (
        <mesh position={[data.x, data.y + 0.05, data.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.8, 32]} />
          <meshBasicMaterial color="#7BB3CC" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Removing glow ring (red) */}
      {removing && !isAnimating && (
        <mesh position={[data.x, data.y + 0.05, data.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.8, 32]} />
          <meshBasicMaterial color="#C94F4F" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}
