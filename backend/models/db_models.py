from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, Index,
)
from sqlalchemy.orm import DeclarativeBase, relationship
from datetime import datetime, timezone


class Base(DeclarativeBase):
    pass


class Block(Base):
    __tablename__ = "blocks"

    id = Column(Integer, primary_key=True)
    block_name = Column(String(10), unique=True, nullable=False)
    num_bays = Column(Integer, nullable=False)
    num_rows = Column(Integer, nullable=False)
    max_tiers = Column(Integer, nullable=False)
    reefer_bays = Column(JSON, nullable=True)  # list of {bay, row} with reefer outlets
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)

    containers = relationship("Container", back_populates="block")


class Container(Base):
    __tablename__ = "containers"

    id = Column(Integer, primary_key=True)
    container_id = Column(Integer, unique=True, nullable=False)
    block_id = Column(Integer, ForeignKey("blocks.id"))
    weight_class = Column(String(10), nullable=False)
    weight_kg = Column(Integer, nullable=False)
    departure_time = Column(DateTime(timezone=True), nullable=False)
    flow_type = Column(String(10), nullable=False)
    is_reefer = Column(Boolean, default=False)
    imo_class = Column(String(5), nullable=True)
    bay = Column(Integer)
    row = Column(Integer)
    tier = Column(Integer)
    arrival_time = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)
    removed_at = Column(DateTime(timezone=True))

    block = relationship("Block", back_populates="containers")

    __table_args__ = (
        Index("idx_containers_active", "block_id", "is_active"),
        Index("idx_containers_position", "block_id", "bay", "row", "tier"),
        Index("idx_containers_departure", "departure_time"),
    )


class AllocationLog(Base):
    __tablename__ = "allocation_log"

    id = Column(Integer, primary_key=True)
    container_id = Column(Integer, nullable=False)
    block_id = Column(Integer, ForeignKey("blocks.id"))
    assigned_bay = Column(Integer, nullable=False)
    assigned_row = Column(Integer, nullable=False)
    assigned_tier = Column(Integer, nullable=False)
    cost_score = Column(Float, nullable=False)
    cost_reshuffle = Column(Float)
    cost_weight = Column(Float)
    cost_distance = Column(Float)
    cost_grouping = Column(Float)
    alternatives = Column(JSON)
    optimizer_type = Column(String(20), default="greedy")
    computation_ms = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_alloc_log_time", "created_at"),
    )


class RTGMission(Base):
    __tablename__ = "rtg_missions"

    id = Column(Integer, primary_key=True)
    mission_id = Column(String(30), unique=True, nullable=False)
    mission_type = Column(String(20), nullable=False)
    container_id = Column(Integer, nullable=False)
    block_id = Column(Integer, ForeignKey("blocks.id"))
    steps = Column(JSON, nullable=False)
    total_time_s = Column(Integer)
    rtg_start_pos = Column(JSON)
    rtg_end_pos = Column(JSON)
    status = Column(String(20), default="PENDING")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True))
