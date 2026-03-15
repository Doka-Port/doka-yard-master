"""Popula o pátio com dados realistas via API."""

import random
import asyncio
from datetime import datetime, timedelta, timezone

import httpx

BASE_URL = "http://localhost:8000/api/v1"


async def seed():
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Inicializar pátio
        print("Inicializando pátio...")
        resp = await client.post(f"{BASE_URL}/patio/inicializar", json={
            "num_bays": 30, "num_rows": 6, "max_tiers": 5, "block_name": "A1"
        })
        print(f"  → {resp.status_code}: {resp.json()['status']}")

        # 2. Gerar contentores
        n_containers = 250
        now = datetime.now(timezone.utc)
        scores = []
        errors = 0

        print(f"Alocando {n_containers} contentores...")
        for i in range(1, n_containers + 1):
            # Distribuição realista
            r = random.random()
            if r < 0.30:
                weight_class = "HEAVY"
                weight_kg = random.randint(24001, 34000)
            elif r < 0.75:
                weight_class = "MEDIUM"
                weight_kg = random.randint(12001, 24000)
            else:
                weight_class = "LIGHT"
                weight_kg = random.randint(2000, 12000)

            flow_type = "IMPORT" if random.random() < 0.60 else "EXPORT"

            # departure_time: 1-14 dias, normal centrada em 5
            days = max(1, min(14, int(random.gauss(5, 3))))
            departure = now + timedelta(days=days, hours=random.randint(0, 23))

            payload = {
                "container_id": i,
                "weight_class": weight_class,
                "weight_kg": weight_kg,
                "departure_time": departure.isoformat(),
                "flow_type": flow_type,
                "rtg_position": [random.randint(0, 29), random.randint(0, 5)],
            }

            resp = await client.post(f"{BASE_URL}/otimizador/alocacao", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                scores.append(data["cost_score"])
                if i % 50 == 0:
                    print(f"  [{i}/{n_containers}] score={data['cost_score']:.3f} pos={data['assigned_position']}")
            else:
                errors += 1
                if resp.status_code == 503:
                    print(f"  [{i}] Pátio cheio! Parando.")
                    break
                print(f"  [{i}] Erro {resp.status_code}: {resp.text}")

        # 3. Estatísticas
        print(f"\n{'='*50}")
        print(f"Contentores alocados: {len(scores)}")
        print(f"Erros: {errors}")
        if scores:
            print(f"Score médio: {sum(scores)/len(scores):.4f}")
            print(f"Score min: {min(scores):.4f}")
            print(f"Score max: {max(scores):.4f}")

        # Estado final
        resp = await client.get(f"{BASE_URL}/patio/estado", params={"block_name": "A1"})
        if resp.status_code == 200:
            data = resp.json()
            print(f"Ocupação: {data['occupancy_rate']*100:.1f}%")
            print(f"Total contentores: {data['total_containers']}")


if __name__ == "__main__":
    asyncio.run(seed())
