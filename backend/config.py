import os
from dotenv import load_dotenv

load_dotenv()

# ─── Database ───
# Suporta PostgreSQL (produção) ou SQLite (dev/demo)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./yard_optimizer.db"
)
DATABASE_URL_SYNC = DATABASE_URL.replace("+asyncpg", "+psycopg2").replace("+aiosqlite", "")

DB_POOL_SIZE = 10
DB_MAX_OVERFLOW = 20

# Dimensões default do pátio
DEFAULT_BAYS = 30
DEFAULT_ROWS = 6
DEFAULT_MAX_TIERS = 5

# Pesos da função de custo (somam 1.0)
WEIGHT_RESHUFFLE = 0.50
WEIGHT_GRAVITY = 0.25
WEIGHT_DISTANCE = 0.15
WEIGHT_GROUPING = 0.10

# PSO
PSO_PARTICLES = 20
PSO_ITERATIONS = 30
PSO_C1 = 1.5
PSO_C2 = 1.5
PSO_W = 0.7
PSO_USE_GREEDY_THRESHOLD = 30

# RTG timing (segundos)
RTG_MOVE_PER_BAY = 3
RTG_MOVE_PER_ROW = 2
RTG_LOWER_PER_TIER = 3
RTG_LOCK_TIME = 3
RTG_LIFT_TIME = 2

# Limites de peso por classe (kg)
WEIGHT_LIMITS = {
    "LIGHT": (0, 12000),
    "MEDIUM": (12001, 24000),
    "HEAVY": (24001, 34000),
}

# Dwell time default (dias)
DEFAULT_DWELL_DAYS = 7
