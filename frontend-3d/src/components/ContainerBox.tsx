import { useRef, useState, useEffect, type MutableRefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Container3D } from '../types/api'
import type { RTGPositionRef } from './RTGCrane'

// Real 20ft container proportions (scaled)
const CONTAINER_W = 5.8 // X — along bay
const CONTAINER_H = 2.4 // Y — height
const CONTAINER_D = 2.2 // Z — along row

interface Props {
  data: Container3D
  highlight?: boolean
  removing?: boolean
  xrayMode?: boolean
  simulatedHours?: number
  carriedByRtg?: boolean
  dimmed?: boolean
  heatmapMode?: boolean
  rtgPositionRef?: MutableRefObject<RTGPositionRef>
  onClick?: (c: Container3D) => void
  is2D?: boolean
  maxTier?: number | null
}

export function ContainerBox({ data, highlight, removing, xrayMode, simulatedHours, carriedByRtg, dimmed, heatmapMode, rtgPositionRef, onClick, is2D, maxTier }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const currentPos = useRef(new THREE.Vector3(data.x, data.y + CONTAINER_H / 2, data.z))
  const targetPos = useRef(new THREE.Vector3(data.x, data.y + CONTAINER_H / 2, data.z))
  const [isAnimating, setIsAnimating] = useState(false)
  const wasCarried = useRef(false)

  // Update target when data changes
  useEffect(() => {
    const newTarget = new THREE.Vector3(data.x, data.y + CONTAINER_H / 2, data.z)
    const dist = targetPos.current.distanceTo(newTarget)
    targetPos.current.copy(newTarget)

    // If container was just released by RTG, snap to final position (no animation)
    if (wasCarried.current && !carriedByRtg) {
      currentPos.current.copy(newTarget)
      wasCarried.current = false
      return
    }
    wasCarried.current = !!carriedByRtg

    // Only trigger independent animation if NOT carried by RTG
    if (dist > 0.1 && !carriedByRtg) {
      setIsAnimating(true)
    }
  }, [data.x, data.y, data.z, carriedByRtg])

  useFrame((_, delta) => {
    if (!meshRef.current) return

    const target = targetPos.current
    const current = currentPos.current

    if (carriedByRtg && rtgPositionRef) {
      // Follow RTG spreader position exactly
      const rtg = rtgPositionRef.current
      current.x = rtg.x
      current.z = rtg.z
      // Container hangs below spreader
      current.y = rtg.y - CONTAINER_H / 2
      meshRef.current.position.copy(current)
      setIsAnimating(false)
      return
    }

    if (isAnimating) {
      // Independent animation (gate-in drop, etc.)
      const dist = current.distanceTo(target)
      if (dist < 0.05) {
        current.copy(target)
        meshRef.current.position.copy(current)
        setIsAnimating(false)
        return
      }

      // Smooth arc movement
      const liftHeight = 20
      const dx = target.x - current.x
      const dz = target.z - current.z
      const horizDist = Math.sqrt(dx * dx + dz * dz)

      if (horizDist > 0.5 && current.y < liftHeight) {
        // Phase 1: lift up
        current.y = Math.min(current.y + delta * 12, liftHeight)
      } else if (horizDist > 0.5) {
        // Phase 2: move horizontally
        const speed = delta * 18
        current.x += (dx / horizDist) * Math.min(speed, horizDist)
        current.z += (dz / horizDist) * Math.min(speed, horizDist)
      } else {
        // Phase 3: drop down
        current.y += (target.y - current.y) * Math.min(delta * 10, 1)
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

  // X-Ray: fade non-ground containers
  const isXrayed = xrayMode && data.tier > 0

  // Time travel: urgency based on departure
  let urgency = 0
  if (simulatedHours && simulatedHours > 0 && data.departure_time) {
    const simTime = Date.now() + simulatedHours * 3600_000
    const depTime = new Date(data.departure_time).getTime()
    const hoursLeft = (depTime - simTime) / 3600_000
    if (hoursLeft < 0) urgency = 1.0
    else if (hoursLeft < 6) urgency = 1 - hoursLeft / 6
  }

  const color = new THREE.Color(data.color)
  if (hovered) color.offsetHSL(0, 0, 0.15)
  if (removing) color.offsetHSL(0, 0.3, -0.1)
  if (urgency > 0) color.lerp(new THREE.Color('#C94F4F'), urgency * 0.7)

  const animOrCarried = isAnimating || carriedByRtg
  const needsTransparency = highlight || removing || animOrCarried || isXrayed || urgency > 0 || dimmed
  let finalOpacity = 1
  if (dimmed) finalOpacity = 0.12
  else if (isXrayed) finalOpacity = 0.12
  else if (removing) finalOpacity = 0.5
  else if (highlight) finalOpacity = 0.85

  const isVisible = maxTier == null || data.tier <= maxTier;
  const htmlProps80 = is2D ? {} : { distanceFactor: 80 };
  const htmlProps100 = is2D ? {} : { distanceFactor: 100 };

  return (
    <group visible={isVisible}>
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
        {(isXrayed || dimmed || heatmapMode) ? (
          <meshBasicMaterial
            color="#84B8D9"
            wireframe
            transparent
            opacity={0.25}
          />
        ) : (
          <meshStandardMaterial
            color={color}
            metalness={0.3}
            roughness={0.6}
            transparent={needsTransparency}
            opacity={finalOpacity}
            depthWrite={!needsTransparency}
            emissive={urgency > 0.5 ? '#C94F4F' : '#000000'}
            emissiveIntensity={urgency > 0.5 ? 0.3 : 0}
          />
        )}
      </mesh>

      {/* Container ribs (visual detail) */}
      {!animOrCarried && !isXrayed && !dimmed && !heatmapMode && [-1.8, -0.6, 0.6, 1.8].map((xOff, i) => (
        <mesh
          key={i}
          position={[data.x + xOff, data.y + CONTAINER_H / 2, data.z + CONTAINER_D / 2 + 0.01]}
        >
          <boxGeometry args={[0.08, CONTAINER_H * 0.85, 0.02]} />
          <meshStandardMaterial color={color.clone().offsetHSL(0, 0, -0.15)} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}

      {/* ID label on hover */}
      {hovered && !animOrCarried && (
        <Html
          position={[data.x, data.y + CONTAINER_H + 1.2, data.z]}
          center
          {...htmlProps80}
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
      {animOrCarried && (
        <Html
          position={[currentPos.current.x, currentPos.current.y + CONTAINER_H, currentPos.current.z]}
          center
          {...htmlProps80}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'var(--error)',
            borderRadius: 4,
            padding: '3px 8px',
            color: '#fff',
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            #{data.id} MOVENDO
          </div>
        </Html>
      )}

      {/* Highlight glow ring */}
      {highlight && !animOrCarried && (
        <mesh position={[data.x, data.y + 0.05, data.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.8, 32]} />
          <meshBasicMaterial color="#84B8D9" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Removing glow ring (red) */}
      {removing && !animOrCarried && (
        <mesh position={[data.x, data.y + 0.05, data.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.8, 32]} />
          <meshBasicMaterial color="#C94F4F" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* IMO hazard indicator */}
      {data.imo_class && !animOrCarried && !isXrayed && (
        <Html
          position={[data.x + CONTAINER_W / 2 - 0.5, data.y + CONTAINER_H + 0.3, data.z]}
          center
          {...htmlProps100}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: '#E8A838',
            borderRadius: '50%',
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000',
            border: '1.5px solid #C94F4F',
          }}>
            <AlertTriangle size={9} strokeWidth={2} color="#000" />
          </div>
        </Html>
      )}

      {/* Reefer indicator */}
      {data.is_reefer && !animOrCarried && !isXrayed && (
        <mesh position={[data.x, data.y + CONTAINER_H + 0.15, data.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 2.0, 6]} />
          <meshBasicMaterial color="#84B8D9" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}
