# PA Creator MVP Implementation Plan

The plan is dependency- and gate-based. It intentionally contains no calendar
duration.

## P0 — Requirements and Knowledge Baseline

Freeze product decisions, sources, acceptance criteria, and change control.

## P1 — Host Integration Boundary

Identify Workbench, Chat Editor, Agent Host, Proxy, storage, profile, menu, and
test extension points. Land a low-risk PA Registry service contract and a Chat
Editor title action that proves the contribution chain.

## P2 — Domain Contracts

Add Zod schemas and validators for manifests, versions, activities, checks,
data objects, runs, checkpoints, and artifacts.

## P3 — Local Registry and State

Add profile-scoped SQLite migrations, repositories, immutable package paths,
publication state, checkpoints, and audit indexes.

## P4 — PA Runtime

Add AA scheduling, CA gates, bounded correction, checkpoint recovery, and
idempotent side-effect handling over Codex Agent Host.

## P5 — PA Plaza and Personal Creation

Replace the P1 quick-pick scaffold with the final plaza surface and add the
profile-scoped PA/Skill management view.

## P6 — PA Creator Workflow

Implement the nine AAs, four user confirmation cards, progress presentation,
detail artifacts, and incremental invalidation.

## P7 — Packaging, Publication, and Versioning

Implement package validation, atomic registration, Workbench refresh, import,
export, update prompts, rollback, publish, unpublish, and guarded deletion.

## P8 — Bootstrap Acceptance

Use PA Creator to create and publish another PA Creator, then start the newly
published module.

## P9 — Release Baseline

Freeze migrations and package compatibility, validate development and Windows
product builds, and publish release and rollback documentation.
